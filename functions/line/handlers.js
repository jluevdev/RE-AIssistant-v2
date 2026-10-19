const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { admin } = require('../shared/admin');
const { normalizePhone } = require('../shared/twilio');
const { assertSubscriptionActive, subscriptionAllowsAccess, toMillis } = require('../shared/subscription');
const { LEVELS, stricterLevel, pendingIsExpired, writeAudit } = require('../shared/guardrails');
const { buyLocalNumber, releaseNumber } = require('./provision');
const { executeApproved } = require('./execute');
const { loadAgentContext, effectiveGuardrail } = require('../ai/workspace');

const TWILIO_SECRETS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];
const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  return request.auth.uid;
}

async function clearLine(db, uid, line) {
  if (line?.e164) {
    await db.collection('agentLines').doc(line.e164).delete().catch(() => {});
  }
  if (line?.incomingSid) {
    await releaseNumber(line.incomingSid).catch((error) => {
      console.warn('release number failed:', error.message);
    });
  }
  await db.collection('users').doc(uid).set({
    line: { status: 'released', releasedAt: admin.firestore.FieldValue.serverTimestamp() },
  }, { merge: true });
}

async function claimAgentLine(request) {
  const uid = requireAuth(request);
  await assertSubscriptionActive(uid);
  const db = admin.firestore();
  const snap = await db.collection('users').doc(uid).get();
  const user = snap.data() || {};
  if (user.line?.status === 'active' && user.line.e164) {
    return { success: true, line: user.line, alreadyClaimed: true };
  }
  const areaCode = String(request.data?.areaCode || '').replace(/\D/g, '').slice(0, 3);
  const bought = await buyLocalNumber(areaCode || undefined);
  const ownerMobile = normalizePhone(user.phone);
  const line = {
    ...bought,
    status: 'active',
    ownerMobile: ownerMobile || null,
    claimedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection('users').doc(uid).set({ line }, { merge: true });
  await db.collection('agentLines').doc(bought.e164).set({
    uid,
    e164: bought.e164,
    incomingSid: bought.incomingSid,
    ownerMobile: ownerMobile || null,
    status: 'active',
  });
  return { success: true, line: { e164: bought.e164, status: 'active', ownerMobile: ownerMobile || null } };
}

async function releaseAgentLine(request) {
  const uid = requireAuth(request);
  const db = admin.firestore();
  const snap = await db.collection('users').doc(uid).get();
  await clearLine(db, uid, snap.data()?.line);
  return { success: true };
}

async function setGuardrailLevel(request) {
  const uid = requireAuth(request);
  const level = request.data?.level;
  if (!LEVELS.includes(level)) throw new HttpsError('invalid-argument', 'Unknown guardrail level');
  const db = admin.firestore();
  const { user, team } = await loadAgentContext(db, uid);
  const ceiling = team?.guardrailCeiling || 'routine';
  if (stricterLevel(level, ceiling) !== level) {
    throw new HttpsError('failed-precondition', 'That level is looser than the brokerage ceiling.');
  }
  await db.collection('users').doc(uid).set({ guardrailLevel: level }, { merge: true });
  await writeAudit(db, uid, { type: 'level', level, ceiling });
  return { success: true, level: stricterLevel(level, ceiling) };
}

async function setGuardrailCeiling(request) {
  const uid = requireAuth(request);
  const level = request.data?.level;
  if (!LEVELS.includes(level)) throw new HttpsError('invalid-argument', 'Unknown guardrail level');
  const db = admin.firestore();
  const { user } = await loadAgentContext(db, uid);
  if (!user.teamId || !['owner', 'admin'].includes(user.teamRole)) {
    throw new HttpsError('permission-denied', 'Only a broker admin can set the ceiling.');
  }
  await db.collection('teams').doc(user.teamId).set({ guardrailCeiling: level }, { merge: true });
  return { success: true, ceiling: level };
}

async function getLineHome(request) {
  const uid = requireAuth(request);
  const db = admin.firestore();
  const { user, team } = await loadAgentContext(db, uid);
  const level = effectiveGuardrail(user, team);
  let recent = [];
  try {
    const auditsSnap = await db.collection('users').doc(uid).collection('guardrailAudits').limit(20).get();
    recent = auditsSnap.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .slice(0, 8)
      .map((row) => ({
        id: row.id,
        type: row.type || null,
        kind: row.kind || null,
        warning: row.warning || null,
        level: row.level || null,
      }));
  } catch (error) {
    console.warn('getLineHome audits skipped:', error.message);
  }
  const pending = user.pendingAction && !pendingIsExpired(user.pendingAction) ? {
    id: user.pendingAction.id,
    kind: user.pendingAction.kind,
    warning: user.pendingAction.warning,
  } : null;
  return {
    line: user.line?.status === 'active' ? {
      e164: user.line.e164,
      status: user.line.status,
      ownerMobile: user.line.ownerMobile || normalizePhone(user.phone) || null,
    } : null,
    level,
    ceiling: team?.guardrailCeiling || 'routine',
    canSetCeiling: Boolean(user.teamId && ['owner', 'admin'].includes(user.teamRole)),
    pending,
    recent,
  };
}

async function decidePending(request, approved) {
  const uid = requireAuth(request);
  const db = admin.firestore();
  const snap = await db.collection('users').doc(uid).get();
  const pending = snap.data()?.pendingAction;
  if (!pending?.id) throw new HttpsError('failed-precondition', 'Nothing is waiting for approval.');
  if (request.data?.actionId && request.data.actionId !== pending.id) {
    throw new HttpsError('failed-precondition', 'That approval is no longer the latest one.');
  }
  if (pendingIsExpired(pending)) {
    await db.collection('users').doc(uid).set({ pendingAction: null }, { merge: true });
    throw new HttpsError('deadline-exceeded', 'That approval expired.');
  }
  if (!approved) {
    await db.collection('pendingActions').doc(pending.id).set({
      status: 'rejected',
      rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await db.collection('users').doc(uid).set({ pendingAction: null }, { merge: true });
    await writeAudit(db, uid, { type: 'rejected', kind: pending.kind, warning: pending.warning, actionId: pending.id });
    return { success: true, rejected: true };
  }
  const actionSnap = await db.collection('pendingActions').doc(pending.id).get();
  const result = await executeApproved(db, uid, { id: pending.id, ...actionSnap.data() });
  return { success: true, result };
}

const callable = (handler, secrets = []) => onCall({ secrets }, async (request) => {
  try {
    return await handler(request);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error(error);
    throw new HttpsError('internal', error.message || 'Request failed');
  }
});

exports.claimAgentLine = callable(claimAgentLine, TWILIO_SECRETS);
exports.releaseAgentLine = callable(releaseAgentLine, TWILIO_SECRETS);
exports.setGuardrailLevel = callable(setGuardrailLevel);
exports.setGuardrailCeiling = callable(setGuardrailCeiling);
exports.getLineHome = callable(getLineHome);
exports.approvePendingAction = callable((request) => decidePending(request, true), TWILIO_SECRETS.concat(['FRONTEND_URL']));
exports.rejectPendingAction = callable((request) => decidePending(request, false));

exports.releaseExpiredLines = onSchedule({ schedule: 'every 24 hours', secrets: TWILIO_SECRETS }, async () => {
  const db = admin.firestore();
  const snap = await db.collection('agentLines').where('status', '==', 'active').limit(40).get();
  for (const docSnap of snap.docs) {
    const row = docSnap.data();
    const userSnap = await db.collection('users').doc(row.uid).get();
    const user = userSnap.data() || {};
    let teamStatus = '';
    if (user.teamId) {
      const teamSnap = await db.collection('teams').doc(user.teamId).get();
      teamStatus = teamSnap.data()?.billing?.status || '';
    }
    if (subscriptionAllowsAccess(user, teamStatus)) continue;
    const end = toMillis(user.subscription?.endDate);
    if (!end || Date.now() < end + GRACE_MS) continue;
    await clearLine(db, row.uid, user.line || { e164: docSnap.id, incomingSid: row.incomingSid });
  }
});
