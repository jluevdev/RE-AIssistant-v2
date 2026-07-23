import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { getConfiguredPlans } from '../../config/stripe';
import { Badge, Button, Card, EmptyState, PageHeader, toast } from '../../components/ui';

export default function BillingPage() {
  const { currentUser, userProfile } = useAuth();
  const [loadingPlan, setLoadingPlan] = useState(null);
  const plans = getConfiguredPlans();
  const subscription = userProfile?.subscription;
  const planName = subscription?.planName || subscription?.plan || 'trial';
  const status = subscription?.status;

  async function startCheckout(plan) {
    if (!plan.id) {
      toast.error(`Missing Stripe price ID for ${plan.name}. Set VITE_STRIPE_PRICE_* in .env`);
      return;
    }

    setLoadingPlan(plan.key);
    try {
      const createCheckoutSession = httpsCallable(functions, 'createCheckoutSession');
      const { data } = await createCheckoutSession({
        priceId: plan.id,
        planName: plan.name,
        planKey: plan.key,
      });
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error('Checkout URL missing from response');
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error(error.message || 'Failed to start checkout');
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        icon={CreditCard}
        title="Billing"
        subtitle="Manage your subscription and plan."
        backTo="/dashboard"
        backLabel="Dashboard"
        actions={
          <Badge tone={status === 'active' || status === 'trialing' ? 'success' : 'neutral'}>
            {planName}
            {status ? ` · ${status}` : ''}
          </Badge>
        }
      />

      <Card>
        <p className="text-sm text-slate-500">Signed in as</p>
        <p className="font-medium text-slate-900">{currentUser?.email}</p>
        <p className="mt-2 text-sm text-slate-600">
          Current plan:{' '}
          <span className="font-medium capitalize">{planName}</span>
          {status ? ` (${status})` : ''}
        </p>
      </Card>

      {plans.length === 0 ? (
        <Card className="border-amber-200 bg-amber-50">
          <EmptyState
            title="No Stripe price IDs configured"
            description="Add VITE_STRIPE_PRICE_* values to .env (test mode prices)."
          />
        </Card>
      ) : (
        <div className="grid gap-4">
          {plans.map((plan) => (
            <Card key={plan.key} className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-slate-900">{plan.name}</h2>
                <p className="text-sm text-slate-600">${plan.price}/month</p>
              </div>
              <Button
                loading={loadingPlan === plan.key}
                disabled={loadingPlan === plan.key}
                onClick={() => startCheckout(plan)}
              >
                {loadingPlan === plan.key ? 'Redirecting…' : 'Upgrade'}
              </Button>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-500">
        Use Stripe test cards (e.g. 4242 4242 4242 4242). Webhook must point to the deployed `stripeWebhook` function URL.
      </p>
    </div>
  );
}
