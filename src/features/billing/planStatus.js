const BLOCKED = new Set(['canceled', 'unpaid', 'incomplete_expired']);
const DAY_MS = 24 * 60 * 60 * 1000;

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value._seconds === 'number') return new Date(value._seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function statusWord(status) {
  if (status === 'active') return 'Active';
  if (status === 'trialing') return 'Trialing';
  if (status === 'past_due') return 'Past due';
  if (status === 'canceled') return 'Canceled';
  if (status === 'expired') return 'Ended';
  return status || 'Active';
}

/**
 * Display state for the single subscriptions/{uid} record.
 * Callers must not mix this with a separate trial banner source.
 */
export function resolvePlanStatus(record, options = {}, now = Date.now()) {
  if (options.pending || !record) {
    return {
      paid: false,
      isTrial: false,
      expired: false,
      pending: true,
      daysLeft: null,
      plan: '',
      planName: 'Checking plan',
      status: '',
      label: 'Checking plan…',
      endDate: null,
    };
  }

  const plan = record.plan || 'trial';
  const status = record.status || '';
  const blocked = BLOCKED.has(status);
  if (plan !== 'trial' && blocked) {
    const planName = record.planName || plan;
    return {
      paid: false,
      isTrial: false,
      expired: true,
      pending: false,
      daysLeft: 0,
      plan,
      planName,
      status,
      label: `${planName} · ${statusWord(status)}`,
      endDate: null,
    };
  }
  const paid = !blocked && plan !== 'trial' && (
    status === 'active'
    || status === 'trialing'
    || status === 'past_due'
    || record.source === 'team'
    || record.source === 'stripe'
  );

  if (paid) {
    const planName = record.planName || plan;
    const shown = statusWord(status || 'active');
    return {
      paid: true,
      isTrial: false,
      expired: false,
      pending: false,
      daysLeft: null,
      plan,
      planName,
      status: status || 'active',
      label: `${planName} · ${shown}`,
      endDate: null,
    };
  }

  const end = toDate(record.endDate);
  if (!end) {
    return {
      paid: false,
      isTrial: true,
      expired: false,
      pending: false,
      daysLeft: 7,
      plan: 'trial',
      planName: 'Free trial',
      status: 'trialing',
      label: 'Free trial — 7 days left',
      endDate: null,
    };
  }

  const msLeft = end.getTime() - now;
  const expired = msLeft <= 0 || status === 'expired';
  const daysLeft = expired ? 0 : Math.max(1, Math.ceil(msLeft / DAY_MS));
  return {
    paid: false,
    isTrial: true,
    expired,
    pending: false,
    daysLeft,
    plan: 'trial',
    planName: 'Free trial',
    status: expired ? 'expired' : 'trialing',
    label: expired ? 'Free trial ended' : `Free trial — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`,
    endDate: end,
  };
}
