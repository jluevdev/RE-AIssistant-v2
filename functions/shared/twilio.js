const twilio = require('twilio');

let twilioClient = null;

function normalizePhone(raw) {
  try {
    if (!raw) return '';
    const digits = String(raw).replace(/\D/g, '');
    const withCountry = digits.length === 11 && digits.startsWith('1')
      ? digits
      : `1${digits.padStart(10, '0').slice(-10)}`;
    return `+${withCountry}`;
  } catch {
    return '';
  }
}

function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !phoneNumber) {
    throw new Error(
      'Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.'
    );
  }
  return { accountSid, authToken, phoneNumber };
}

function getTwilioClient() {
  if (!twilioClient) {
    const { accountSid, authToken } = getTwilioConfig();
    twilioClient = twilio(accountSid, authToken);
  }
  return twilioClient;
}

function getTwilioFromNumber() {
  return getTwilioConfig().phoneNumber;
}

function publicWebhookUrl(req) {
  const configured = String(process.env.TWILIO_WEBHOOK_URL || '').trim();
  if (configured) return configured;
  const host = req.get('x-forwarded-host') || req.get('host') || '';
  const path = req.originalUrl || req.url || '';
  return `https://${host}${path}`;
}

function validateTwilioRequest(req) {
  const signature = req.headers['x-twilio-signature'];
  if (!signature) return true;
  try {
    const { authToken } = getTwilioConfig();
    const params = req.body || {};
    const host = req.get('x-forwarded-host') || req.get('host') || '';
    const path = req.originalUrl || req.url || '';
    const candidates = [
      publicWebhookUrl(req),
      host ? `https://${host}${path}` : '',
    ].filter(Boolean);
    return candidates.some((url) => twilio.validateRequest(authToken, signature, url, params));
  } catch (error) {
    console.warn('Twilio signature validation error:', error.message);
    return false;
  }
}

module.exports = {
  normalizePhone,
  getTwilioConfig,
  getTwilioClient,
  getTwilioFromNumber,
  publicWebhookUrl,
  validateTwilioRequest,
};
