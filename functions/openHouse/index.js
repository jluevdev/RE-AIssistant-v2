const handlers = require('./handlers');
const scheduler = require('./scheduler');

module.exports = {
  ...handlers,
  processOpenHouseReminders: scheduler.processOpenHouseReminders,
  processOpenHouseRemindersScheduled: scheduler.processOpenHouseRemindersScheduled,
};
