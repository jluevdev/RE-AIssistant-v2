const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { randomUUID } = require('crypto');
const { admin } = require('../shared/admin');
const { getUserTeamIdOrNull } = require('../shared/team');
const {
  normalizePhone,
  getTwilioClient,
  getTwilioFromNumber,
} = require('../shared/twilio');

const TOKEN_TTL_MS = 48 * 60 * 60 * 1000;
const CONFIRM_WINDOW_MS = 72 * 60 * 60 * 1000;

const CONFIRM_RE = /\b(confirm(ed)?|yes|yep|yeah|ok(ay)?|works|available|sounds good|see you then)\b/i;
const DECLINE_RE = /\b(no|decline(d)?|unavailable|can't|cannot|won't|not available|pass)\b/i;

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || 'https://reaiassistant-v2.web.app').replace(/\/$/, '');
}

function getAgentDisplayName(authToken, profile) {
  if (profile?.displayName) return profile.displayName;
  if (profile?.name) return profile.name;
  if (authToken?.name) return authToken.name;
  const email = authToken?.email || '';
  if (email.includes('@')) return email.split('@')[0];
  return 'Your agent';
}

function formatAvailabilityWindow(availability) {
  const { date, start, end } = availability || {};
  if (!date) return 'the requested time';
  const startLabel = start || 'TBD';
  const endLabel = end || 'TBD';
  return `${date} between ${startLabel} and ${endLabel}`;
}

function normalizeTargets(targets) {
  if (!Array.isArray(targets)) return [];
  return targets
    .map((target) => ({
      id: target?.id || randomUUID(),
      address: String(target?.address || '').trim(),
      listingAgentPhone: String(target?.listingAgentPhone || '').trim(),
      note: String(target?.note || '').trim(),
      status: target?.status || 'pending',
      confirmedAt: target?.confirmedAt || null,
      lastInboundPreview: target?.lastInboundPreview || null,
    }))
    .filter((target) => target.address || target.listingAgentPhone);
}

function buildMapsDirectionsUrl(stops) {
  const encoded = stops.map((stop) => encodeURIComponent(stop)).filter(Boolean);
  if (encoded.length === 0) return null;
  if (encoded.length === 1) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encoded[0]}`;
  }
  const origin = encoded[0];
  const destination = encoded[encoded.length - 1];
  const waypoints = encoded.slice(1, -1).join('|');
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${waypoints}` : ''}`;
}

function classifyInbound(body) {
  const text = String(body || '').trim();
  if (!text) return 'pending';
  if (DECLINE_RE.test(text)) return 'declined';
  if (CONFIRM_RE.test(text)) return 'confirmed';
  return 'pending';
}

async function assertScheduleOwner(db, scheduleId, uid) {
  const ref = db.collection('buyerSchedules').doc(scheduleId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Schedule not found');
  }
  const schedule = snap.data();
  if (schedule.ownerUid !== uid) {
    throw new HttpsError('permission-denied', 'Not allowed');
  }
  return { ref, schedule };
}

async function upsertSmsRouting(db, contactPhone, data) {
  await db.collection('smsRouting').doc(contactPhone).set({
    ...data,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function loadInboundBySchedule(db, scheduleId, since) {
  const snap = await db.collection('messages')
    .where('scheduleId', '==', scheduleId)
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(since))
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get();
  return snap.docs.map((doc) => doc.data());
}

async function loadInboundByPhone(db, phone, since) {
  const normalized = normalizePhone(phone);
  if (!normalized) return [];
  const snap = await db.collection('messages')
    .where('contactPhone', '==', normalized)
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(since))
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  return snap.docs.map((doc) => doc.data());
}

function resolveTargetStatus(target, scheduleMessages, phoneMessages) {
  const normalizedPhone = normalizePhone(target.listingAgentPhone);
  const inbound = [...scheduleMessages, ...phoneMessages]
    .filter((message) => message.direction === 'inbound')
    .filter((message) => !normalizedPhone || message.contactPhone === normalizedPhone)
    .sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });

  if (inbound.length === 0) {
    return { status: target.status || 'pending', lastInboundPreview: target.lastInboundPreview || null };
  }

  const latest = inbound[0];
  const status = classifyInbound(latest.body);
  return {
    status,
    lastInboundPreview: String(latest.body || '').slice(0, 160),
    confirmedAt: status === 'confirmed' ? latest.createdAt || null : null,
  };
}

async function collateScheduleTargets(db, schedule) {
  const since = new Date(Date.now() - CONFIRM_WINDOW_MS);
  const scheduleMessages = await loadInboundBySchedule(db, schedule.id || schedule.scheduleId, since);
  const updatedTargets = [];

  for (const target of schedule.targets || []) {
    const phoneMessages = target.listingAgentPhone
      ? await loadInboundByPhone(db, target.listingAgentPhone, since)
      : [];
    const resolved = resolveTargetStatus(target, scheduleMessages, phoneMessages);
    updatedTargets.push({
      ...target,
      status: resolved.status,
      lastInboundPreview: resolved.lastInboundPreview,
      confirmedAt: resolved.confirmedAt || target.confirmedAt || null,
    });
  }

  return updatedTargets;
}

function buildShowingRequestMessage({ agentName, address, availability, note }) {
  const windowLabel = formatAvailabilityWindow(availability);
  const noteSuffix = note ? ` Note: ${note}.` : '';
  return (
    `Hi, this is ${agentName} via RE AIssistant. I'd like to schedule a showing for ${address} on ${windowLabel}.${noteSuffix} ` +
    'Please reply YES to confirm or NO if unavailable. Reply STOP to opt out.'
  );
}

