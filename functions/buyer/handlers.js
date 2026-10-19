const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { randomUUID } = require('crypto');
const { admin } = require('../shared/admin');
const { getUserTeamIdOrNull } = require('../shared/team');
const {
  normalizePhone,
  getTwilioClient,
  getTwilioFromNumber,
} = require('../shared/twilio');
const { parsePropertyUrls, ingestListingUrls, publicListingStops, mergePublicListingPhotos, normalizeTourKind, normalizeListingKind, normalizeContactRole } = require('./listingLinks');
const { assertSubscriptionActive } = require('../shared/subscription');
const { planOutboundSms, commitOutboundSms } = require('../shared/smsRouting');

const TOKEN_TTL_MS = 48 * 60 * 60 * 1000;
const CONFIRM_WINDOW_MS = 72 * 60 * 60 * 1000;

const CONFIRM_RE = /\b(confirm(ed)?|yes|yep|yeah|ok(ay)?|works|available|sounds good|see you then)\b/i;
const DECLINE_RE = /\b(no|decline(d)?|unavailable|can't|cannot|won't|not available|pass)\b/i;

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || 'https://reaiassistant.com').replace(/\/$/, '');
}

const MAX_CLIENT_NOTE = 600;

async function loadScheduleFromPlanToken(db, token) {
  if (!token) {
    throw new HttpsError('invalid-argument', 'token is required');
  }
  const tokenRef = db.collection('clientPlanTokens').doc(String(token));
  const tokenSnap = await tokenRef.get();
  if (!tokenSnap.exists) {
    throw new HttpsError('not-found', 'This plan link is invalid or has expired');
  }
  const tokenData = tokenSnap.data();
  const expiresAt = tokenData.expiresAt?.toDate?.();
  if (!expiresAt || expiresAt <= new Date()) {
    throw new HttpsError('failed-precondition', 'This plan link has expired');
  }
  if (!tokenData.scheduleId) {
    throw new HttpsError('failed-precondition', 'This plan is not ready');
  }
  const scheduleRef = db.collection('buyerSchedules').doc(tokenData.scheduleId);
  const scheduleSnap = await scheduleRef.get();
  if (!scheduleSnap.exists) {
    throw new HttpsError('not-found', 'Showing plan not found');
  }
  return { tokenRef, tokenData, expiresAt, scheduleRef, schedule: scheduleSnap.data() };
}

function ensureTargetIds(targets) {
  let changed = false;
  const next = (targets || []).map((target, index) => {
    if (target?.id) return target;
    changed = true;
    return { ...target, id: randomUUID() || `target-${index + 1}` };
  });
  return { targets: next, changed };
}

function recomputeFavoriteRanks(targets, favoriteOrder) {
  const confirmedInterested = targets.filter((target) => (
    target.status === 'confirmed' && target.clientInterest !== 'passed'
  ));
  const allowed = new Set(confirmedInterested.map((target) => target.id));
  let order = [];
  if (Array.isArray(favoriteOrder) && favoriteOrder.length) {
    order = favoriteOrder.map(String).filter((id) => allowed.has(id));
    confirmedInterested.forEach((target) => {
      if (!order.includes(target.id)) order.push(target.id);
    });
  } else {
    order = confirmedInterested
      .slice()
      .sort((a, b) => (Number(a.clientRank) || 999) - (Number(b.clientRank) || 999))
      .map((target) => target.id);
  }
  const rankById = new Map(order.map((id, index) => [id, index + 1]));
  return targets.map((target) => {
    if (target.status !== 'confirmed' || target.clientInterest === 'passed') {
      return { ...target, clientRank: null };
    }
    return { ...target, clientRank: rankById.get(target.id) || null };
  });
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
  const startLabel = formatTime12(start) || 'TBD';
  const endLabel = formatTime12(end) || 'TBD';
  return `${date} between ${startLabel} and ${endLabel}`;
}

