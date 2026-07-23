const { admin } = require('../shared/admin');
const {
  mergeSettings,
  renderTemplate,
  resolveDelayMinutes,
  computeRunAt,
} = require('./settings');

async function loadSettings(db, ownerUid) {
  if (!ownerUid) return mergeSettings(null, null);
  const snap = await db.collection('automationSettings').doc(ownerUid).get();
  return mergeSettings(snap.exists ? snap.data() : null, ownerUid);
}

async function loadAgentProfile(db, ownerUid) {
  if (!ownerUid) return {};
  const snap = await db.collection('users').doc(ownerUid).get();
  return snap.exists ? snap.data() : {};
}

function agentDisplayName(profile, fallbackEmail) {
  return (
    profile?.fullName ||
    profile?.displayName ||
    profile?.name ||
    (fallbackEmail ? String(fallbackEmail).split('@')[0] : '') ||
    'Your agent'
  );
}

function baseTask({
  ownerUid,
  teamId,
  type,
  channel,
  runAt,
  dedupeKey,
  sourceType,
  sourceId,
  contactPhone,
  contactEmail,
  contactName,
  payload,
  meta,
}) {
  return {
    ownerUid: ownerUid || null,
    teamId: teamId || null,
    type,
    channel,
    status: 'scheduled',
    runAt: admin.firestore.Timestamp.fromDate(runAt),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    sentAt: null,
    canceledAt: null,
    attempts: 0,
    maxAttempts: 3,
    lastError: null,
    dedupeKey,
    sourceType,
    sourceId: String(sourceId),
    contactPhone: contactPhone || null,
    contactEmail: contactEmail || null,
    contactName: contactName || null,
    payload: payload || {},
    meta: meta || {},
  };
}

/**
 * Idempotent enqueue: skip if a scheduled/sent task with same dedupeKey exists.
 */
async function enqueueTask(db, task) {
  if (!task?.dedupeKey) return { enqueued: false, reason: 'missing_dedupeKey' };

  const existing = await db
    .collection('scheduledTasks')
    .where('dedupeKey', '==', task.dedupeKey)
    .limit(5)
    .get();

  const dupe = existing.docs.find((d) => {
    const status = d.data().status;
    return status === 'scheduled' || status === 'sent';
  });
  if (dupe) {
    return { enqueued: false, reason: 'duplicate', existingId: dupe.id };
  }

  const ref = await db.collection('scheduledTasks').add(task);
  return { enqueued: true, id: ref.id };
}

function buildTasksForOpenHouseVisitor(visitor, openHouse, agentProfile, settings) {
  const ownerUid = visitor.agentId || openHouse.agentId || openHouse.ownerUid;
  if (!ownerUid) return [];

  const vars = {
    visitorName: visitor.name || 'there',
    address: openHouse.address || 'the property',
    agentName: agentDisplayName(agentProfile),
    openHouseDate: openHouse.date || '',
    openHouseTime: openHouse.startTime || '',
  };

  const tasks = [];
  const now = visitor.checkInTime?.toDate
    ? visitor.checkInTime.toDate()
    : visitor.checkInTime
      ? new Date(visitor.checkInTime)
      : new Date();
  const visitorId = visitor.id || visitor.verificationId || `${ownerUid}_${visitor.phone || visitor.email}`;

  const smsRule = settings.rules.openHouseVisitorSms;
  if (smsRule?.enabled && visitor.phone) {
    const delay = resolveDelayMinutes(smsRule.delayPreset, smsRule.delayMinutes);
    const runAt = computeRunAt(now, delay, settings.global);
    const body = renderTemplate(smsRule.template, vars);
    tasks.push(
      baseTask({
        ownerUid,
        teamId: openHouse.teamId,
        type: 'open_house_visitor_sms',
        channel: 'sms',
        runAt,
        dedupeKey: `open_house_visitor_sms:${visitorId}`,
        sourceType: 'open_house',
        sourceId: visitorId,
        contactPhone: visitor.phone,
        contactName: visitor.name,
        payload: { body },
        meta: { openHouseId: openHouse.id || visitor.openHouseId },
      })
    );
  }

  const emailRule = settings.rules.openHouseVisitorEmail;
  if (emailRule?.enabled && visitor.email) {
    const delay = resolveDelayMinutes(emailRule.delayPreset, emailRule.delayMinutes);
    const runAt = computeRunAt(now, delay, settings.global);
    const body = renderTemplate(emailRule.template, vars);
    const subject = renderTemplate(emailRule.subject, vars);
    tasks.push(
      baseTask({
        ownerUid,
        teamId: openHouse.teamId,
        type: 'open_house_visitor_email',
        channel: 'email',
        runAt,
        dedupeKey: `open_house_visitor_email:${visitorId}`,
        sourceType: 'open_house',
        sourceId: visitorId,
        contactEmail: visitor.email,
        contactName: visitor.name,
        payload: { body, subject, html: null },
        meta: { openHouseId: openHouse.id || visitor.openHouseId },
      })
    );
  }

  return tasks;
}

