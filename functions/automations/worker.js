const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { admin } = require('../shared/admin');
const {
  normalizePhone,
  getTwilioClient,
  getTwilioFromNumber,
} = require('../shared/twilio');
const { sendEmail } = require('../shared/email');
const { loadSettings } = require('./enqueue');

const TWILIO_SECRETS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];
// SendGrid is optional (same pattern as openHouse handlers) — not required in Secret Manager.

const RULE_KEY_BY_TYPE = {
  open_house_visitor_sms: 'openHouseVisitorSms',
  open_house_visitor_email: 'openHouseVisitorEmail',
  open_house_agent_reminder_sms: 'openHouseAgentReminderSms',
  offer_buyer_agent_sms: 'offerBuyerAgentSms',
  offer_buyer_agent_email: 'offerBuyerAgentEmail',
  buyer_tour_followup_sms: 'buyerTourFollowupSms',
};

async function upsertSmsRouting(db, contactPhone, data) {
  await db.collection('smsRouting').doc(contactPhone).set(
    {
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function logOutboundMessage(db, task, twilioSid) {
  const contactPhone = normalizePhone(task.contactPhone);
  if (!contactPhone || !task.ownerUid) return;

  const agentPhone = normalizePhone(getTwilioFromNumber());
  const threadKey = `${agentPhone}::${contactPhone}`;

  await db.collection('messages').add({
    threadKey,
    agentUid: task.ownerUid,
    agentEmail: null,
    agentPhone,
    contactPhone,
    direction: 'outbound',
    body: task.payload?.body || '',
    twilioSid: twilioSid || null,
    listingId: task.meta?.listingId || null,
    offerId: task.meta?.offerId || null,
    scheduleId: null,
    messageType: 'automation',
    teamId: task.teamId || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    read: true,
  });

  await upsertSmsRouting(db, contactPhone, {
    agentUid: task.ownerUid,
    agentPhone,
    teamId: task.teamId || null,
    offerId: task.meta?.offerId || null,
    listingId: task.meta?.listingId || null,
  });
}

async function isOnDnc(db, phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return true;
  const snap = await db.collection('dnc').doc(normalized).get();
  return snap.exists;
}

async function processOneTask(db, docSnap) {
  const ref = docSnap.ref;
  const task = { id: docSnap.id, ...docSnap.data() };

  try {
    const settings = await loadSettings(db, task.ownerUid);
    const ruleKey = RULE_KEY_BY_TYPE[task.type];
    const rule = ruleKey ? settings.rules?.[ruleKey] : null;

    if (rule && rule.enabled === false) {
      await ref.update({
        status: 'canceled',
        canceledAt: admin.firestore.FieldValue.serverTimestamp(),
        lastError: 'rule_disabled',
      });
      return { status: 'canceled' };
    }

    if (task.channel === 'sms') {
      if (!task.contactPhone) {
        await ref.update({
          status: 'skipped',
          lastError: 'no_phone',
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { status: 'skipped' };
      }

      if (await isOnDnc(db, task.contactPhone)) {
        await ref.update({
          status: 'skipped',
          lastError: 'dnc',
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { status: 'skipped' };
      }

      const sent = await getTwilioClient().messages.create({
        body: task.payload?.body || '',
        from: getTwilioFromNumber(),
        to: normalizePhone(task.contactPhone),
      });

      await logOutboundMessage(db, task, sent.sid);
      await ref.update({
        status: 'sent',
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        attempts: (task.attempts || 0) + 1,
        lastError: null,
      });
      return { status: 'sent' };
    }

    if (task.channel === 'email') {
      if (!task.contactEmail) {
        await ref.update({
          status: 'skipped',
          lastError: 'no_email',
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { status: 'skipped' };
      }

      await sendEmail({
        to: task.contactEmail,
        subject: task.payload?.subject || 'RE AIssistant',
        text: task.payload?.body || '',
        html: task.payload?.html || null,
      });

      await ref.update({
        status: 'sent',
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        attempts: (task.attempts || 0) + 1,
        lastError: null,
      });
      return { status: 'sent' };
    }

    await ref.update({
      status: 'skipped',
      lastError: 'unknown_channel',
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { status: 'skipped' };
  } catch (error) {
    const attempts = (task.attempts || 0) + 1;
    const maxAttempts = task.maxAttempts || 3;
    const failed = attempts >= maxAttempts;
    const patch = {
      attempts,
      lastError: error.message || String(error),
    };
    if (failed) {
      patch.status = 'failed';
      patch.sentAt = admin.firestore.FieldValue.serverTimestamp();
    } else {
      // Retry in 15 minutes * attempts
      patch.runAt = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + attempts * 15 * 60 * 1000)
      );
      patch.status = 'scheduled';
    }
    await ref.update(patch);
    return { status: failed ? 'failed' : 'retry' };
  }
}

/**
 * Process due scheduledTasks. Also drains legacy openHouseReminders into one-shot sends
 * (with dnc) so old docs don't sit forever — marks them migrated/sent/skipped.
 */
async function processScheduledTasks() {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.fromDate(new Date());

  const due = await db
    .collection('scheduledTasks')
    .where('status', '==', 'scheduled')
    .where('runAt', '<=', now)
    .limit(100)
    .get();

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let canceled = 0;

  for (const docSnap of due.docs) {
    const result = await processOneTask(db, docSnap);
    if (result.status === 'sent') sent += 1;
    else if (result.status === 'skipped') skipped += 1;
    else if (result.status === 'failed') failed += 1;
    else if (result.status === 'canceled') canceled += 1;
  }

  // Legacy drain: openHouseReminders still scheduled
  const legacy = await db
    .collection('openHouseReminders')
    .where('status', '==', 'scheduled')
    .where('runAt', '<=', now)
    .limit(50)
    .get();

  let legacyProcessed = 0;
  for (const docSnap of legacy.docs) {
    const reminderRef = docSnap.ref;
    const reminder = docSnap.data();
    try {
      const ohSnap = await db.collection('openHouses').doc(reminder.openHouseId).get();
      if (!ohSnap.exists) {
        await reminderRef.update({ status: 'skipped', reason: 'openHouseNotFound' });
        continue;
      }
      const oh = ohSnap.data();
      const toPhone = oh.agentPhone || null;
      if (!toPhone) {
        await reminderRef.update({ status: 'skipped', reason: 'noAgentPhone' });
        continue;
      }
      if (await isOnDnc(db, toPhone)) {
        await reminderRef.update({ status: 'skipped', reason: 'dnc' });
        continue;
      }
      const messageBody = `Reminder: ${oh.title || 'Open House'} at ${oh.address} starts in ~1 hour (${oh.startTime}).`;
      await getTwilioClient().messages.create({
        body: messageBody,
        from: getTwilioFromNumber(),
        to: normalizePhone(toPhone),
      });
      await reminderRef.update({
        status: 'sent',
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        migratedTo: 'scheduledTasks_engine',
      });
      legacyProcessed += 1;
    } catch (err) {
      await reminderRef.update({
        status: 'failed',
        error: err.message,
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  return {
    processed: due.size,
    sent,
    skipped,
    failed,
    canceled,
    legacyProcessed,
  };
}

exports.processScheduledTasks = processScheduledTasks;

exports.processScheduledTasksHttp = onRequest(
  { secrets: [...TWILIO_SECRETS] },
  async (req, res) => {
    try {
      const result = await processScheduledTasks();
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error('processScheduledTasksHttp error', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  }
);

exports.processScheduledTasksScheduled = onSchedule(
  {
    schedule: 'every 5 minutes',
    secrets: [...TWILIO_SECRETS],
  },
  async () => {
    try {
      await processScheduledTasks();
    } catch (error) {
      console.error('processScheduledTasksScheduled error', error);
    }
  }
);
