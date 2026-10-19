const handlers = require('./handlers');

module.exports = {
  getSmartShowingsHome: handlers.getSmartShowingsHome,
  queueBuyerShowing: handlers.queueBuyerShowing,
  receiveShowingRequest: handlers.receiveShowingRequest,
  decideShowingApproval: handlers.decideShowingApproval,
  saveShowingProfile: handlers.saveShowingProfile,
  extractShowingCard: handlers.extractShowingCard,
  attestCounterparty: handlers.attestCounterparty,
};
