/**
 * Function defaults. Unset variables use these values.
 * Real SMS is one change after A2P 10DLC is approved:
 *   SMART_SHOWINGS_SMS_MODE=live
 * Real email is the same kind of change:
 *   SMART_SHOWINGS_EMAIL_MODE=live
 */
const DEFAULTS = {
  SMART_SHOWINGS_ENABLED: 'true',
  SMART_SHOWINGS_SMS_MODE: 'mock',
  SMART_SHOWINGS_EMAIL_MODE: 'mock',
};

function configured(env, key) {
  const value = env ? env[key] : undefined;
  if (value == null || String(value).trim() === '') return DEFAULTS[key];
  return String(value).trim();
}

module.exports = {
  DEFAULTS,
  configured,
};
