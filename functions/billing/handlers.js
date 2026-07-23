const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { requireEnv } = require('../env');
const { admin } = require('../shared/admin');
const { getStripe, assertAllowedPriceId, getFrontendUrl } = require('./stripe');

const BILLING_SECRETS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_SINGLE_AGENT',
  'STRIPE_PRICE_ALL_INCLUSIVE',
  'STRIPE_PRICE_PREMIUM_TEAM',
  'FRONTEND_URL',
];

exports.createCheckoutSession = onCall(
  { secrets: BILLING_SECRETS },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Must be authenticated');
      }

      const { priceId, planName, planKey } = request.data || {};
      if (!priceId || !planName) {
        throw new HttpsError('invalid-argument', 'priceId and planName are required');
      }

      assertAllowedPriceId(priceId);

      const userId = request.auth.uid;
      const userEmail = request.auth.token.email;
      if (!userEmail) {
        throw new HttpsError('failed-precondition', 'Signed-in user must have an email');
      }

      const stripe = getStripe();
      const frontendUrl = getFrontendUrl();

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: `${frontendUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/billing`,
        customer_email: userEmail,
        client_reference_id: userId,
        metadata: {
          userId,
          planName,
          planKey: planKey || '',
        },
        subscription_data: {
          metadata: {
            userId,
            planName,
            planKey: planKey || '',
          },
          trial_period_days: 7,
        },
      });

      return { success: true, url: session.url, sessionId: session.id };
    } catch (error) {
      console.error('createCheckoutSession error:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', error.message || 'Failed to create checkout session');
    }
  }
);

exports.stripeWebhook = onRequest(
  { secrets: BILLING_SECRETS },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    const stripe = getStripe();
    const endpointSecret = requireEnv('STRIPE_WEBHOOK_SECRET');
    const signature = req.headers['stripe-signature'];

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, signature, endpointSecret);
    } catch (error) {
      console.error('Stripe webhook signature verification failed:', error.message);
      res.status(400).send(`Webhook Error: ${error.message}`);
      return;
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutSessionCompleted(event.data.object);
          break;
        case 'customer.subscription.created':
          await handleSubscriptionCreated(event.data.object);
          break;
        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event.data.object);
          break;
        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object);
          break;
        case 'invoice.payment_succeeded':
          await handleInvoicePaymentSucceeded(event.data.object);
          break;
        case 'invoice.payment_failed':
          await handleInvoicePaymentFailed(event.data.object);
          break;
        default:
          console.log(`Unhandled Stripe event type: ${event.type}`);
      }
      res.json({ received: true });
    } catch (error) {
      console.error('Stripe webhook handler error:', error);
      res.status(500).send('Webhook handler failed');
    }
  }
);

async function handleCheckoutSessionCompleted(session) {
  const userId = session.metadata?.userId || session.client_reference_id;
  const planName = session.metadata?.planName || 'Unknown';
  const planKey = session.metadata?.planKey || null;
  if (!userId) {
    console.warn('checkout.session.completed missing userId');
    return;
  }

  await admin.firestore().collection('users').doc(userId).set({
    subscription: {
      status: 'active',
      plan: planKey || planName,
      planName,
      stripeCustomerId: session.customer || null,
      stripeSubscriptionId: session.subscription || null,
      stripeSessionId: session.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log(`Checkout completed for user ${userId} plan ${planName}`);
}

async function handleSubscriptionCreated(subscription) {
  const userId = subscription.metadata?.userId;
  if (!userId) return;

  await admin.firestore().collection('users').doc(userId).set({
    subscription: {
      status: subscription.status || 'active',
      planName: subscription.metadata?.planName || null,
      plan: subscription.metadata?.planKey || subscription.metadata?.planName || null,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer || null,
      currentPeriodEnd: subscription.current_period_end || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function handleSubscriptionUpdated(subscription) {
  const userId = subscription.metadata?.userId;
  if (!userId) return;

  await admin.firestore().collection('users').doc(userId).set({
    subscription: {
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function handleSubscriptionDeleted(subscription) {
  const userId = subscription.metadata?.userId;
  if (!userId) return;

  await admin.firestore().collection('users').doc(userId).set({
    subscription: {
      status: 'canceled',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function handleInvoicePaymentSucceeded(invoice) {
  if (!invoice.subscription) return;
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
  const userId = subscription.metadata?.userId;
  if (!userId) return;

  await admin.firestore().collection('users').doc(userId).set({
    subscription: {
      status: 'active',
      currentPeriodEnd: subscription.current_period_end || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function handleInvoicePaymentFailed(invoice) {
  if (!invoice.subscription) return;
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
  const userId = subscription.metadata?.userId;
  if (!userId) return;

  await admin.firestore().collection('users').doc(userId).set({
    subscription: {
      status: 'past_due',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}
