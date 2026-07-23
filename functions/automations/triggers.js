const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { admin } = require('../shared/admin');
const {
  loadSettings,
  loadAgentProfile,
  enqueueTask,
  buildTasksForOpenHouseVisitor,
  buildTasksForOffer,
  buildTaskForOpenHouseReminder,
} = require('./enqueue');

const TWILIO_SECRETS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];
const EMAIL_SECRETS = ['SENDGRID_API_KEY'];

exports.onOpenHouseVisitorCreated = onDocumentCreated(
  {
    document: 'openHouseVisitors/{visitorId}',
    secrets: [...TWILIO_SECRETS, ...EMAIL_SECRETS],
  },
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;
      const visitor = { id: snap.id, ...snap.data() };
      const ownerUid = visitor.agentId;
      if (!ownerUid) return;

      const db = admin.firestore();
      let openHouse = {};
      if (visitor.openHouseId) {
        const ohSnap = await db.collection('openHouses').doc(visitor.openHouseId).get();
        if (ohSnap.exists) openHouse = { id: ohSnap.id, ...ohSnap.data() };
      }

      const settings = await loadSettings(db, ownerUid);
      const agentProfile = await loadAgentProfile(db, ownerUid);
      const tasks = buildTasksForOpenHouseVisitor(visitor, openHouse, agentProfile, settings);

      for (const task of tasks) {
        await enqueueTask(db, task);
      }
    } catch (error) {
      console.error('onOpenHouseVisitorCreated error:', error);
    }
  }
);

exports.onOfferFinalized = onDocumentUpdated(
  {
    document: 'offers/{offerId}',
    secrets: [...TWILIO_SECRETS, ...EMAIL_SECRETS],
  },
  async (event) => {
    try {
      const before = event.data?.before?.data() || {};
      const afterSnap = event.data?.after;
      if (!afterSnap) return;
      const after = { id: afterSnap.id, ...afterSnap.data() };

      if (before.finalized === true || after.finalized !== true) return;
      if (!after.ownerUid) return;

      const db = admin.firestore();
      const settings = await loadSettings(db, after.ownerUid);
      const agentProfile = await loadAgentProfile(db, after.ownerUid);
      const tasks = buildTasksForOffer(after, agentProfile, settings);

      for (const task of tasks) {
        await enqueueTask(db, task);
      }
    } catch (error) {
      console.error('onOfferFinalized error:', error);
    }
  }
);

exports.onOpenHouseCreated = onDocumentCreated(
  {
    document: 'openHouses/{openHouseId}',
    secrets: [...TWILIO_SECRETS, ...EMAIL_SECRETS],
  },
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;
      const openHouse = { id: snap.id, ...snap.data() };
      const ownerUid = openHouse.agentId || openHouse.ownerUid;
      if (!ownerUid) return;

      const db = admin.firestore();
      const settings = await loadSettings(db, ownerUid);
      if (!settings.rules?.openHouseAgentReminderSms?.enabled) return;

      const agentProfile = await loadAgentProfile(db, ownerUid);
      const task = buildTaskForOpenHouseReminder(openHouse, agentProfile, settings);
      if (task) await enqueueTask(db, task);
    } catch (error) {
      console.error('onOpenHouseCreated error:', error);
    }
  }
);
