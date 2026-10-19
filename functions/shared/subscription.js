const { HttpsError } = require('firebase-functions/v2/https');
const { admin } = require('./admin');

const BLOCKED_STATUSES = new Set(['canceled', 'unpaid', 'incomplete_expired']);

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  if (value instanceof Date) return value.getTime();
  return 0;
}

function subscriptionAllowsAccess(user, teamBillingStatus) {
  const sub = user?.subscription || {};
  const status = sub.status || '';
  const plan = sub.plan || 'trial';
  if (teamBillingStatus === 'active' || teamBillingStatus === 'trialing') return true;
  if (BLOCKED_STATUSES.has(status)) {
    const end = toMillis(sub.endDate);
    return Boolean(end) && end > Date.now();
  }
  if (sub.stripeSubscriptionId) return true;
  if (plan !== 'trial') return true;
  const end = toMillis(sub.endDate);
  if (!end) return true;
  return end > Date.now();
}

async function assertSubscriptionActive(uid) {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }
  const db = admin.firestore();
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.exists ? userSnap.data() : {};
  let teamStatus = '';
  if (user.teamId) {
    const teamSnap = await db.collection('teams').doc(user.teamId).get();
    teamStatus = teamSnap.exists ? teamSnap.data()?.billing?.status || '' : '';
  }
  if (!subscriptionAllowsAccess(user, teamStatus)) {
    throw new HttpsError(
      'failed-precondition',
      'Your free trial has ended. Add billing info to continue.',
    );
  }
}

module.exports = {
  toMillis,
  subscriptionAllowsAccess,
  assertSubscriptionActive,
};
