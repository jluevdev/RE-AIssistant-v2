const worker = require('./worker');
const triggers = require('./triggers');

module.exports = {
  processScheduledTasksHttp: worker.processScheduledTasksHttp,
  processScheduledTasksScheduled: worker.processScheduledTasksScheduled,
  onOpenHouseVisitorCreated: triggers.onOpenHouseVisitorCreated,
  onOfferFinalized: triggers.onOfferFinalized,
  onOpenHouseCreated: triggers.onOpenHouseCreated,
};

// Re-export core processor for legacy open-house reminder wrapper
module.exports._processScheduledTasks = worker.processScheduledTasks;
