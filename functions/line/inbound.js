const { admin } = require('../shared/admin');
const { getTwilioClient, normalizePhone } = require('../shared/twilio');
const { pendingIsExpired, writeAudit } = require('../shared/guardrails');
const { runOwnerTurn } = require('../ai/grokAgent');
const { executeApproved } = require('./execute');

function decision(body) {
  const text = String(body || '').trim().toLowerCase();
  if (['yes', 'approve', 'y'].includes(text)) return 'approve';
  if (['no', 'reject', 'n'].includes(text)) return 'reject';
  return '';
}

async function storeInbound(db, uid, from, to, body, messageSid, teamId) {
  await db.collection('messages').add({
    threadKey: `${uid}:${from}`,
    agentUid: uid,
    agentPhone: to,
    contactPhone: from,
    direction: 'inbound',
    body,
    twilioSid: messageSid,
    teamId: teamId || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
  });
}

async function handleAgentLineInbound({ db, fromPhone, toPhone, messageBody, messageSid }) {
  const to = normalizePhone(toPhone);
  const from = normalizePhone(fromPhone);
  if (!to) return null;
  const lineSnap = await db.collection('agentLines').doc(to).get();
  if (!lineSnap.exists || lineSnap.data().status !== 'active') return null;

  const line = lineSnap.data();
  const uid = line.uid;
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data() || {};
  const owner = normalizePhone(user.line?.ownerMobile || user.phone || line.ownerMobile);

  if (from && from === owner) {
    const choice = decision(messageBody);
    const pending = user.pendingAction;
    if (choice && pending?.id && !pendingIsExpired(pending)) {
      if (choice === 'reject') {
        await db.collection('pendingActions').doc(pending.id).set({
          status: 'rejected',
          rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        await db.collection('users').doc(uid).set({ pendingAction: null }, { merge: true });
        await writeAudit(db, uid, { type: 'rejected', kind: pending.kind, warning: pending.warning, actionId: pending.id });
        return { reply: 'Cancelled. Nothing was sent.' };
      }
      const actionSnap = await db.collection('pendingActions').doc(pending.id).get();
      await executeApproved(db, uid, { id: pending.id, ...actionSnap.data() });
      return { reply: 'Approved. That action is complete.' };
    }
    if (choice && (!pending?.id || pendingIsExpired(pending))) {
      return { reply: 'Nothing is waiting for approval.' };
    }
    const reply = await runOwnerTurn(db, uid, messageBody);
    return { reply };
  }

  await storeInbound(db, uid, from, to, messageBody, messageSid, user.teamId);
  const reply = await runOwnerTurn(
    db,
    uid,
    `A client texted ${from}. Message: ${messageBody}. Summarize it for me. If a reply should be sent, queue it and show me the exact warning. Do not send it.`,
  );
  if (owner) {
    await getTwilioClient().messages.create({
      from: to,
      to: owner,
      body: String(reply || '').slice(0, 1400),
    });
  }
  return { reply: '' };
}

module.exports = { handleAgentLineInbound };
