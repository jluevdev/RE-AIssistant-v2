const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { processOpenHouseReminders } = require('./handlers');

exports.processOpenHouseReminders = onRequest(async (req, res) => {
  try {
    const result = await processOpenHouseReminders();
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('processOpenHouseReminders error', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

exports.processOpenHouseRemindersScheduled = onSchedule(
  { schedule: 'every 5 minutes' },
  async () => {
    try {
      await processOpenHouseReminders();
    } catch (error) {
      console.error('processOpenHouseRemindersScheduled error', error);
    }
  }
);
