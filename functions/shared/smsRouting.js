const { admin } = require('./admin');
const { normalizePhone } = require('./twilio');

const ACTIVE_WINDOW_MS = 72 * 60 * 60 * 1000;

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  if (value instanceof Date) return value.getTime();
  return 0;
}

function extractReplyCode(body) {
  const text = String(body || '');
  const tagged = text.match(/\bref\s*(\d{4})\b/i);
  if (tagged) return tagged[1];
  const leading = text.trim().match(/^(\d{4})\b/);
  return leading ? leading[1] : '';
}

function allocateReplyCode(candidates) {
  const used = new Set(
    Object.values(candidates || {}).map((candidate) => candidate?.replyCode).filter(Boolean),
  );
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    if (!used.has(code)) return code;
  }
  return String(Date.now()).slice(-4);
}

function legacyCandidate(data) {
  if (!data?.agentUid) return null;
  return {
    agentUid: data.agentUid,
    agentEmail: data.agentEmail || null,
    agentPhone: data.agentPhone || null,
    teamId: data.teamId || null,
    offerId: data.offerId || null,
    listingId: data.listingId || null,
    scheduleId: data.scheduleId || null,
    replyCode: data.replyCode || null,
    lastOutboundAt: data.updatedAt || null,
  };
}

function candidateMap(data) {
  const candidates = { ...(data?.candidates || {}) };
  const legacy = legacyCandidate(data);
  if (legacy && !candidates[legacy.agentUid]) {
    candidates[legacy.agentUid] = legacy;
  }
  return candidates;
}

function chooseCandidate(candidates, messageBody, nowMs = Date.now()) {
  const list = Object.values(candidates || {}).filter((candidate) => candidate?.agentUid);
  if (!list.length) return { chosen: null, ambiguous: false };

  const code = extractReplyCode(messageBody);
  if (code) {
    const match = list.find((candidate) => candidate.replyCode === code) || null;
    return { chosen: match, ambiguous: !match };
  }

  const recent = list.filter((candidate) => nowMs - toMillis(candidate.lastOutboundAt) <= ACTIVE_WINDOW_MS);
  const pool = recent.length ? recent : list;
  const chosen = pool
    .slice()
    .sort((a, b) => toMillis(b.lastOutboundAt) - toMillis(a.lastOutboundAt))[0];
  return { chosen, ambiguous: false };
}

function planFromRoute(data, fields, body) {
  const phone = normalizePhone(fields.contactPhone);
  const candidates = candidateMap(data);
  const replyCode = candidates[fields.agentUid]?.replyCode || allocateReplyCode(candidates);
  const now = Date.now();
  const othersActive = Object.values(candidates).some((candidate) => (
    candidate?.agentUid
    && candidate.agentUid !== fields.agentUid
    && now - toMillis(candidate.lastOutboundAt) <= ACTIVE_WINDOW_MS
  ));
  const suffix = othersActive ? `\n\nRef ${replyCode}` : '';
  return {
    contactPhone: phone,
    threadKey: `${fields.agentUid}::${phone}`,
    body: `${body || ''}${suffix}`,
    replyCode,
    candidate: {
      agentUid: fields.agentUid,
      agentEmail: fields.agentEmail || null,
      agentPhone: fields.agentPhone || null,
      teamId: fields.teamId || null,
      offerId: fields.offerId || null,
      listingId: fields.listingId || null,
      scheduleId: fields.scheduleId || null,
      replyCode,
      lastOutboundAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  };
}

async function planOutboundSms(db, fields, body) {
  const phone = normalizePhone(fields.contactPhone);
  if (!phone || !fields.agentUid) {
    throw new Error('contactPhone and agentUid are required');
  }
  const snap = await db.collection('smsRouting').doc(phone).get();
  return planFromRoute(snap.exists ? snap.data() : {}, { ...fields, contactPhone: phone }, body);
}

async function commitOutboundSms(db, planned) {
  await db.collection('smsRouting').doc(planned.contactPhone).set({
    agentPhone: planned.candidate.agentPhone || null,
    [`candidates.${planned.candidate.agentUid}`]: planned.candidate,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function patchRouteCandidate(db, contactPhone, agentUid, patch) {
  const phone = normalizePhone(contactPhone);
  if (!phone || !agentUid) return;
  const ref = db.collection('smsRouting').doc(phone);
  const snap = await ref.get();
  const current = candidateMap(snap.exists ? snap.data() : {})[agentUid] || { agentUid };
  await ref.set({
    [`candidates.${agentUid}`]: {
      ...current,
      ...patch,
      agentUid,
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function resolveInboundSms(db, contactPhone, messageBody) {
  const phone = normalizePhone(contactPhone);
  if (!phone) return null;
  const snap = await db.collection('smsRouting').doc(phone).get();
  if (!snap.exists) return null;

  const { chosen, ambiguous } = chooseCandidate(candidateMap(snap.data()), messageBody);
  if (ambiguous) return { ambiguous: true };
  if (!chosen?.agentUid) return null;

  const userSnap = await db.collection('users').doc(chosen.agentUid).get();
  if (!userSnap.exists) return null;

  return {
    ambiguous: false,
    agentUid: chosen.agentUid,
    agentEmail: chosen.agentEmail || userSnap.data()?.email || null,
    teamId: chosen.teamId || null,
    offerId: chosen.offerId || null,
    listingId: chosen.listingId || null,
    scheduleId: chosen.scheduleId || null,
    agentPhone: snap.data()?.agentPhone || chosen.agentPhone || null,
    threadKey: `${chosen.agentUid}::${phone}`,
  };
}

module.exports = {
  ACTIVE_WINDOW_MS,
  extractReplyCode,
  chooseCandidate,
  candidateMap,
  planFromRoute,
  planOutboundSms,
  commitOutboundSms,
  patchRouteCandidate,
  resolveInboundSms,
};
