const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { admin } = require('../shared/admin');
const { getUserTeamIdOrNull } = require('../shared/team');
const {
  normalizePhone,
  getTwilioClient,
  getTwilioFromNumber,
  validateTwilioRequest,
} = require('../shared/twilio');
const { extractListingUrls, ingestListingUrls } = require('../buyer/listingLinks');
const { assertSubscriptionActive } = require('../shared/subscription');
const {
  planOutboundSms,
  commitOutboundSms,
  resolveInboundSms,
  patchRouteCandidate,
} = require('../shared/smsRouting');
const { handleAgentLineInbound } = require('../line/inbound');

function twiml(message) {
  const body = message
    ? `<Message>${String(message).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Message>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

exports.sendAgentSms = onCall(
  { secrets: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'] },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Must be authenticated');
      }
      await assertSubscriptionActive(request.auth.uid);

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

      const teamId = await getUserTeamIdOrNull(request.auth.uid);
      const planned = await planOutboundSms(db, {
        contactPhone: normalizedTo,
        agentUid: request.auth.uid,
        agentEmail,
        agentPhone: normalizedAgentPhone,
        teamId: teamId || null,
        offerId: offerId || null,
        listingId: listingId || null,
        scheduleId: scheduleId || null,
      }, message);

      const sent = await getTwilioClient().messages.create({
        body: planned.body,
        from,
        to: normalizedTo,
      });

      await db.collection('messages').add({
        threadKey: planned.threadKey,
        agentUid: request.auth.uid,
        agentEmail,
        agentPhone: normalizedAgentPhone,
        contactPhone: normalizedTo,
        direction: 'outbound',
        body: planned.body,
        twilioSid: sent.sid,
        listingId: listingId || null,
        offerId: offerId || null,
        scheduleId: scheduleId || null,
        messageType: scheduleId ? 'buyer_showing' : null,
        teamId: teamId || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: true,
      });

      await commitOutboundSms(db, planned);

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
  {
    secrets: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER', 'GOOGLEAI_KEY', 'XAI_API_KEY', 'AI_CREDENTIALS_KEY', 'FRONTEND_URL'],
    timeoutSeconds: 120,
    memory: '512MiB',
  },
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

      if (lower === 'start') {
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

      const lineResult = await handleAgentLineInbound({
        db,
        fromPhone,
        toPhone,
        messageBody,
        messageSid,
      });
      if (lineResult) {
        res.set('Content-Type', 'text/xml');
        res.send(twiml(lineResult.reply || ''));
        return;
      }

      const listingUrls = extractListingUrls(messageBody);
      const context = await resolveInboundSms(db, normalizedContactPhone, messageBody);
      if (!context?.agentUid) {
        res.set('Content-Type', 'text/xml');
        res.send(twiml(
          context?.ambiguous
            ? 'Reply with the 4-digit Ref code from the text you received so we can reach the right agent.'
            : 'We could not match this text to an agent. Include the 4-digit Ref code from the text you received.',
        ));
        return;
      }

      const threadKey = context.threadKey;
      let scheduleId = context.scheduleId || null;
      let messageType = scheduleId ? 'buyer_showing_reply' : null;

      if (listingUrls.length > 0) {
        messageType = 'listing_links';
        await db.collection('messages').add({
          threadKey,
          agentPhone: normalizedAgentPhone,
          contactPhone: normalizedContactPhone,
          direction: 'inbound',
          body: messageBody,
          twilioSid: messageSid,
          agentUid: context.agentUid,
          agentEmail: context.agentEmail || null,
          teamId: context.teamId || null,
          offerId: context.offerId || null,
          listingId: context.listingId || null,
          scheduleId: context.scheduleId || null,
          messageType,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          read: false,
        });

        res.set('Content-Type', 'text/xml');
        res.send(twiml(`Got ${listingUrls.length} listing${listingUrls.length === 1 ? '' : 's'}. Your agent will review and set up showings.`));

        try {
          const result = await ingestListingUrls({
            db,
            urls: listingUrls,
            agentUid: context.agentUid,
            teamId: context.teamId || null,
            scheduleId: context.scheduleId || null,
            source: 'sms',
            contactPhone: normalizedContactPhone,
          });
          await patchRouteCandidate(db, normalizedContactPhone, context.agentUid, {
            scheduleId: result.scheduleId,
            agentPhone: normalizedAgentPhone,
          });
        } catch (importError) {
          console.error('sms listing import error:', importError);
        }
        return;
      }

      await db.collection('messages').add({
        threadKey,
        agentPhone: normalizedAgentPhone,
        contactPhone: normalizedContactPhone,
        direction: 'inbound',
        body: messageBody,
        twilioSid: messageSid,
        agentUid: context.agentUid,
        agentEmail: context.agentEmail || null,
        teamId: context.teamId || null,
        offerId: context.offerId || null,
        listingId: context.listingId || null,
        scheduleId,
        messageType,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
      });

      res.set('Content-Type', 'text/xml');
      res.send(twiml());
    } catch (error) {
      console.error('smsWebhook error:', error);
      res.status(500).send('Internal server error');
    }
  }
);
