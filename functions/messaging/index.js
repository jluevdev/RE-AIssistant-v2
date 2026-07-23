const { onCall, HttpsError } = require('firebase-functions/v2/https');
const handlers = require('./handlers');

function stub(name) {
  return onCall(async () => {
    throw new HttpsError('unimplemented', `${name} not implemented in v2 yet`);
  });
}

module.exports = {
  ...handlers,
  sendAgentMessage: stub('sendAgentMessage'),
  getConversation: stub('getConversation'),
  getAgentConversations: stub('getAgentConversations'),
  getUnreadCount: stub('getUnreadCount'),
};
