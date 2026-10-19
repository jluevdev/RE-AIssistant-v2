const CANONICAL_APP_URL = 'https://reaissistant.com';

function isLocalHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
}

function isNonCanonicalHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return (
    host.endsWith('.web.app')
    || host.endsWith('.firebaseapp.com')
    || host === 'reaiassistant.com'
    || host === 'www.reaiassistant.com'
    || host === 'reaiassistant-v2.web.app'
  );
}

/**
 * Public links in texts and emails use reaissistant.com.
 * Firebase default hosting hosts and the misspelled reaiassistant.com domain
 * are rewritten so a missing or default FRONTEND_URL cannot leak the web.app host.
 * Localhost is kept so emulators still round-trip.
 */
function getPublicAppUrl(env = process.env) {
  const raw = String(env.FRONTEND_URL || '').trim().replace(/\/$/, '');
  if (!raw) return CANONICAL_APP_URL;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return CANONICAL_APP_URL;
  }
  if (isLocalHost(url.hostname)) return raw;
  if (isNonCanonicalHost(url.hostname)) return CANONICAL_APP_URL;
  if (url.hostname.toLowerCase() === 'www.reaissistant.com') return CANONICAL_APP_URL;
  return raw;
}

module.exports = {
  CANONICAL_APP_URL,
  getPublicAppUrl,
};
