const { onCall } = require('firebase-functions/v2/https');

exports.healthCheck = onCall(async () => ({
  ok: true,
  version: 'v2-scaffold',
  message: 'RE AIssistant v2 functions loaded',
}));
