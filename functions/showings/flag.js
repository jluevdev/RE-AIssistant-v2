function smartShowingsEnabled(env = process.env) {
  return String(env.SMART_SHOWINGS_ENABLED || '').trim().toLowerCase() === 'true';
}

function smsMode(env = process.env) {
  const value = String(env.SMART_SHOWINGS_SMS_MODE || 'mock').trim().toLowerCase();
  return value === 'live' ? 'live' : 'mock';
}

function emailMode(env = process.env) {
  const value = String(env.SMART_SHOWINGS_EMAIL_MODE || 'mock').trim().toLowerCase();
  return value === 'live' ? 'live' : 'mock';
}

module.exports = {
  smartShowingsEnabled,
  smsMode,
  emailMode,
};
