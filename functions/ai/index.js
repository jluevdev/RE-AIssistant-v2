const { onCall, HttpsError } = require('firebase-functions/v2/https');
const helpBot = require('./helpBot');
const assistant = require('./assistant');
const credentials = require('./credentials');

function stub(name) {
  return onCall(async () => {
    throw new HttpsError('unimplemented', `${name} not implemented — port when needed`);
  });
}

exports.processPDF = stub('processPDF');
exports.enhanceMessage = stub('enhanceMessage');
exports.askHelpBot = helpBot.askHelpBot;
exports.askAssistant = assistant.askAssistant;
exports.saveAiCredential = credentials.saveAiCredential;
exports.clearAiCredential = credentials.clearAiCredential;
exports.getAiCredential = credentials.getAiCredential;
exports.getPlatformAi = credentials.getPlatformAi;
exports.savePlatformAiKey = credentials.savePlatformAiKey;
exports.listAssistantBots = require('./bots').listAssistantBots;
exports.saveAssistantBot = require('./bots').saveAssistantBot;
exports.setActiveAssistantBot = require('./bots').setActiveAssistantBot;
exports.queueTourFollowup = require('./desk').queueTourFollowup;
exports.queueDeadlineReminder = require('./desk').queueDeadlineReminder;
exports.createPersonalAssistant = require('./desk').createPersonalAssistant;
