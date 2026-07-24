const { onCall, HttpsError } = require('firebase-functions/v2/https');
const helpBot = require('./helpBot');

function stub(name) {
  return onCall(async () => {
    throw new HttpsError('unimplemented', `${name} not implemented — port when needed`);
  });
}

exports.processPDF = stub('processPDF');
exports.enhanceMessage = stub('enhanceMessage');
exports.askHelpBot = helpBot.askHelpBot;
