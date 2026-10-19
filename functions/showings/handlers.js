const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { admin } = require('../shared/admin');
const { normalizePhone } = require('../shared/twilio');
const { smartShowingsEnabled, smsMode, emailMode } = require('./flag');
const { proposeBuyerRequest, proposeListingDecision, outcomeFromReply, releaseAccess } = require('./engine');
const { isOptOut } = require('./policy');
const { nextAudit } = require('./audit');
const { stubDreLookup, classifyVerification } = require('./verification');
const { extractCardFields, polishSms } = require('./llm');
const { sendEmail } = require('../shared/email');

const SECRETS = ['XAI_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER', 'SENDGRID_API_KEY'];

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  return request.auth.uid;
}

function requireFlag() {
  if (!smartShowingsEnabled()) {
    throw new HttpsError('failed-precondition', 'SmartShowings is off.');
  }
}

async function appendAudit(db, ownerUid, event) {
  const snap = await db.collection('showingAudits')
    .where('ownerUid', '==', ownerUid)
    .limit(20)
    .get();
  const latest = snap.docs
    .map((docSnap) => docSnap.data())
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
  const entry = nextAudit(latest?.hash, { ...event, ownerUid });
  await db.collection('showingAudits').add(entry);
  return entry;
}

async function deliver({ toPhone, toEmail, body, subject }) {
  if (toPhone) {
    if (smsMode() !== 'live') {
      return { channel: 'sms', delivered: false, mode: 'mock' };
    }
    const { getTwilioClient, getTwilioFromNumber } = require('../shared/twilio');
    const sent = await getTwilioClient().messages.create({
      from: getTwilioFromNumber(),
      to: toPhone,
      body,
    });
    return { channel: 'sms', delivered: true, mode: 'live', sid: sent.sid };
  }
  if (toEmail) {
    if (emailMode() !== 'live') {
      return { channel: 'email', delivered: false, mode: 'mock' };
    }
    await sendEmail({ to: toEmail, subject: subject || 'Showing request', text: body });
    return { channel: 'email', delivered: true, mode: 'live' };
  }
  return { channel: 'none', delivered: false, mode: 'mock' };
}

