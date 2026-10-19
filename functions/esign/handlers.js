const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { admin } = require('../shared/admin');
const { summaryFromOffer, reviewSignaturePacket } = require('./review');
const { queuePendingAction } = require('../shared/guardrails');
const { loadAgentContext, effectiveGuardrail } = require('../ai/workspace');

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  return request.auth.uid;
}

exports.prepSignaturePacket = onCall(async (request) => {
  const uid = requireAuth(request);
  const offerId = String(request.data?.offerId || '');
  if (!offerId) throw new HttpsError('invalid-argument', 'offerId is required');
  const db = admin.firestore();
  const offerSnap = await db.collection('offers').doc(offerId).get();
  if (!offerSnap.exists || offerSnap.data().ownerUid !== uid) {
    throw new HttpsError('not-found', 'Offer not found');
  }
  const offer = { id: offerSnap.id, ...offerSnap.data() };
  const summary = summaryFromOffer(offer, request.data?.parties || []);
  const review = reviewSignaturePacket(summary);
  const ref = db.collection('signaturePackets').doc();
  await ref.set({
    id: ref.id,
    offerId,
    ownerUid: uid,
    summary,
    blockers: review.blockers,
    warnings: review.warnings,
    status: 'draft',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { success: true, packetId: ref.id, summary, ...review };
});

exports.requestSignatureApproval = onCall({ secrets: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'] }, async (request) => {
  const uid = requireAuth(request);
  const packetId = String(request.data?.packetId || '');
  if (!packetId) throw new HttpsError('invalid-argument', 'packetId is required');
  const db = admin.firestore();
  const snap = await db.collection('signaturePackets').doc(packetId).get();
  if (!snap.exists || snap.data().ownerUid !== uid) throw new HttpsError('not-found', 'Signature packet not found');
  const packet = snap.data();
  if (packet.blockers?.length) {
    throw new HttpsError('failed-precondition', `Signature packet is blocked: ${packet.blockers.join('; ')}`);
  }
  const { user, team } = await loadAgentContext(db, uid);
  const level = effectiveGuardrail(user, team);
  const fields = [
    packet.summary?.address,
    packet.summary?.price,
    packet.summary?.closeDate,
    ...(packet.summary?.parties || []).map((party) => `${party.role} ${party.name} ${party.phone}`),
  ].filter(Boolean).join('; ');
  const warning = `This texts signature links. Signers will see: ${fields}. Warnings: ${(packet.warnings || []).join(' ') || 'none'}.`;
  const queued = await queuePendingAction(db, {
    uid,
    teamId: team?.id,
    level,
    kind: 'signature_request',
    warning,
    payload: { packetId, blockers: packet.blockers || [] },
    ownerText: fields,
  });
  return { success: true, ...queued };
});

exports.getSignatureInvite = onCall(async (request) => {
  const token = String(request.data?.token || '');
  if (!/^[a-f0-9]{36}$/.test(token)) throw new HttpsError('invalid-argument', 'Invalid signature link');
  const db = admin.firestore();
  const inviteSnap = await db.collection('signatureInvites').doc(token).get();
  if (!inviteSnap.exists) throw new HttpsError('not-found', 'This signature link is invalid');
  const invite = inviteSnap.data();
  const packetSnap = await db.collection('signaturePackets').doc(invite.packetId).get();
  if (!packetSnap.exists) throw new HttpsError('not-found', 'This signature link is invalid');
  const packet = packetSnap.data();
  const party = (packet.summary?.parties || []).find((row) => row.token === token);
  return {
    address: packet.summary?.address || '',
    price: packet.summary?.price || '',
    financing: packet.summary?.financing || '',
    concessions: packet.summary?.concessions || '',
    closeDate: packet.summary?.closeDate || '',
    contingencies: packet.summary?.contingencies || '',
    warnings: packet.warnings || [],
    signerName: party?.name || invite.name || '',
    role: party?.role || invite.role || '',
    alreadySigned: Boolean(party?.signedAt),
  };
});

exports.submitSignature = onCall(async (request) => {
  const token = String(request.data?.token || '');
  const signatureName = String(request.data?.signatureName || '').trim();
  if (!/^[a-f0-9]{36}$/.test(token)) throw new HttpsError('invalid-argument', 'Invalid signature link');
  if (signatureName.length < 2) throw new HttpsError('invalid-argument', 'Type your name to sign');
  const db = admin.firestore();
  const inviteRef = db.collection('signatureInvites').doc(token);
  const inviteSnap = await inviteRef.get();
  if (!inviteSnap.exists) throw new HttpsError('not-found', 'This signature link is invalid');
  const invite = inviteSnap.data();
  const packetRef = db.collection('signaturePackets').doc(invite.packetId);
  const packetSnap = await packetRef.get();
  if (!packetSnap.exists) throw new HttpsError('not-found', 'This signature link is invalid');
  const packet = packetSnap.data();
  const parties = (packet.summary?.parties || []).map((party) => {
    if (party.token !== token) return party;
    if (party.signedAt) return party;
    return {
      ...party,
      signatureName,
      signedAt: new Date().toISOString(),
    };
  });
  const allSigned = parties.length > 0 && parties.every((party) => party.signedAt);
  await packetRef.set({
    summary: { ...packet.summary, parties },
    status: allSigned ? 'signed' : 'out_for_signature',
    signedAt: allSigned ? admin.firestore.FieldValue.serverTimestamp() : null,
  }, { merge: true });
  if (allSigned && packet.offerId) {
    await db.collection('offers').doc(packet.offerId).set({
      status: 'signed',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await db.collection('users').doc(packet.ownerUid).collection('guardrailAudits').add({
      type: 'signed',
      kind: 'signature_request',
      warning: 'Every required party signed the approved summary.',
      payload: { packetId: packetRef.id, offerId: packet.offerId },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  return { success: true, allSigned };
});