exports.sendBuyerShowingRequests = onCall(
  { secrets: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'] },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Must be authenticated');
      }

      const {
        scheduleId = null,
        availability,
        targets,
        buyerName = null,
      } = request.data || {};

      const db = admin.firestore();
      const teamId = await getUserTeamIdOrNull(request.auth.uid);
      const normalizedTargets = normalizeTargets(targets);

      if (!availability?.date || !availability?.start || !availability?.end) {
        throw new HttpsError('invalid-argument', 'availability.date, start, and end are required');
      }
      if (normalizedTargets.length === 0) {
        throw new HttpsError('invalid-argument', 'At least one property target is required');
      }

      let scheduleRef;
      let scheduleData;

      if (scheduleId) {
        const owned = await assertScheduleOwner(db, scheduleId, request.auth.uid);
        scheduleRef = owned.ref;
        scheduleData = owned.schedule;
      } else {
        scheduleRef = db.collection('buyerSchedules').doc();
        scheduleData = {};
      }

      const profileSnap = await db.collection('users').doc(request.auth.uid).get();
      const profile = profileSnap.exists ? profileSnap.data() : null;
      const agentName = buyerName || getAgentDisplayName(request.auth.token, profile);
      const fromPhone = getTwilioFromNumber();
      const normalizedAgentPhone = normalizePhone(fromPhone);
      const agentEmail = request.auth.token.email || null;

      let sentCount = 0;
      const sentTargets = [...normalizedTargets];

      for (const target of sentTargets) {
        if (!target.listingAgentPhone) continue;

        const normalizedTo = normalizePhone(target.listingAgentPhone);
        const dncDoc = await db.collection('dnc').doc(normalizedTo).get();
        if (dncDoc.exists) {
          target.status = 'declined';
          target.lastInboundPreview = 'Recipient opted out (DNC)';
          continue;
        }

        const body = buildShowingRequestMessage({
          agentName,
          address: target.address || 'the property',
          availability,
          note: target.note,
        });

        const sent = await getTwilioClient().messages.create({
          body,
          from: fromPhone,
          to: normalizedTo,
        });

        const threadKey = `${normalizedAgentPhone}::${normalizedTo}`;
        await db.collection('messages').add({
          threadKey,
          agentUid: request.auth.uid,
          agentEmail,
          agentPhone: normalizedAgentPhone,
          contactPhone: normalizedTo,
          direction: 'outbound',
          body,
          twilioSid: sent.sid,
          scheduleId: scheduleRef.id,
          messageType: 'buyer_showing_request',
          listingId: null,
          offerId: null,
          teamId: teamId || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          read: true,
        });

        await upsertSmsRouting(db, normalizedTo, {
          agentUid: request.auth.uid,
          agentEmail,
          agentPhone: normalizedAgentPhone,
          teamId: teamId || null,
          scheduleId: scheduleRef.id,
        });

        target.status = 'pending';
        sentCount += 1;
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      await scheduleRef.set({
        ownerUid: request.auth.uid,
        teamId: teamId || null,
        buyerName: agentName,
        availability,
        targets: sentTargets,
        status: sentCount > 0 ? 'requests_sent' : 'draft',
        sentAt: sentCount > 0 ? now : scheduleData.sentAt || null,
        updatedAt: now,
        createdAt: scheduleData.createdAt || now,
      }, { merge: true });

      return {
        success: true,
        scheduleId: scheduleRef.id,
        sentCount,
        skippedCount: sentTargets.filter((target) => target.listingAgentPhone && target.status === 'declined').length,
      };
    } catch (error) {
      console.error('sendBuyerShowingRequests error:', error);
      if (error instanceof HttpsError) throw error;
      if (String(error.message || '').includes('Twilio is not configured')) {
        throw new HttpsError('failed-precondition', error.message);
      }
      throw new HttpsError('internal', 'Failed to send showing requests');
    }
  }
);