function formatTime12(value) {
  if (!value) return '';
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(value);
  const minutes = match[2];
  let hours = Number(match[1]);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${suffix}`;
}

function normalizeBuyers(buyers) {
  if (!Array.isArray(buyers)) return [];
  const normalized = buyers
    .map((buyer, index) => ({
      id: buyer?.id || `buyer-${index + 1}`,
      name: String(buyer?.name || '').trim(),
      phone: String(buyer?.phone || '').trim(),
      email: String(buyer?.email || '').trim().toLowerCase(),
      role: buyer?.role === 'co_borrower' ? 'co_borrower' : 'primary',
    }))
    .filter((buyer) => buyer.name);

  if (normalized.length === 0) return [];
  if (!normalized.some((buyer) => buyer.role === 'primary')) {
    normalized[0].role = 'primary';
  }
  return normalized;
}

function formatHouseholdLabel(buyers, fallback = '') {
  const names = (buyers || []).map((buyer) => buyer.name).filter(Boolean);
  if (names.length === 0) return fallback;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

function publicBuyers(buyers) {
  return (buyers || []).map((buyer) => ({
    name: buyer.name,
    role: buyer.role === 'co_borrower' ? 'co_borrower' : 'primary',
  }));
}

function normalizeTargets(targets) {
  if (!Array.isArray(targets)) return [];
  return targets
    .map((target) => ({
      id: target?.id || randomUUID(),
      address: String(target?.address || '').trim(),
      listingAgentPhone: String(target?.listingAgentPhone || '').trim(),
      listingAgentName: String(target?.listingAgentName || '').trim(),
      listingAgentEmail: String(target?.listingAgentEmail || '').trim().toLowerCase(),
      brokerage: String(target?.brokerage || '').trim(),
      dreNumber: String(target?.dreNumber || '').replace(/\D/g, ''),
      mlsNumber: String(target?.mlsNumber || '').trim(),
      listingKind: normalizeListingKind(target?.listingKind) || '',
      contactRole: normalizeContactRole(target?.contactRole) || '',
      photoUrl: String(target?.photoUrl || '').trim().slice(0, 2000),
      sourceUrl: String(target?.sourceUrl || '').trim(),
      price: String(target?.price || '').trim(),
      parseStatus: target?.parseStatus || null,
      phoneSource: target?.phoneSource === 'web_search' ? 'web_search' : '',
      confidence: target?.confidence || null,
      note: String(target?.note || '').trim(),
      status: target?.status || 'pending',
      confirmedAt: target?.confirmedAt || null,
      lastInboundPreview: target?.lastInboundPreview || null,
      clientNote: String(target?.clientNote || '').trim().slice(0, 600),
      clientRank: Number.isFinite(Number(target?.clientRank)) ? Number(target.clientRank) : null,
      clientInterest: target?.clientInterest === 'passed' ? 'passed' : 'interested',
    }))
    .filter((target) => target.address || target.listingAgentPhone || target.sourceUrl);
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

function buildShowingRequestMessage({
  agentName,
  householdLabel,
  address,
  availability,
  note,
  tourKind,
  contactName,
}) {
  const windowLabel = formatAvailabilityWindow(availability);
  const noteSuffix = note ? ` Note: ${note}.` : '';
  const forHousehold = householdLabel ? ` for ${householdLabel}` : '';
  const firstName = String(contactName || '').trim().split(/\s+/)[0] || '';
  if (normalizeTourKind(tourKind) === 'rental') {
    const greeting = firstName ? `Hi ${firstName}, this is ${agentName}` : `Hi, this is ${agentName}`;
    return (
      `${greeting} via RE AIssistant. I'd like to schedule a rental showing for ${address} on ${windowLabel}${forHousehold}.${noteSuffix} ` +
      'Please reply YES to confirm or NO if unavailable. Reply STOP to opt out.'
    );
  }
  return (
    `Hi, this is ${agentName} via RE AIssistant. I'd like to schedule a showing for ${address} on ${windowLabel}${forHousehold}.${noteSuffix} ` +
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
      await assertSubscriptionActive(request.auth.uid);

      const {
        scheduleId = null,
        availability,
        targets,
        buyers = [],
        agentName: agentNameInput = null,
        buyerName = null,
        tourKind: requestedTourKind = null,
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
      const agentName = agentNameInput || getAgentDisplayName(request.auth.token, profile);
      const household = normalizeBuyers(Array.isArray(buyers) && buyers.length ? buyers : scheduleData.buyers);
      const householdLabel = formatHouseholdLabel(household, buyerName || '');
      const tourKind = scheduleId
        ? normalizeTourKind(scheduleData.tourKind || requestedTourKind)
        : normalizeTourKind(requestedTourKind);
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
          householdLabel,
          address: target.address || 'the property',
          availability,
          note: target.note,
          tourKind,
          contactName: target.listingAgentName,
        });

        const planned = await planOutboundSms(db, {
          contactPhone: normalizedTo,
          agentUid: request.auth.uid,
          agentEmail,
          agentPhone: normalizedAgentPhone,
          teamId: teamId || null,
          scheduleId: scheduleRef.id,
        }, body);

        const sent = await getTwilioClient().messages.create({
          body: planned.body,
          from: fromPhone,
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
          scheduleId: scheduleRef.id,
          messageType: 'buyer_showing_request',
          listingId: null,
          offerId: null,
          teamId: teamId || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          read: true,
        });

        await commitOutboundSms(db, planned);

        target.status = 'pending';
        sentCount += 1;
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      await scheduleRef.set({
        ownerUid: request.auth.uid,
        teamId: teamId || null,
        agentName,
        buyers: household,
        buyerName: householdLabel || agentName,
        availability,
        targets: sentTargets,
        tourKind,
        status: sentCount > 0 ? 'requests_sent' : 'draft',
        needsReview: false,
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
    await assertSubscriptionActive(request.auth.uid);

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
        publicListings: publicListingStops(updatedTargets),
        tourKind: normalizeTourKind(schedule.tourKind),
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
        clientNote: target.clientNote || '',
        clientRank: target.clientRank || null,
        clientInterest: target.clientInterest === 'passed' ? 'passed' : 'interested',
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

exports.getBuyerPlan = onCall({ timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  try {
    const db = admin.firestore();
    const { tokenRef, tokenData, expiresAt, scheduleRef, schedule } = await loadScheduleFromPlanToken(db, request.data?.token);
    const ensured = ensureTargetIds(schedule.targets);
    const targets = ensured.targets;
    if (ensured.changed) {
      await scheduleRef.set({ targets }, { merge: true });
    }
    const listings = mergePublicListingPhotos(
      publicListingStops(targets),
      tokenData.publicListings || tokenData.publicPlan?.listings || [],
    );
    const orderedStops = Array.isArray(schedule.orderedStops) && schedule.orderedStops.length
      ? schedule.orderedStops
      : listings.filter((stop) => stop.status === 'confirmed').map((stop) => stop.address);
    const household = Array.isArray(schedule.buyers) ? schedule.buyers : [];
    const householdLabel = formatHouseholdLabel(household, schedule.buyerName || '');
    const payload = {
      success: true,
      buyerName: householdLabel || schedule.agentName || 'Your agent',
      agentName: schedule.agentName || null,
      buyers: publicBuyers(household),
      tourKind: normalizeTourKind(schedule.tourKind),
      availability: schedule.availability || null,
      listings,
      orderedStops,
      mapsLink: schedule.mapsLink || null,
      stopCount: orderedStops.length,
      pendingCount: listings.filter((stop) => stop.status === 'pending').length,
      expiresAt: expiresAt.toISOString(),
      canSubmitListings: true,
    };
    await tokenRef.set({
      publicListings: listings,
      publicPlan: payload,
      tourKind: payload.tourKind,
    }, { merge: true });

    return payload;
  } catch (error) {
    console.error('getBuyerPlan error:', error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Failed to load buyer plan');
  }
});

exports.updateBuyerShowingFeedback = onCall({ cors: true }, async (request) => {
  try {
    const db = admin.firestore();
    const { tokenRef, tokenData, scheduleRef, schedule } = await loadScheduleFromPlanToken(db, request.data?.token);
    const ensured = ensureTargetIds(schedule.targets);
    let targets = ensured.targets;
    const updates = Array.isArray(request.data?.updates) ? request.data.updates : [];

    for (const update of updates) {
      const id = String(update?.id || '');
      const address = String(update?.address || '').trim();
      const idx = targets.findIndex((target) => (
        (id && target.id === id) || (address && target.address === address)
      ));
      if (idx < 0) continue;
      const next = { ...targets[idx] };
      if (Object.prototype.hasOwnProperty.call(update, 'clientNote')) {
        next.clientNote = String(update.clientNote || '').trim().slice(0, MAX_CLIENT_NOTE);
      }
      if (update?.clientInterest === 'passed' || update?.clientInterest === 'interested') {
        next.clientInterest = update.clientInterest;
      }
      targets[idx] = next;
    }

    targets = recomputeFavoriteRanks(targets, request.data?.favoriteOrder);

    await scheduleRef.set({
      targets,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const listings = publicListingStops(targets);
    if (tokenData.scheduleId) {
      await tokenRef.set({ publicListings: listings }, { merge: true });
    }

    return { success: true, listings };
  } catch (error) {
    console.error('updateBuyerShowingFeedback error:', error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Failed to save showing notes');
  }
});

const LISTING_PARSE_OPTS = {
  cors: true,
  timeoutSeconds: 120,
  memory: '512MiB',
};

exports.parsePropertyLinks = onCall(LISTING_PARSE_OPTS, async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const urls = Array.isArray(request.data?.urls) ? request.data.urls : [];
    const tourKind = normalizeTourKind(request.data?.tourKind);
    const listings = await parsePropertyUrls(urls, { tourKind });
    if (listings.length === 0) {
      throw new HttpsError('invalid-argument', 'Paste Zillow, Redfin, or Realtor.com links');
    }

    return {
      success: true,
      listings,
      imported: listings.length,
      needsReview: listings.some((row) => !row.target?.listingAgentPhone || row.target?.parseStatus !== 'ok'),
    };
  } catch (error) {
    console.error('parsePropertyLinks error:', error);
    if (error instanceof HttpsError) throw error;
    if (String(error.message || '').includes('GOOGLEAI_KEY')) {
      throw new HttpsError('failed-precondition', 'Listing import is not configured yet.');
    }
    throw new HttpsError('internal', error.message || 'Failed to parse listing links');
  }
});

exports.submitBuyerListingLinks = onCall(LISTING_PARSE_OPTS, async (request) => {
  try {
    const { token, urls } = request.data || {};
    if (!token) {
      throw new HttpsError('invalid-argument', 'token is required');
    }

    const db = admin.firestore();
    const tokenRef = db.collection('clientPlanTokens').doc(String(token));
    const tokenSnap = await tokenRef.get();
    if (!tokenSnap.exists) {
      throw new HttpsError('not-found', 'This plan link is invalid or has expired');
    }

    const tokenData = tokenSnap.data();
    const expiresAt = tokenData.expiresAt?.toDate?.();
    if (!expiresAt || expiresAt <= new Date()) {
      throw new HttpsError('failed-precondition', 'This plan link has expired');
    }
    if (!tokenData.scheduleId || !tokenData.ownerUid) {
      throw new HttpsError('failed-precondition', 'This plan is not ready to accept listings');
    }

    const result = await ingestListingUrls({
      db,
      urls: Array.isArray(urls) ? urls : [],
      agentUid: tokenData.ownerUid,
      scheduleId: tokenData.scheduleId,
      source: 'portal',
    });

    return {
      success: true,
      imported: result.imported,
      needsReview: result.needsReview,
      scheduleId: result.scheduleId,
      listings: result.publicStops || [],
    };
  } catch (error) {
    console.error('submitBuyerListingLinks error:', error);
    if (error instanceof HttpsError) throw error;
    if (error.message === 'NO_VALID_URLS') {
      throw new HttpsError('invalid-argument', 'Paste Zillow, Redfin, or Realtor.com links');
    }
    if (String(error.message || '').includes('GOOGLEAI_KEY')) {
      throw new HttpsError('failed-precondition', 'Listing import is not configured yet.');
    }
    throw new HttpsError('internal', error.message || 'Failed to submit listing links');
  }
});
