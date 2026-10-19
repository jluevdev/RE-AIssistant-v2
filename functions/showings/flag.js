const { configured } = require('./config');

function smartShowingsEnabled(env = process.env) {
  return configured(env, 'SMART_SHOWINGS_ENABLED').toLowerCase() === 'true';
}

function smsMode(env = process.env) {
  return configured(env, 'SMART_SHOWINGS_SMS_MODE').toLowerCase() === 'live' ? 'live' : 'mock';
}

function emailMode(env = process.env) {
  return configured(env, 'SMART_SHOWINGS_EMAIL_MODE').toLowerCase() === 'live' ? 'live' : 'mock';
}

module.exports = {
  smartShowingsEnabled,
  smsMode,
  emailMode,
};
