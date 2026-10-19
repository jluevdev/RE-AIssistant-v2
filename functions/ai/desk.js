const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { admin } = require('../shared/admin');
const { loadAgentContext, loadWorkspace, effectiveGuardrail } = require('./workspace');
const { queuePendingAction } = require('../shared/guardrails');
const { DEADLINE_FIELDS, weekdayLabel, parseDay } = require('./today');

const FOLLOWUP = 'Following up on the tour. Reply if you want to see any of the homes again.';

const ASSISTANT_TOOLS = ['messages', 'tours', 'open-houses', 'offers', 'line'];

exports.createPersonalAssistant = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const name = String(request.data?.name || '').trim().slice(0, 24);
  const job = String(request.data?.job || '').trim().slice(0, 140);
  if (name.length < 2) throw new HttpsError('invalid-argument', 'Name your AIssistant.');
  const tools = (Array.isArray(request.data?.tools) ? request.data.tools : [])
    .filter((tool) => ASSISTANT_TOOLS.includes(tool));
  const db = admin.firestore();
  const ref = db.collection('users').doc(request.auth.uid);
  const snap = await ref.get();
  const current = snap.exists ? snap.data() : {};
  const existingName = String(current.personalAssistant?.name || '').trim();
  const another = Boolean(request.data?.another);
  if (existingName && !another) {
    return { created: false, name: existingName, already: true };
  }
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'assistant';
  const bots = Array.isArray(current.demoBots) ? current.demoBots : [];
  const personalAssistant = {
    name: existingName || name,
    hidden: false,
    walkaroundStep: current.personalAssistant?.walkaroundStep || 0,
    walkaroundDone: true,
  };
  await ref.set({
    personalAssistant,
    demoBots: [...bots.filter((bot) => bot.id !== id), { id, name, job, tools: tools.length ? tools : ['messages'] }],
  }, { merge: true });
  return { created: true, name: personalAssistant.name, assistantName: name };
});

exports.queueTourFollowup = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const db = admin.firestore();
  const uid = request.auth.uid;
  const { user, team } = await loadAgentContext(db, uid);
  const records = await loadWorkspace(db, uid);
  const tour = records.tours.find((row) => row.id === String(request.data?.scheduleId || ''));
  if (!tour) throw new HttpsError('not-found', 'That tour is not in this account.');
  const buyer = (tour.buyers || []).find((row) => row.phone);
  if (!buyer?.phone) {
    throw new HttpsError('failed-precondition', 'That tour has no buyer phone to follow up with.');
  }
  const level = effectiveGuardrail(user, team);
  return queuePendingAction(db, {
    uid,
    teamId: team?.id,
    level,
    kind: 'send_sms',
    warning: `This will text ${buyer.phone} from your number: ${FOLLOWUP}`,
    payload: { toPhone: buyer.phone, body: FOLLOWUP, records },
    ownerText: buyer.phone,
  });
});

exports.queueDeadlineReminder = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const db = admin.firestore();
  const uid = request.auth.uid;
  const { user, team } = await loadAgentContext(db, uid);
  const records = await loadWorkspace(db, uid);
  const offer = records.offers.find((row) => row.id === String(request.data?.offerId || ''));
  if (!offer) throw new HttpsError('not-found', 'That offer is not in this account.');
  const field = DEADLINE_FIELDS.find((item) => item.key === request.data?.key);
  const date = parseDay(offer.file?.deadlines?.[request.data?.key]);
  if (!field || !date) throw new HttpsError('failed-precondition', 'That deadline is not on the file yet.');
  const toPhone = user.line?.ownerMobile || user.phone;
  if (!toPhone) throw new HttpsError('failed-precondition', 'Add your mobile on your profile so the reminder has somewhere to go.');
  const address = offer.address || offer.meta?.address || offer.hubSlug || 'the offer';
  const body = `${field.label} is ${weekdayLabel(date)} for ${address}.`;
  const level = effectiveGuardrail(user, team);
  return queuePendingAction(db, {
    uid,
    teamId: team?.id,
    level,
    kind: 'send_sms',
    warning: `This texts you, not the client: ${body}`,
    payload: {
      toPhone,
      body,
      records: { ...records, contacts: [...(records.contacts || []), { phone: toPhone }] },
    },
    ownerText: toPhone,
  });
});
