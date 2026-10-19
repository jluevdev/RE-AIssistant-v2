const { admin } = require('../shared/admin');
const { getTwilioConfig } = require('../shared/twilio');

function projectId() {
  return process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'realestatescheduler-fa876';
}

function webhookUrl() {
  return process.env.TWILIO_WEBHOOK_URL
    || `https://us-central1-${projectId()}.cloudfunctions.net/smsWebhook`;
}

function authHeader() {
  const { accountSid, authToken } = getTwilioConfig();
  return {
    accountSid,
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
  };
}

async function twilioAccount(path, { method = 'GET', params = {} } = {}) {
  const { accountSid, headers } = authHeader();
  const url = new URL(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}${path}`);
  const body = new URLSearchParams(params);
  if (method === 'GET') {
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  }
  const response = await fetch(url, {
    method,
    headers,
    body: method === 'GET' || method === 'DELETE' ? undefined : body,
  });
  const text = await response.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  if (!response.ok) {
    throw new Error(json.message || `Twilio request failed (${response.status})`);
  }
  return json;
}

async function messagingServiceSid() {
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) return process.env.TWILIO_MESSAGING_SERVICE_SID;
  const { headers } = authHeader();
  const response = await fetch('https://messaging.twilio.com/v1/Services?PageSize=20', { headers });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  return json.services?.[0]?.sid || null;
}

async function attachToService(serviceSid, incomingSid) {
  if (!serviceSid) return null;
  const { headers } = authHeader();
  const response = await fetch(`https://messaging.twilio.com/v1/Services/${serviceSid}/PhoneNumbers`, {
    method: 'POST',
    headers,
    body: new URLSearchParams({ PhoneNumberSid: incomingSid }),
  });
  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    console.warn('messaging service attach failed:', json.message || response.status);
    return null;
  }
  return serviceSid;
}

async function buyLocalNumber(areaCode) {
  const query = { SmsEnabled: 'true', PageSize: '1' };
  if (areaCode) query.AreaCode = String(areaCode);
  const available = await twilioAccount('/AvailablePhoneNumbers/US/Local.json', { params: query });
  const phone = available.available_phone_numbers?.[0]?.phone_number;
  if (!phone) throw new Error('No local texting number is available.');
  const purchased = await twilioAccount('/IncomingPhoneNumbers.json', {
    method: 'POST',
    params: {
      PhoneNumber: phone,
      SmsMethod: 'POST',
      SmsUrl: webhookUrl(),
    },
  });
  const serviceSid = await messagingServiceSid();
  const attached = await attachToService(serviceSid, purchased.sid);
  return {
    e164: purchased.phone_number,
    incomingSid: purchased.sid,
    messagingServiceSid: attached,
  };
}

async function releaseNumber(incomingSid) {
  if (!incomingSid) return;
  await twilioAccount(`/IncomingPhoneNumbers/${incomingSid}.json`, { method: 'DELETE' });
}

module.exports = { buyLocalNumber, releaseNumber, webhookUrl };