exports.buildBuyerRoute = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { scheduleId } = request.data || {};
    if (!scheduleId) {
      throw new HttpsError('invalid-argument', 'scheduleId is required');
    }

    const db = admin.firestore();
    const { ref: scheduleRef, schedule } = await assertScheduleOwner(db, scheduleId, request.auth.uid);
    const scheduleWithId = { ...schedule, id: scheduleId, scheduleId };
    const updatedTargets = await collateScheduleTargets(db, scheduleWithId);

    const orderedStops = updatedTargets
      .filter((target) => target.status === 'confirmed')
      .map((target) => target.address)
      .filter(Boolean);

    const mapsLink = buildMapsDirectionsUrl(orderedStops);
    const now = admin.firestore.FieldValue.serverTimestamp();
    let shareTokenId = schedule.shareTokenId || null;
    let shareLink = null;

    if (orderedStops.length > 0 && mapsLink) {
      const tokenRef = shareTokenId
        ? db.collection('clientPlanTokens').doc(shareTokenId)
        : db.collection('clientPlanTokens').doc();
      shareTokenId = tokenRef.id;
      await tokenRef.set({
        scheduleId,
        ownerUid: request.auth.uid,
        expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + TOKEN_TTL_MS)),
        createdAt: now,
      }, { merge: true });
      shareLink = `${getFrontendUrl()}/client/plan?t=${shareTokenId}`;
    }

    await scheduleRef.set({
      targets: updatedTargets,
      orderedStops,
      mapsLink: mapsLink || null,
      shareTokenId: shareTokenId || null,
      status: orderedStops.length > 0 ? 'route_ready' : 'requests_sent',
      routeBuiltAt: orderedStops.length > 0 ? now : schedule.routeBuiltAt || null,
      updatedAt: now,
    }, { merge: true });

    return {
      success: true,
      scheduleId,
      confirmations: updatedTargets.map((target) => ({
        address: target.address,
        listingAgentPhone: target.listingAgentPhone,
        status: target.status,
        confirmed: target.status === 'confirmed',
        lastInboundPreview: target.lastInboundPreview || null,
      })),
      confirmedCount: orderedStops.length,
      orderedStops,
      mapsLink,
      shareLink,
    };
  } catch (error) {
    console.error('buildBuyerRoute error:', error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Failed to build buyer route');
  }
});

exports.getBuyerPlan = onCall(async (request) => {
  try {
    const { token } = request.data || {};
    if (!token) {
      throw new HttpsError('invalid-argument', 'token is required');
    }

    const db = admin.firestore();
    const tokenRef = db.collection('clientPlanTokens').doc(token);
    const tokenSnap = await tokenRef.get();
    if (!tokenSnap.exists) {
      throw new HttpsError('not-found', 'This plan link is invalid or has expired');
    }

    const tokenData = tokenSnap.data();
    const expiresAt = tokenData.expiresAt?.toDate?.();
    if (!expiresAt || expiresAt <= new Date()) {
      throw new HttpsError('failed-precondition', 'This plan link has expired');
    }

    const scheduleSnap = await db.collection('buyerSchedules').doc(tokenData.scheduleId).get();
    if (!scheduleSnap.exists) {
      throw new HttpsError('not-found', 'Showing plan not found');
    }

    const schedule = scheduleSnap.data();
    const orderedStops = Array.isArray(schedule.orderedStops) ? schedule.orderedStops : [];

    return {
      success: true,
      buyerName: schedule.buyerName || 'Your agent',
      availability: schedule.availability || null,
      orderedStops,
      mapsLink: schedule.mapsLink || null,
      stopCount: orderedStops.length,
      expiresAt: expiresAt.toISOString(),
    };
  } catch (error) {
    console.error('getBuyerPlan error:', error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Failed to load buyer plan');
  }
});
