const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { admin } = require('../shared/admin');
const { writePlan } = require('../billing/planRecord');

const TRIAL_MS = 7 * 24 * 60 * 60 * 1000;

exports.stampTrialOnUserCreate = onDocumentCreated('users/{userId}', async (event) => {
  const snap = event.data;
  if (!snap) return;

  const data = snap.data() || {};
  const sub = data.subscription || {};
  if (sub.stripeSubscriptionId) return;
  if (sub.plan && sub.plan !== 'trial') return;
  if (sub.source === 'server' && sub.endDate) return;

  const now = admin.firestore.Timestamp.now();
  const end = admin.firestore.Timestamp.fromMillis(now.toMillis() + TRIAL_MS);
  await writePlan(admin.firestore(), event.params.userId, {
    plan: 'trial',
    planName: 'Free trial',
    status: 'trialing',
    source: 'trial',
    endDate: end,
  });
});