async function rememberThread(db, { ownerUid, phone, email, role, scheduleId, targetId }) {
  const id = `${ownerUid}:${role}:${normalizePhone(phone) || email || 'none'}`;
  await db.collection('showingThreads').doc(id).set({
    ownerUid,
    role,
    counterpartyPhone: normalizePhone(phone) || null,
    counterpartyEmail: email || null,
    scheduleId: scheduleId || null,
    targetId: targetId || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return id;
}

async function patchTarget(db, scheduleId, targetId, address, patch) {
  if (!scheduleId) return;
  const ref = db.collection('buyerSchedules').doc(scheduleId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const targets = (snap.data().targets || []).map((target) => {
    const idMatch = targetId && (target.id === targetId || target.targetId === targetId);
    const addressMatch = address && target.address === address;
    if (!idMatch && !addressMatch) return target;
    return { ...target, ...patch };
  });
  await ref.set({
    targets,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function loadAgent(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  const user = snap.exists ? snap.data() : {};
  return {
    agentName: user.fullName || 'your agent',
    dre: user.licenseNumber || '',
    phone: user.line?.ownerMobile || user.phone || '',
    email: user.email || '',
  };
}

async function queueAction(db, uid, action) {
  const ref = db.collection('showingApprovals').doc();
  const record = {
    ...action,
    id: ref.id,
    ownerUid: uid,
    status: action.sendAfter ? 'held' : 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await ref.set(record);
  await appendAudit(db, uid, {
    type: 'queued',
    showingId: ref.id,
    summary: `${action.type} queued`,
  });
  return { id: ref.id, status: record.status, body: action.body, sendAfter: action.sendAfter || null };
}

exports.getSmartShowingsHome = onCall(async (request) => {
  const uid = requireAuth(request);
  if (!smartShowingsEnabled()) {
    return { enabled: false, approvals: [], profiles: [], verifications: [] };
  }
  const db = admin.firestore();
  const [approvals, profiles, verifications] = await Promise.all([
    db.collection('showingApprovals').where('ownerUid', '==', uid).limit(40).get(),
    db.collection('showingProfiles').where('ownerUid', '==', uid).limit(40).get(),
    db.collection('counterpartyVerifications').where('ownerUid', '==', uid).limit(40).get(),
  ]);
  const map = (snap) => snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data(), createdAt: null, updatedAt: null }));
  return {
    enabled: true,
    smsMode: smsMode(),
    emailMode: emailMode(),
    approvals: map(approvals),
    profiles: map(profiles),
    verifications: map(verifications),
  };
});

exports.queueBuyerShowing = onCall({ secrets: SECRETS }, async (request) => {
  const uid = requireAuth(request);
  requireFlag();
  const data = request.data || {};
  const db = admin.firestore();
  const agent = await loadAgent(db, uid);
  let target = {
    address: data.address,
    phone: data.phone,
    email: data.email,
    contactName: data.contactName,
    targetId: data.targetId || null,
  };
  if (data.scheduleId) {
    const schedule = await db.collection('buyerSchedules').doc(data.scheduleId).get();
    if (!schedule.exists || schedule.data().ownerUid !== uid) {
      throw new HttpsError('permission-denied', 'Tour not found');
    }
    const found = (schedule.data().targets || []).find((row) => (
      row.id === data.targetId || row.address === data.address
    ));
    if (found) {
      target = {
        address: found.address,
        phone: found.listingAgentPhone,
        email: found.listingAgentEmail,
        contactName: found.listingAgentName,
        targetId: found.id || data.targetId || null,
      };
    }
  }
  const proposed = proposeBuyerRequest({
    ...target,
    agentName: agent.agentName,
    dre: agent.dre,
    scheduleId: data.scheduleId || null,
    window: data.window || data.windowLabel,
  });
  if (proposed.blocked || !proposed.actions.length) {
    throw new HttpsError('failed-precondition', proposed.reasons.join(' ') || 'Cannot queue that request.');
  }
  const action = proposed.actions[0];
  action.body = await polishSms({ apiKey: process.env.XAI_API_KEY, template: action.body });
  const queued = await queueAction(db, uid, action);
  return { success: true, ...queued, reasons: proposed.reasons };
});

exports.receiveShowingRequest = onCall(async (request) => {
  const uid = requireAuth(request);
  requireFlag();
  const data = request.data || {};
  if (!data.address) throw new HttpsError('invalid-argument', 'address is required');
  const db = admin.firestore();
  const agent = await loadAgent(db, uid);
  const proposed = proposeListingDecision({
    agentName: agent.agentName,
    agentPhone: agent.phone,
    address: data.address,
    window: data.window || data.windowLabel,
    requesterName: data.requesterName,
    requesterPhone: data.requesterPhone,
  });
  if (!proposed.actions.length) {
    throw new HttpsError('failed-precondition', proposed.reasons.join(' ') || 'Cannot queue that request.');
  }
  const queued = await queueAction(db, uid, proposed.actions[0]);
  return { success: true, ...queued };
});

exports.decideShowingApproval = onCall({ secrets: SECRETS }, async (request) => {
  const uid = requireAuth(request);
  requireFlag();
  const { approvalId, approved } = request.data || {};
  if (!approvalId) throw new HttpsError('invalid-argument', 'approvalId is required');
  const db = admin.firestore();
  const ref = db.collection('showingApprovals').doc(approvalId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().ownerUid !== uid) {
    throw new HttpsError('permission-denied', 'Approval not found');
  }
  const action = snap.data();
  if (action.status === 'sent' || action.status === 'rejected') {
    throw new HttpsError('failed-precondition', 'That approval is already closed.');
  }
  if (!approved) {
    await ref.set({ status: 'rejected', decidedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await appendAudit(db, uid, { type: 'rejected', showingId: approvalId, summary: 'Agent declined the proposed message' });
    return { success: true, status: 'rejected' };
  }
  if (action.type === 'release_access') {
    const blocked = releaseAccess();
    await ref.set({ status: 'blocked', reason: blocked.reason }, { merge: true });
    await appendAudit(db, uid, { type: 'access_blocked', showingId: approvalId, summary: blocked.reason });
    return { success: false, ...blocked };
  }
  if (action.type === 'escalate') {
    await ref.set({ status: 'acknowledged', decidedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { success: true, status: 'acknowledged' };
  }
  if (isOptOut(action.body)) {
    throw new HttpsError('failed-precondition', 'That message looks like an opt-out and will not be sent.');
  }
  if (action.sendAfter && new Date(action.sendAfter).getTime() > Date.now()) {
    await ref.set({ status: 'held' }, { merge: true });
    return {
      success: true,
      status: 'held',
      sendAfter: action.sendAfter,
      reason: 'Quiet hours. This stays in the queue until 8:00 a.m. Pacific. Approve it again then. Automatic send is not turned on.',
    };
  }
  const result = await deliver(action);
  await rememberThread(db, {
    ownerUid: uid,
    phone: action.toPhone,
    email: action.toEmail,
    role: action.threadRole || 'counterparty',
    scheduleId: action.scheduleId,
    targetId: action.targetId,
  });
  await db.collection('showingMessages').add({
    ownerUid: uid,
    approvalId,
    direction: 'outbound',
    body: action.body,
    toPhone: action.toPhone || null,
    toEmail: action.toEmail || null,
    ...result,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await ref.set({
    status: result.delivered ? 'sent' : 'recorded',
    delivery: result,
    decidedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  if (action.scheduleId) {
    await patchTarget(db, action.scheduleId, action.targetId, action.address, {
      status: action.type === 'listing_decision' ? 'confirmed' : 'requested',
    });
  }
  await appendAudit(db, uid, {
    type: result.delivered ? 'sent' : 'recorded',
    showingId: approvalId,
    summary: result.mode === 'mock' ? 'Recorded without sending (SMS mock mode)' : 'Sent',
  });
  return { success: true, status: result.delivered ? 'sent' : 'recorded', delivery: result };
});

exports.saveShowingProfile = onCall(async (request) => {
  const uid = requireAuth(request);
  requireFlag();
  const data = request.data || {};
  if (!data.address) throw new HttpsError('invalid-argument', 'address is required');
  const db = admin.firestore();
  const ref = data.profileId
    ? db.collection('showingProfiles').doc(data.profileId)
    : db.collection('showingProfiles').doc();
  await ref.set({
    ownerUid: uid,
    address: data.address,
    listingId: data.listingId || null,
    showingType: data.showingType || 'appointment',
    noticeHours: Number(data.noticeHours) || 24,
    approvalMode: 'ask',
    occupantNotify: 'agent',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { success: true, id: ref.id };
});

exports.extractShowingCard = onCall({ secrets: ['XAI_API_KEY'] }, async (request) => {
  const uid = requireAuth(request);
  requireFlag();
  const imageBase64 = String(request.data?.imageBase64 || '');
  if (imageBase64.length > 2_000_000) {
    throw new HttpsError('invalid-argument', 'Card photo is too large.');
  }
  const extracted = await extractCardFields({
    apiKey: process.env.XAI_API_KEY,
    imageBase64,
  });
  if (!extracted.ok) {
    throw new HttpsError('failed-precondition', extracted.reason);
  }
  const dreResult = await stubDreLookup(extracted.extraction);
  const verdict = classifyVerification({
    extraction: extracted.extraction,
    dreResult,
    independentConfirmed: false,
    attested: false,
  });
  const db = admin.firestore();
  const ref = db.collection('counterpartyVerifications').doc();
  await ref.set({
    ownerUid: uid,
    ...verdict,
    phone: verdict.extraction.phone || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await appendAudit(db, uid, {
    type: 'verification',
    showingId: ref.id,
    summary: `${verdict.level}: ${verdict.reason}`,
  });
  return { success: true, id: ref.id, ...verdict };
});

exports.attestCounterparty = onCall(async (request) => {
  const uid = requireAuth(request);
  requireFlag();
  const { verificationId } = request.data || {};
  if (!verificationId) throw new HttpsError('invalid-argument', 'verificationId is required');
  const db = admin.firestore();
  const ref = db.collection('counterpartyVerifications').doc(verificationId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().ownerUid !== uid) {
    throw new HttpsError('permission-denied', 'Verification not found');
  }
  if (snap.data().level === 'Failed') {
    throw new HttpsError('failed-precondition', 'A failed check cannot be attested. Review it yourself.');
  }
  const verdict = classifyVerification({
    extraction: snap.data().extraction || {},
    dreResult: { status: 'unknown', source: 'stub' },
    attested: true,
  });
  await ref.set({
    ...verdict,
    attestedBy: uid,
    attestedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  await appendAudit(db, uid, {
    type: 'attestation',
    showingId: verificationId,
    summary: 'Verified — listing-agent attested',
  });
  const access = releaseAccess();
  return { success: true, ...verdict, access };
});

async function handleShowingInbound({ db, fromPhone, body }) {
  if (!smartShowingsEnabled()) return { handled: false };
  const phone = normalizePhone(fromPhone);
  if (!phone) return { handled: false };
  if (isOptOut(body)) {
    const threads = await db.collection('showingThreads').where('counterpartyPhone', '==', phone).limit(10).get();
    if (threads.empty) return { handled: false };
    await db.collection('dnc').doc(phone).set({
      phone,
      source: 'smartshowings_stop',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    for (const docSnap of threads.docs) {
      await docSnap.ref.set({ optedOut: true }, { merge: true });
    }
    return { handled: true, reply: '' };
  }
  const threads = await db.collection('showingThreads').where('counterpartyPhone', '==', phone).limit(5).get();
  if (threads.empty) return { handled: false };
  const thread = threads.docs[0].data();
  const scheduleSnap = thread.scheduleId
    ? await db.collection('buyerSchedules').doc(thread.scheduleId).get()
    : null;
  const targets = scheduleSnap?.exists ? scheduleSnap.data().targets || [] : [];
  const target = targets.find((row) => row.id === thread.targetId) || targets.find((row) => normalizePhone(row.listingAgentPhone) === phone) || { address: '' };
  const outcome = outcomeFromReply({
    ...target,
    agentName: target.agentName,
    contactName: target.listingAgentName,
    windowLabel: target.windowLabel,
  }, body);
  await db.collection('showingMessages').add({
    ownerUid: thread.ownerUid,
    direction: 'inbound',
    body,
    fromPhone: phone,
    parsed: outcome.parsed,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  if (thread.scheduleId) {
    await patchTarget(db, thread.scheduleId, thread.targetId, target.address, {
      status: outcome.target.status,
      rescheduleNote: outcome.target.rescheduleNote || null,
      needsReview: Boolean(outcome.target.needsReview),
      lastInboundPreview: String(body || '').slice(0, 160),
    });
  }
  for (const follow of outcome.followUps) {
    if (follow.type === 'escalate') {
      await queueAction(db, thread.ownerUid, {
        type: 'escalate',
        side: 'buyer',
        threadRole: 'buyer_control',
        body: `Unclear reply from ${phone}: ${follow.preview}`,
        scheduleId: thread.scheduleId || null,
        targetId: thread.targetId || null,
      });
    }
    if (follow.type === 'confirm_back') {
      await queueAction(db, thread.ownerUid, {
        type: 'send_sms',
        side: 'buyer',
        threadRole: 'counterparty',
        toPhone: phone,
        body: follow.body,
        scheduleId: thread.scheduleId || null,
        targetId: thread.targetId || null,
        address: target.address || null,
      });
    }
  }
  return { handled: true, reply: '' };
}

module.exports.handleShowingInbound = handleShowingInbound;
