const BLOCKED = new Set(['canceled', 'unpaid', 'incomplete_expired']);

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

/**
 * One plan record for a user. Team billing wins over a leftover personal trial.
 * The UI reads the stored record only; this function is what writes that record.
 */
function derivePlan({ user, team, now = Date.now() }) {
  const billing = team?.billing || {};
  const teamStatus = billing.status || '';
  if ((teamStatus === 'active' || teamStatus === 'trialing') && (team?.id || billing.teamId)) {
    return {
      plan: 'premiumTeam',
      planName: billing.planName || 'Premium Team',
      status: teamStatus,
      source: 'team',
      teamId: team?.id || billing.teamId || null,
      stripeSubscriptionId: billing.stripeSubscriptionId || null,
      stripeCustomerId: billing.stripeCustomerId || null,
      currentPeriodEnd: billing.currentPeriodEnd || null,
      endDate: null,
    };
  }

  const sub = user?.subscription || {};
  const status = sub.status || '';
  const plan = sub.plan || 'trial';
  const blocked = BLOCKED.has(status);
  const paidPlan = plan !== 'trial' && !blocked;
  const paidStripe = Boolean(sub.stripeSubscriptionId) && !blocked;
  if (paidPlan || paidStripe) {
    return {
      plan: paidPlan ? plan : (sub.plan || 'paid'),
      planName: sub.planName || (paidPlan ? plan : 'Subscription'),
      status: status || 'active',
      source: sub.source === 'team' ? 'team' : 'stripe',
      teamId: sub.teamId || null,
      stripeSubscriptionId: sub.stripeSubscriptionId || null,
      stripeCustomerId: sub.stripeCustomerId || null,
      currentPeriodEnd: sub.currentPeriodEnd || null,
      endDate: sub.endDate || null,
    };
  }

  const endMs = toMillis(sub.endDate);
  const expired = Boolean(endMs) && endMs <= now;
  return {
    plan: 'trial',
    planName: 'Free trial',
    status: expired ? 'expired' : 'trialing',
    source: 'trial',
    teamId: null,
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    currentPeriodEnd: null,
    endDate: sub.endDate || null,
  };
}

module.exports = {
  BLOCKED,
  toMillis,
  derivePlan,
};
