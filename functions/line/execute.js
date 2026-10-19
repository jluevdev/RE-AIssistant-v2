const { admin } = require('../shared/admin');
const { getTwilioClient, normalizePhone } = require('../shared/twilio');
const { writeAudit } = require('../shared/guardrails');
const { getFrontendUrl } = require('../billing/stripe');

async function sendFromLine(db, uid, line, toPhone, body, extra = {}) {
  const from = line.e164;
  const to = normalizePhone(toPhone);
  const sent = await getTwilioClient().messages.create({ body, from, to });
  await db.collection('messages').add({
    threadKey: `${uid}:${to}`,
    agentUid: uid,
    agentPhone: from,
    contactPhone: to,
    direction: 'outbound',
    body,
    twilioSid: sent.sid,
    teamId: extra.teamId || null,
    messageType: extra.messageType || null,
    offerId: extra.offerId || null,
    scheduleId: extra.scheduleId || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    read: true,
  });
  return sent.sid;
}

async function executeApproved(db, uid, action) {
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data() || {};
  const line = user.line;
  if (!line?.e164 || line.status !== 'active') {
    throw new Error('Claim a texting number before completing this.');
  }
  const payload = action.payload || {};
  let result = { ok: true };

  if (action.kind === 'send_sms') {
    const sid = await sendFromLine(db, uid, line, payload.toPhone, payload.body, {
      teamId: user.teamId,
      messageType: 'assistant',
    });
    result = { sid };
  } else if (action.kind === 'open_house_reminder') {
    const { loadSettings, loadAgentProfile, enqueueTask, buildTaskForOpenHouseReminder } = require('../automations/enqueue');
    const ohSnap = await db.collection('openHouses').doc(payload.openHouseId).get();
    if (!ohSnap.exists) throw new Error('Open house not found');
    const openHouse = { id: ohSnap.id, ...ohSnap.data() };
    if ((openHouse.agentId || openHouse.ownerUid) !== uid) throw new Error('Open house not found');
    const settings = await loadSettings(db, uid);
    const forced = {
      ...settings,
      rules: {
        ...settings.rules,
        openHouseAgentReminderSms: { ...settings.rules?.openHouseAgentReminderSms, enabled: true },
      },
    };
    const task = buildTaskForOpenHouseReminder(openHouse, await loadAgentProfile(db, uid), forced);
    if (!task) throw new Error('Could not build the reminder.');
    result = await enqueueTask(db, task);
  } else if (action.kind === 'showing_requests') {
    const scheduleRef = db.collection('buyerSchedules').doc(payload.scheduleId);
    const scheduleSnap = await scheduleRef.get();
    if (!scheduleSnap.exists || scheduleSnap.data().ownerUid !== uid) throw new Error('Tour not found');
    const targets = scheduleSnap.data().targets || [];
    let sent = 0;
    for (const target of targets) {
      if (!target.listingAgentPhone || target.status === 'declined') continue;
      const body = payload.body || `Showing request for ${target.address || 'a listing'}. Reply YES or NO.`;
      await sendFromLine(db, uid, line, target.listingAgentPhone, body, {
        teamId: user.teamId,
        scheduleId: payload.scheduleId,
        messageType: 'showing_request',
      });
      sent += 1;
    }
    await scheduleRef.set({ status: sent ? 'requests_sent' : scheduleSnap.data().status, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    result = { sent };
  } else if (action.kind === 'offer_note') {
    const offerRef = db.collection('offers').doc(payload.offerId);
    const offerSnap = await offerRef.get();
    if (!offerSnap.exists || offerSnap.data().ownerUid !== uid) throw new Error('Offer not found');
    await offerRef.collection('events').add({
      type: 'note',
      note: payload.note,
      actorUid: uid,
      source: 'assistant',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    result = { noted: true };
  } else if (action.kind === 'offer_deadline' || action.kind === 'offer_checklist') {
    const offerRef = db.collection('offers').doc(payload.offerId);
    const offerSnap = await offerRef.get();
    if (!offerSnap.exists || offerSnap.data().ownerUid !== uid) throw new Error('Offer not found');
    const file = offerSnap.data().file || { deadlines: {}, checklist: {} };
    const deadlineKeys = ['inspection', 'appraisal', 'loan', 'contingencyRemoval', 'close'];
    const checkKeys = ['preApproval', 'proofOfFunds', 'signedPacket', 'inspectionBooked', 'appraisalOrdered'];
    if (action.kind === 'offer_deadline') {
      if (!deadlineKeys.includes(payload.key) || !/^\d{4}-\d{2}-\d{2}$/.test(String(payload.date || ''))) {
        throw new Error('That deadline is not valid.');
      }
      file.deadlines = { ...(file.deadlines || {}), [payload.key]: payload.date };
    } else {
      if (!checkKeys.includes(payload.key)) throw new Error('That checklist item is not on the file.');
      file.checklist = { ...(file.checklist || {}), [payload.key]: Boolean(payload.done) };
    }
    await offerRef.set({
      file,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    result = { file };
  } else if (action.kind === 'signature_request') {
    const packetRef = db.collection('signaturePackets').doc(payload.packetId);
    const packetSnap = await packetRef.get();
    if (!packetSnap.exists || packetSnap.data().ownerUid !== uid) throw new Error('Signature packet not found');
    const packet = packetSnap.data();
    const frontend = getFrontendUrl().replace(/\/$/, '');
    const parties = (packet.summary?.parties || []).map((party) => ({
      ...party,
      token: party.token || require('crypto').randomBytes(18).toString('hex'),
      signedAt: null,
      signatureName: null,
    }));
    await packetRef.set({
      status: 'out_for_signature',
      summary: { ...packet.summary, parties },
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    for (const party of parties) {
      if (!party.phone || !party.token) continue;
      const link = `${frontend}/sign/${party.token}`;
      await db.collection('signatureInvites').doc(party.token).set({
        packetId: packetRef.id,
        offerId: packet.offerId,
        role: party.role,
        name: party.name,
        phone: party.phone,
      });
      await sendFromLine(
        db,
        uid,
        line,
        party.phone,
        `Please review and sign: ${packet.summary.address || 'offer'} ${packet.summary.price || ''}. ${link}`,
        { teamId: user.teamId, offerId: packet.offerId, messageType: 'signature_request' },
      );
    }
    result = { sent: parties.length };
  } else {
    throw new Error('Unknown action');
  }

  await db.collection('pendingActions').doc(action.id).set({
    status: 'approved',
    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    result,
  }, { merge: true });
  await db.collection('users').doc(uid).set({ pendingAction: null }, { merge: true });
  await writeAudit(db, uid, {
    type: 'approved',
    kind: action.kind,
    warning: action.warning,
    level: action.level,
    actionId: action.id,
    payload: action.payload,
  });
  return result;
}

module.exports = { executeApproved, sendFromLine };