function buildTasksForOffer(offer, agentProfile, settings) {
  const ownerUid = offer.ownerUid;
  if (!ownerUid) return [];
  const meta = offer.meta || {};
  const vars = {
    buyerAgentName: meta.buyerAgentName || 'there',
    hubSlug: offer.hubSlug || '',
    price: meta.price || 'N/A',
    agentName: agentDisplayName(agentProfile, offer.agentEmail),
  };
  const now = new Date();
  const offerId = offer.id;
  const tasks = [];

  const smsRule = settings.rules.offerBuyerAgentSms;
  if (smsRule?.enabled && meta.buyerAgentPhone) {
    const delay = resolveDelayMinutes(smsRule.delayPreset, smsRule.delayMinutes);
    const runAt = computeRunAt(now, delay, settings.global);
    tasks.push(
      baseTask({
        ownerUid,
        teamId: offer.teamId,
        type: 'offer_buyer_agent_sms',
        channel: 'sms',
        runAt,
        dedupeKey: `offer_buyer_agent_sms:${offerId}`,
        sourceType: 'offer',
        sourceId: offerId,
        contactPhone: meta.buyerAgentPhone,
        contactName: meta.buyerAgentName,
        payload: { body: renderTemplate(smsRule.template, vars) },
        meta: { offerId, listingId: offer.listingId || null },
      })
    );
  }

  const emailRule = settings.rules.offerBuyerAgentEmail;
  if (emailRule?.enabled && meta.buyerAgentEmail) {
    const delay = resolveDelayMinutes(emailRule.delayPreset, emailRule.delayMinutes);
    const runAt = computeRunAt(now, delay, settings.global);
    tasks.push(
      baseTask({
        ownerUid,
        teamId: offer.teamId,
        type: 'offer_buyer_agent_email',
        channel: 'email',
        runAt,
        dedupeKey: `offer_buyer_agent_email:${offerId}`,
        sourceType: 'offer',
        sourceId: offerId,
        contactEmail: meta.buyerAgentEmail,
        contactName: meta.buyerAgentName,
        payload: {
          body: renderTemplate(emailRule.template, vars),
          subject: renderTemplate(emailRule.subject, vars),
        },
        meta: { offerId, listingId: offer.listingId || null },
      })
    );
  }

  return tasks;
}

function buildTaskForOpenHouseReminder(openHouse, agentProfile, settings) {
  const rule = settings.rules.openHouseAgentReminderSms;
  if (!rule?.enabled) return null;

  const ownerUid = openHouse.agentId || openHouse.ownerUid;
  const toPhone = openHouse.agentPhone || agentProfile?.phone || null;
  if (!ownerUid || !toPhone || !openHouse.date || !openHouse.startTime) return null;

  const start = new Date(`${openHouse.date}T${openHouse.startTime}`);
  if (Number.isNaN(start.getTime())) return null;

  const minutesBefore = Number(rule.minutesBefore) || 60;
  let runAt = new Date(start.getTime() - minutesBefore * 60 * 1000);
  runAt = computeRunAt(runAt, 0, { ...settings.global, sendWindow: 'immediate' });

  // If already past, schedule ASAP (still respect quiet hours via computeRunAt on now)
  if (runAt.getTime() < Date.now()) {
    runAt = computeRunAt(new Date(), 0, settings.global);
  }

  const vars = {
    address: openHouse.address || 'your open house',
    minutesBefore: String(minutesBefore),
    openHouseTime: openHouse.startTime || '',
    agentName: agentDisplayName(agentProfile),
  };

  return baseTask({
    ownerUid,
    teamId: openHouse.teamId,
    type: 'open_house_agent_reminder_sms',
    channel: 'sms',
    runAt,
    dedupeKey: `open_house_agent_reminder_sms:${openHouse.id}`,
    sourceType: 'open_house',
    sourceId: openHouse.id,
    contactPhone: toPhone,
    contactName: agentDisplayName(agentProfile),
    payload: { body: renderTemplate(rule.template, vars) },
    meta: { openHouseId: openHouse.id },
  });
}

module.exports = {
  loadSettings,
  loadAgentProfile,
  enqueueTask,
  buildTasksForOpenHouseVisitor,
  buildTasksForOffer,
  buildTaskForOpenHouseReminder,
  agentDisplayName,
};
