const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { admin } = require('../shared/admin');
const { getUserTeamIdOrNull } = require('../shared/team');
const {
  normalizePhone,
  getTwilioClient,
  getTwilioFromNumber,
  validateTwilioRequest,
} = require('../shared/twilio');

function twiml(message) {
  const body = message
    ? `<Message>${String(message).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Message>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

async function upsertSmsRouting(db, contactPhone, data) {
  await db.collection('smsRouting').doc(contactPhone).set({
    ...data,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function resolveThreadContext(db, contactPhone, agentPhone) {
  const routeSnap = await db.collection('smsRouting').doc(contactPhone).get();
  if (routeSnap.exists) {
    return routeSnap.data();
  }

  const listingsSnap = await db.collection('listings')
    .where('agentPhone', '==', agentPhone)
    .limit(1)
    .get();

  if (!listingsSnap.empty) {
    const listingDoc = listingsSnap.docs[0];
    const listing = listingDoc.data();
    return {
      agentUid: listing.ownerUid || null,
      teamId: listing.teamId || null,
      listingId: listingDoc.id,
      offerId: null,
      scheduleId: null,
    };
  }

  return {
    agentUid: null,
    teamId: null,
    offerId: null,
    listingId: null,
    scheduleId: null,
  };
}

exports.sendAgentSms = onCall(
  { secrets: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'] },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Must be authenticated');
      }

      const { toPhone, fromPhone, message, offerId = null, listingId = null, scheduleId = null } = request.data || {};
      if (!toPhone || !message) {
        throw new HttpsError('invalid-argument', 'toPhone and message are required');
      }

      const normalizedTo = normalizePhone(toPhone);
      const from = fromPhone || getTwilioFromNumber();
      const normalizedAgentPhone = normalizePhone(from);
      const agentEmail = request.auth.token.email || null;
      const db = admin.firestore();

      const dncDoc = await db.collection('dnc').doc(normalizedTo).get();
      if (dncDoc.exists) {
        throw new HttpsError('failed-precondition', 'Recipient has opted out (DNC)');
      }

      const sent = await getTwilioClient().messages.create({
        body: message,
        from,
        to: normalizedTo,
      });

      const teamId = await getUserTeamIdOrNull(request.auth.uid);
      const threadKey = `${normalizedAgentPhone}::${normalizedTo}`;

      await db.collection('messages').add({
        threadKey,
        agentUid: request.auth.uid,
        agentEmail,
        agentPhone: normalizedAgentPhone,
        contactPhone: normalizedTo,
        direction: 'outbound',
        body: message,
        twilioSid: sent.sid,
        listingId: listingId || null,
        offerId: offerId || null,
        scheduleId: scheduleId || null,
        messageType: scheduleId ? 'buyer_showing' : null,
        teamId: teamId || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: true,
      });

      await upsertSmsRouting(db, normalizedTo, {
        agentUid: request.auth.uid,
        agentEmail,
        agentPhone: normalizedAgentPhone,
        teamId: teamId || null,
        offerId: offerId || null,
        listingId: listingId || null,
        scheduleId: scheduleId || null,
      });

      return { success: true, sid: sent.sid, status: sent.status };
    } catch (error) {
      console.error('sendAgentSms error:', error);
      if (error instanceof HttpsError) throw error;
      if (String(error.message || '').includes('Twilio is not configured')) {
        throw new HttpsError('failed-precondition', error.message);
      }
      throw new HttpsError('internal', 'Failed to send SMS');
    }
  }
);

exports.smsWebhook = onRequest(
  { secrets: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'] },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
      }

      if (!validateTwilioRequest(req)) {
        res.status(403).send('Invalid Twilio signature');
        return;
      }

      const fromPhone = req.body?.From;
      const toPhone = req.body?.To;
      const messageBody = req.body?.Body || '';
      const messageSid = req.body?.MessageSid || null;
      const db = admin.firestore();

      const normalizedAgentPhone = normalizePhone(toPhone);
      const normalizedContactPhone = normalizePhone(fromPhone);
      const threadKey = `${normalizedAgentPhone}::${normalizedContactPhone}`;
      const lower = messageBody.trim().toLowerCase();

      if (lower === 'stop' || lower === 'stop all' || lower === 'unsubscribe' || lower === 'cancel' || lower === 'end' || lower === 'quit') {
        await db.collection('dnc').doc(normalizedContactPhone).set({
          phone: normalizedContactPhone,
          source: 'inbound_stop',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        res.set('Content-Type', 'text/xml');
        res.send(twiml('You have been opted out. Reply START to opt back in.'));
        return;
      }

      if (lower === 'help') {
        res.set('Content-Type', 'text/xml');
        res.send(twiml('Help: Reply STOP to unsubscribe. Msg&Data rates may apply.'));
        return;
      }

      if (lower === 'start' || lower === 'yes') {
        await db.collection('dnc').doc(normalizedContactPhone).delete().catch(() => {});
        await db.collection('consents').doc(normalizedContactPhone).set({
          phone: normalizedContactPhone,
          source: 'inbound_start',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        res.set('Content-Type', 'text/xml');
        res.send(twiml('You are opted in. Reply STOP to opt out.'));
        return;
      }

      const context = await resolveThreadContext(db, normalizedContactPhone, normalizedAgentPhone);

      await db.collection('messages').add({
        threadKey,
        agentPhone: normalizedAgentPhone,
        contactPhone: normalizedContactPhone,
        direction: 'inbound',
        body: messageBody,
        twilioSid: messageSid,
        agentUid: context.agentUid || null,
        agentEmail: context.agentEmail || null,
        teamId: context.teamId || null,
        offerId: context.offerId || null,
        listingId: context.listingId || null,
        scheduleId: context.scheduleId || null,
        messageType: context.scheduleId ? 'buyer_showing_reply' : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
      });

      if (context.agentUid) {
        await upsertSmsRouting(db, normalizedContactPhone, {
          agentUid: context.agentUid,
          teamId: context.teamId || null,
          agentPhone: normalizedAgentPhone,
          offerId: context.offerId || null,
          listingId: context.listingId || null,
          scheduleId: context.scheduleId || null,
        });
      }

      res.set('Content-Type', 'text/xml');
      res.send(twiml());
    } catch (error) {
      console.error('smsWebhook error:', error);
      res.status(500).send('Internal server error');
    }
  }
);
