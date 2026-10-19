const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { admin } = require('../shared/admin');

const TOOL_IDS = [
  'read_workspace',
  'read_today',
  'plan_tour',
  'read_listing',
  'propose_client_text',
  'propose_open_house_reminder',
  'propose_showing_requests',
  'propose_offer_note',
  'propose_deadline',
  'propose_checklist',
  'propose_tour_followup',
  'propose_deadline_reminder',
  'prep_signature_packet',
  'request_signatures',
];

const DEFAULT_BOTS = [
  {
    id: 'desk',
    name: 'Desk',
    instructions: 'Coordinate the dashboard. Pick the one tool that matches the task and leave the rest alone.',
    tools: TOOL_IDS,
  },
  {
    id: 'tours',
    name: 'Tours',
    instructions: 'Plan showing tours and read listings. Queue showing requests and tour follow-ups only when the agent asks.',
    tools: ['read_workspace', 'read_today', 'plan_tour', 'read_listing', 'propose_showing_requests', 'propose_tour_followup'],
  },
  {
    id: 'inbox',
    name: 'Inbox',
    instructions: 'Handle client texts. Queue the exact reply and wait for approval.',
    tools: ['read_workspace', 'read_today', 'propose_client_text'],
  },
  {
    id: 'offers',
    name: 'Offers',
    instructions: 'Prep offer notes, deadlines, the file checklist, and signature packets. Never sign and never rewrite contract language.',
    tools: ['read_workspace', 'read_today', 'propose_offer_note', 'propose_deadline', 'propose_checklist', 'propose_deadline_reminder', 'prep_signature_packet', 'request_signatures'],
  },
  {
    id: 'houses',
    name: 'Open houses',
    instructions: 'Look up open houses and queue reminders.',
    tools: ['read_workspace', 'read_today', 'propose_open_house_reminder'],
  },
];

function botsRef(uid) {
  return admin.firestore().collection('users').doc(uid).collection('assistantBots');
}

function cleanTools(tools) {
  const list = Array.isArray(tools) ? tools : [];
  const allowed = list.filter((tool) => TOOL_IDS.includes(tool));
  return allowed.length ? allowed : ['read_workspace'];
}

async function ensureBots(uid) {
  const ref = botsRef(uid);
  const snap = await ref.get();
  if (!snap.empty) {
    const bots = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    await Promise.all(DEFAULT_BOTS.map(async (fallback) => {
      const existing = bots.find((bot) => bot.id === fallback.id);
      if (!existing) return;
      const tools = Array.isArray(existing.tools) ? existing.tools : [];
      const missing = fallback.tools.filter((tool) => !tools.includes(tool));
      if (!missing.length) return;
      existing.tools = [...tools, ...missing];
      await ref.doc(fallback.id).set({ tools: existing.tools }, { merge: true });
    }));
    return bots;
  }
  const batch = admin.firestore().batch();
  DEFAULT_BOTS.forEach((bot) => {
    batch.set(ref.doc(bot.id), {
      name: bot.name,
      instructions: bot.instructions,
      tools: bot.tools,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
  return DEFAULT_BOTS.map((bot) => ({ ...bot }));
}

function publicBot(bot) {
  return {
    id: bot.id,
    name: bot.name || 'Bot',
    instructions: bot.instructions || '',
    tools: cleanTools(bot.tools),
  };
}

exports.listAssistantBots = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const uid = request.auth.uid;
  const bots = await ensureBots(uid);
  const userSnap = await admin.firestore().collection('users').doc(uid).get();
  const activeBotId = userSnap.data()?.activeBotId || 'desk';
  return {
    bots: bots.map(publicBot),
    activeBotId: bots.some((bot) => bot.id === activeBotId) ? activeBotId : bots[0].id,
    toolIds: TOOL_IDS,
  };
});

exports.saveAssistantBot = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const id = String(request.data?.id || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
  const name = String(request.data?.name || '').trim().slice(0, 40);
  const instructions = String(request.data?.instructions || '').trim().slice(0, 2000);
  if (!id || !name) throw new HttpsError('invalid-argument', 'A bot needs an id and a name.');
  await botsRef(request.auth.uid).doc(id).set({
    name,
    instructions,
    tools: cleanTools(request.data?.tools),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { success: true, bot: publicBot({ id, name, instructions, tools: request.data?.tools }) };
});

exports.setActiveAssistantBot = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const id = String(request.data?.id || '').trim();
  const snap = await botsRef(request.auth.uid).doc(id).get();
  if (!snap.exists) throw new HttpsError('not-found', 'That bot is not on this account.');
  await admin.firestore().collection('users').doc(request.auth.uid).set({ activeBotId: id }, { merge: true });
  return { success: true, activeBotId: id };
});

async function loadActiveBot(db, uid, user) {
  const bots = await ensureBots(uid);
  const active = bots.find((bot) => bot.id === user?.activeBotId) || bots[0];
  return publicBot(active);
}

module.exports.TOOL_IDS = TOOL_IDS;
module.exports.loadActiveBot = loadActiveBot;
