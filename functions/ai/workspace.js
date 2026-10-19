const { admin } = require('../shared/admin');

async function safeDocs(queryRef) {
  try {
    const snap = await queryRef.get();
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    console.warn('workspace query failed:', error.message);
    return [];
  }
}

async function loadWorkspace(db, uid) {
  const [tours, messages, openHouses, offers, contacts] = await Promise.all([
    safeDocs(db.collection('buyerSchedules').where('ownerUid', '==', uid).limit(8)),
    safeDocs(db.collection('messages').where('agentUid', '==', uid).limit(12)),
    safeDocs(db.collection('openHouses').where('agentId', '==', uid).limit(8)),
    safeDocs(db.collection('offers').where('ownerUid', '==', uid).limit(8)),
    safeDocs(db.collection('contacts').where('ownerUid', '==', uid).limit(12)),
  ]);
  return { tours, messages, openHouses, offers, contacts };
}

function workspaceText(records) {
  const tours = records.tours.map((tour) => {
    const stops = (tour.targets || []).map((target) => target.address).filter(Boolean).slice(0, 6);
    return `- ${tour.id} ${tour.status || 'draft'}: ${stops.join('; ') || 'no stops'}`;
  });
  const houses = records.openHouses.map((row) => `- ${row.id} ${row.title || 'Open house'} ${row.address || ''} ${row.date || ''}`);
  const offers = records.offers.map((row) => `- ${row.id} ${row.meta?.price || ''} ${row.address || row.hubSlug || ''} ${row.status || ''}`);
  const messages = records.messages.map((row) => `- ${row.direction || 'note'} ${row.contactPhone || ''}: ${String(row.body || '').slice(0, 120)}`);
  return [
    'Tours:', tours.join('\n') || '- none',
    'Open houses:', houses.join('\n') || '- none',
    'Offers:', offers.join('\n') || '- none',
    'Recent texts:', messages.join('\n') || '- none',
  ].join('\n');
}

async function loadAgentContext(db, uid) {
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.exists ? userSnap.data() : {};
  let team = null;
  if (user.teamId) {
    const teamSnap = await db.collection('teams').doc(user.teamId).get();
    team = teamSnap.exists ? { id: teamSnap.id, ...teamSnap.data() } : null;
  }
  return { user, team };
}

function effectiveGuardrail(user, team) {
  const { stricterLevel } = require('../shared/guardrails');
  return stricterLevel(user?.guardrailLevel, team?.guardrailCeiling);
}

module.exports = {
  loadWorkspace,
  workspaceText,
  loadAgentContext,
  effectiveGuardrail,
  admin,
};
