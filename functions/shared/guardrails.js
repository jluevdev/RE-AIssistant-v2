const { HttpsError } = require('firebase-functions/v2/https');
const { admin } = require('./admin');
const { normalizePhone } = require('./twilio');

const LEVELS = ['observe', 'draft', 'assist', 'routine'];
const PENDING_MS = 2 * 60 * 60 * 1000;
const WRITE_KINDS = new Set([
  'send_sms',
  'open_house_reminder',
  'showing_requests',
  'offer_note',
  'offer_deadline',
  'offer_checklist',
  'signature_request',
]);

function levelRank(level) {
  const index = LEVELS.indexOf(level);
  return index === -1 ? LEVELS.indexOf('draft') : index;
}

function stricterLevel(agentLevel, ceiling) {
  const agent = LEVELS.includes(agentLevel) ? agentLevel : 'draft';
  const cap = LEVELS.includes(ceiling) ? ceiling : 'routine';
  return levelRank(agent) <= levelRank(cap) ? agent : cap;
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function textHasPhone(text, phone) {
  const wanted = digits(phone).slice(-10);
  if (wanted.length < 10) return false;
  return digits(text).includes(wanted);
}

function collectRecordPhones(records) {
  const phones = new Set();
  const add = (value) => {
    const phone = normalizePhone(value);
    if (phone) phones.add(phone);
  };
  (records.messages || []).forEach((row) => add(row.contactPhone));
  (records.offers || []).forEach((row) => {
    add(row.agentPhone);
    add(row.meta?.buyerAgentPhone);
    add(row.meta?.buyerPhone);
    add(row.meta?.sellerPhone);
  });
  (records.tours || []).forEach((row) => {
    (row.targets || []).forEach((target) => add(target.listingAgentPhone || target.phone));
    (row.buyers || []).forEach((buyer) => add(buyer.phone));
  });
  (records.contacts || []).forEach((row) => add(row.phone));
  return phones;
}

function collectRecordAddresses(records) {
  const addresses = [];
  const add = (value) => {
    const text = String(value || '').trim().toLowerCase();
    if (text) addresses.push(text);
  };
  (records.tours || []).forEach((row) => {
    (row.targets || []).forEach((target) => add(target.address));
  });
  (records.openHouses || []).forEach((row) => add(row.address));
  (records.offers || []).forEach((row) => add(row.address || row.meta?.address || row.hubSlug));
  return addresses;
}

function hardLockError(message) {
  return new HttpsError('failed-precondition', message);
}

async function assertNotDnc(db, phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) throw hardLockError('A real phone number is required.');
  const snap = await db.collection('dnc').doc(normalized).get();
  if (snap.exists) throw hardLockError('That number is on the do-not-contact list.');
  return normalized;
}

function assertKnownPhone(phone, ownerText, records) {
  const normalized = normalizePhone(phone);
  if (!normalized) throw hardLockError('A real phone number is required.');
  if (textHasPhone(ownerText, normalized)) return normalized;
  if (collectRecordPhones(records).has(normalized)) return normalized;
  throw hardLockError('That phone is not in the record or in your instruction. Say the number again if it is correct.');
}

function assertKnownAddress(address, ownerText, records) {
  const value = String(address || '').trim();
  if (!value) throw hardLockError('An address is required.');
  const needle = value.toLowerCase();
  const owner = String(ownerText || '').toLowerCase();
  if (owner.includes(needle)) return value;
  const known = collectRecordAddresses(records);
  if (known.some((item) => item.includes(needle) || needle.includes(item))) return value;
  throw hardLockError('That address is not in the record or in your instruction.');
}

function requiresApproval(level, kind) {
  if (!WRITE_KINDS.has(kind)) return false;
  if (level === 'observe') return true;
  if (kind === 'signature_request') return true;
  if (level === 'routine' && kind === 'send_sms') return true;
  return level !== 'observe';
}

async function writeAudit(db, uid, entry) {
  await db.collection('users').doc(uid).collection('guardrailAudits').add({
    ...entry,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function cancelPending(db, uid) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  const pending = snap.exists ? snap.data().pendingAction : null;
  if (pending?.id && pending.status === 'pending') {
    await db.collection('pendingActions').doc(pending.id).set({
      status: 'cancelled',
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await ref.set({ pendingAction: null }, { merge: true });
}

async function queuePendingAction(db, { uid, teamId, level, kind, warning, payload, ownerText }) {
  if (level === 'observe') {
    throw hardLockError('Observe only reads and answers. Raise the guardrail level to draft a task.');
  }
  if (kind === 'send_sms') {
    payload.toPhone = await assertNotDnc(db, assertKnownPhone(payload.toPhone, ownerText, payload.records || {}));
    payload.body = String(payload.body || '').trim();
    if (!payload.body) throw hardLockError('The text is empty.');
    delete payload.records;
  }
  if (kind === 'signature_request' && payload.blockers?.length) {
    throw hardLockError(`Signature packet is blocked: ${payload.blockers.join('; ')}`);
  }

  await cancelPending(db, uid);
  const ref = db.collection('pendingActions').doc();
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + PENDING_MS);
  const action = {
    id: ref.id,
    uid,
    teamId: teamId || null,
    level,
    kind,
    warning,
    payload,
    status: 'pending',
    expiresAt,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await ref.set(action);
  await db.collection('users').doc(uid).set({
    pendingAction: {
      id: ref.id,
      kind,
      warning,
      payload,
      status: 'pending',
      expiresAt,
    },
  }, { merge: true });
  await writeAudit(db, uid, { type: 'queued', kind, warning, level, actionId: ref.id });
  return { id: ref.id, warning, expiresAt: expiresAt.toDate().toISOString() };
}

function pendingIsExpired(pending) {
  if (!pending || pending.status !== 'pending') return true;
  const expires = pending.expiresAt?.toMillis?.()
    || (pending.expiresAt?.seconds ? pending.expiresAt.seconds * 1000 : 0);
  return !expires || expires <= Date.now();
}

module.exports = {
  LEVELS,
  PENDING_MS,
  levelRank,
  stricterLevel,
  requiresApproval,
  assertNotDnc,
  assertKnownPhone,
  assertKnownAddress,
  writeAudit,
  cancelPending,
  queuePendingAction,
  pendingIsExpired,
  hardLockError,
};
