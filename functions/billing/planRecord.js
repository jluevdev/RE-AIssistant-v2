const { admin } = require('../shared/admin');
function planDocument(input) {
  return {
    plan: input.plan || 'trial',
    planName: input.planName || 'Free trial',
    status: input.status || 'trialing',
    source: input.source || 'trial',
    stripeSubscriptionId: input.stripeSubscriptionId || null,
    stripeCustomerId: input.stripeCustomerId || null,
    teamId: input.teamId || null,
    currentPeriodEnd: input.currentPeriodEnd || null,
    endDate: input.endDate || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function writePlan(db, uid, input) {
  const record = planDocument(input);
  await db.collection('subscriptions').doc(uid).set(record);
  await db.collection('users').doc(uid).set({
    subscription: record,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return record;
}

async function writeTeamMemberPlans(db, teamId, billing) {
  const teamRef = db.collection('teams').doc(teamId);
  const teamSnap = await teamRef.get();
  const team = teamSnap.exists ? { id: teamSnap.id, ...teamSnap.data() } : { id: teamId };
  const plan = {
    plan: 'premiumTeam',
    planName: billing.planName || team.billing?.planName || 'Premium Team',
    status: billing.status || team.billing?.status || 'active',
    source: 'team',
    teamId,
    stripeSubscriptionId: billing.stripeSubscriptionId || team.billing?.stripeSubscriptionId || null,
    stripeCustomerId: billing.stripeCustomerId || team.billing?.stripeCustomerId || null,
    currentPeriodEnd: billing.currentPeriodEnd || team.billing?.currentPeriodEnd || null,
    endDate: null,
  };
  const uids = new Set();
  if (team.ownerUid) uids.add(team.ownerUid);
  const members = await teamRef.collection('members').get();
  members.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    if (data.status && data.status !== 'active') return;
    uids.add(docSnap.id);
  });
  for (const uid of uids) {
    await writePlan(db, uid, plan);
  }
  return plan;
}

module.exports = {
  planDocument,
  writePlan,
  writeTeamMemberPlans,
};
