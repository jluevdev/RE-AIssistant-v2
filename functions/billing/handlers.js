const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { requireEnv } = require('../env');
const { admin } = require('../shared/admin');
const { getStripe, assertAllowedPriceId, getFrontendUrl } = require('./stripe');
const { derivePlan } = require('./planStatus');
const { writePlan, writeTeamMemberPlans } = require('./planRecord');

const BILLING_SECRETS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_SINGLE_AGENT',
  'STRIPE_PRICE_ALL_INCLUSIVE',
  'STRIPE_PRICE_ALL_INCLUSIVE_YEARLY',
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

      const userSnap = await admin.firestore().collection('users').doc(userId).get();
      const existingSub = userSnap.exists ? userSnap.data().subscription || {} : {};
      const endMs = existingSub.endDate?.toMillis?.()
        || (typeof existingSub.endDate?.seconds === 'number' ? existingSub.endDate.seconds * 1000 : 0);
      const trialElapsed = existingSub.plan === 'trial' && endMs > 0 && endMs <= Date.now();
      const subscriptionData = {
        metadata: {
          userId,
          planName,
          planKey: planKey || '',
        },
      };
      if (!trialElapsed) {
        subscriptionData.trial_period_days = 7;
      }

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
        subscription_data: subscriptionData,
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
  const kind = session.metadata?.kind || null;
  const teamId = session.metadata?.teamId || null;
  const seats = Number(session.metadata?.seats) || 1;

  if (kind === 'team' && teamId) {
    const teamRef = admin.firestore().collection('teams').doc(teamId);
    const teamSnap = await teamRef.get();
    const used = teamSnap.exists ? (teamSnap.data().seats?.used ?? teamSnap.data().memberCount ?? 1) : 1;
    await teamRef.set({
      billing: {
        plan: planKey || 'premiumTeam',
        planName: planName || 'Premium Team',
        status: 'active',
        stripeCustomerId: session.customer || null,
        stripeSubscriptionId: session.subscription || null,
        stripeSessionId: session.id,
        currentPeriodEnd: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      seats: {
        purchased: seats,
        used,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await writeTeamMemberPlans(admin.firestore(), teamId, {
      planName: planName || 'Premium Team',
      status: 'active',
      stripeCustomerId: session.customer || null,
      stripeSubscriptionId: session.subscription || null,
    });

    console.log(`Team checkout completed for team ${teamId} seats ${seats}`);
    return;
  }

  if (!userId) {
    console.warn('checkout.session.completed missing userId');
    return;
  }

  await writePlan(admin.firestore(), userId, {
    plan: planKey || planName,
    planName,
    status: 'active',
    source: 'stripe',
    stripeCustomerId: session.customer || null,
    stripeSubscriptionId: session.subscription || null,
  });

  console.log(`Checkout completed for user ${userId} plan ${planName}`);
}

async function handleSubscriptionCreated(subscription) {
  const teamId = subscription.metadata?.teamId;
  const kind = subscription.metadata?.kind;
  const seats = Number(subscription.metadata?.seats) || subscription.items?.data?.[0]?.quantity || 1;

  if (kind === 'team' && teamId) {
    const teamRef = admin.firestore().collection('teams').doc(teamId);
    const teamSnap = await teamRef.get();
    const used = teamSnap.exists ? (teamSnap.data().seats?.used ?? teamSnap.data().memberCount ?? 1) : 1;

    await teamRef.set({
      billing: {
        plan: subscription.metadata?.planKey || 'premiumTeam',
        planName: subscription.metadata?.planName || 'Premium Team',
        status: subscription.status || 'active',
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer || null,
        currentPeriodEnd: subscription.current_period_end || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      seats: {
        purchased: seats,
        used,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await writeTeamMemberPlans(admin.firestore(), teamId, {
      planName: subscription.metadata?.planName || 'Premium Team',
      status: subscription.status || 'active',
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer || null,
      currentPeriodEnd: subscription.current_period_end || null,
    });
    return;
  }

  const userId = subscription.metadata?.userId;
  if (!userId) return;

  await writePlan(admin.firestore(), userId, {
    plan: subscription.metadata?.planKey || subscription.metadata?.planName || 'paid',
    planName: subscription.metadata?.planName || subscription.metadata?.planKey || 'Subscription',
    status: subscription.status || 'active',
    source: 'stripe',
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: subscription.customer || null,
    currentPeriodEnd: subscription.current_period_end || null,
  });
}

async function handleSubscriptionUpdated(subscription) {
  const teamId = subscription.metadata?.teamId;
  const kind = subscription.metadata?.kind;
  const seats = Number(subscription.metadata?.seats) || subscription.items?.data?.[0]?.quantity || null;

  if (kind === 'team' && teamId) {
    const teamRef = admin.firestore().collection('teams').doc(teamId);
    const teamSnap = await teamRef.get();
    const previous = teamSnap.exists ? teamSnap.data() : {};
    const patch = {
      billing: {
        ...(previous.billing || {}),
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (seats) {
      patch.seats = {
        ...(previous.seats || {}),
        purchased: seats,
      };
    }
    await teamRef.set(patch, { merge: true });
    await writeTeamMemberPlans(admin.firestore(), teamId, {
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end || null,
      planName: subscription.metadata?.planName || 'Premium Team',
    });
    return;
  }

  const userId = subscription.metadata?.userId;
  if (!userId) return;

  const existing = await admin.firestore().collection('subscriptions').doc(userId).get();
  const prior = existing.exists ? existing.data() : {};
  await writePlan(admin.firestore(), userId, {
    ...prior,
    status: subscription.status,
    currentPeriodEnd: subscription.current_period_end || null,
    source: prior.source || 'stripe',
    plan: prior.plan || subscription.metadata?.planKey || 'paid',
    planName: prior.planName || subscription.metadata?.planName || 'Subscription',
  });
}

async function handleSubscriptionDeleted(subscription) {
  const teamId = subscription.metadata?.teamId;
  const kind = subscription.metadata?.kind;

  if (kind === 'team' && teamId) {
    await admin.firestore().collection('teams').doc(teamId).set({
      billing: {
        status: 'canceled',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await writeTeamMemberPlans(admin.firestore(), teamId, {
      status: 'canceled',
      planName: subscription.metadata?.planName || 'Premium Team',
    });
    return;
  }

  const userId = subscription.metadata?.userId;
  if (!userId) return;

  const existing = await admin.firestore().collection('subscriptions').doc(userId).get();
  const prior = existing.exists ? existing.data() : {};
  await writePlan(admin.firestore(), userId, {
    ...prior,
    status: 'canceled',
    source: prior.source || 'stripe',
    plan: prior.plan || 'paid',
    planName: prior.planName || 'Subscription',
  });
}

async function handleInvoicePaymentSucceeded(invoice) {
  if (!invoice.subscription) return;
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
  const userId = subscription.metadata?.userId;
  if (!userId) return;

  if (subscription.metadata?.kind === 'team' && subscription.metadata?.teamId) {
    await writeTeamMemberPlans(admin.firestore(), subscription.metadata.teamId, {
      status: 'active',
      planName: subscription.metadata?.planName || 'Premium Team',
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer || null,
      currentPeriodEnd: subscription.current_period_end || null,
    });
    return;
  }
  const existing = await admin.firestore().collection('subscriptions').doc(userId).get();
  const prior = existing.exists ? existing.data() : {};
  await writePlan(admin.firestore(), userId, {
    ...prior,
    status: 'active',
    source: prior.source || 'stripe',
    plan: prior.plan || subscription.metadata?.planKey || 'paid',
    planName: prior.planName || subscription.metadata?.planName || 'Subscription',
    stripeSubscriptionId: subscription.id,
    currentPeriodEnd: subscription.current_period_end || null,
  });
}

async function handleInvoicePaymentFailed(invoice) {
  if (!invoice.subscription) return;
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
  const userId = subscription.metadata?.userId;
  if (!userId) return;

  const existing = await admin.firestore().collection('subscriptions').doc(userId).get();
  const prior = existing.exists ? existing.data() : {};
  await writePlan(admin.firestore(), userId, {
    ...prior,
    status: 'past_due',
    source: prior.source || 'stripe',
    plan: prior.plan || 'paid',
    planName: prior.planName || 'Subscription',
  });
}

exports.ensurePlanRecord = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be authenticated');
  const uid = request.auth.uid;
  const db = admin.firestore();
  const existing = await db.collection('subscriptions').doc(uid).get();
  if (existing.exists && existing.data()?.source) {
    const data = existing.data();
    return {
      plan: data.plan,
      planName: data.planName,
      status: data.status,
      source: data.source,
      endDate: data.endDate || null,
      teamId: data.teamId || null,
    };
  }
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.exists ? userSnap.data() : {};
  let team = null;
  if (user.teamId) {
    const teamSnap = await db.collection('teams').doc(user.teamId).get();
    if (teamSnap.exists) team = { id: teamSnap.id, ...teamSnap.data() };
  }
  const derived = derivePlan({ user, team });
  await writePlan(db, uid, derived);
  return derived;
});
