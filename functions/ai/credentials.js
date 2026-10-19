const crypto = require('crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { admin } = require('../shared/admin');

const PROVIDER_IDS = new Set(['grok', 'openai', 'anthropic']);

function masterKey() {
  const raw = String(process.env.AI_CREDENTIALS_KEY || '').trim();
  if (!raw) {
    throw new HttpsError(
      'failed-precondition',
      'AI key storage is not configured. Set the AI_CREDENTIALS_KEY secret.',
    );
  }
  return crypto.scryptSync(raw, 'reai-ai-credentials', 32);
}

function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

function decryptSecret(payload) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    masterKey(),
    Buffer.from(payload.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(payload.data, 'base64')),
    decipher.final(),
  ]);
  return plain.toString('utf8');
}

function credentialRef(uid) {
  return admin.firestore().collection('aiCredentials').doc(uid);
}

function platformRef() {
  return admin.firestore().collection('platformConfig').doc('ai');
}

async function loadPlatformKey() {
  const snap = await platformRef().get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  if (!data.ciphertext) return null;
  return decryptSecret(data.ciphertext);
}

function publicCredential(data) {
  if (!data?.provider) return { configured: false, provider: 'vertex', last4: '' };
  return {
    configured: true,
    provider: data.provider,
    last4: data.last4 || '',
  };
}

async function loadAgentCredential(uid) {
  const snap = await credentialRef(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  if (!data.provider || !data.ciphertext) return null;
  return {
    provider: data.provider,
    apiKey: decryptSecret(data.ciphertext),
  };
}

exports.saveAiCredential = onCall(
  { secrets: ['AI_CREDENTIALS_KEY'] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
    const provider = String(request.data?.provider || '').trim();
    const apiKey = String(request.data?.apiKey || '').trim();
    if (!PROVIDER_IDS.has(provider)) {
      throw new HttpsError('invalid-argument', 'Choose Grok, OpenAI, or Anthropic');
    }
    if (apiKey.length < 12 || apiKey.length > 400) {
      throw new HttpsError('invalid-argument', 'Paste a valid API key');
    }

    await credentialRef(request.auth.uid).set({
      provider,
      last4: apiKey.slice(-4),
      ciphertext: encryptSecret(apiKey),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await admin.firestore().collection('users').doc(request.auth.uid).set({
      useOwnAiKey: true,
    }, { merge: true });

    return { configured: true, provider, last4: apiKey.slice(-4), useOwnAiKey: true };
  },
);

exports.clearAiCredential = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  await credentialRef(request.auth.uid).delete().catch(() => {});
  await admin.firestore().collection('users').doc(request.auth.uid).set({
    useOwnAiKey: false,
  }, { merge: true });
  return { configured: false, provider: 'vertex', last4: '', useOwnAiKey: false };
});

exports.getAiCredential = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const snap = await credentialRef(request.auth.uid).get();
  return publicCredential(snap.exists ? snap.data() : null);
});

async function canEditPlatformKey(uid) {
  const snap = await admin.firestore().collection('users').doc(uid).get();
  const user = snap.data() || {};
  const privileged = user.teamRole === 'owner' || user.teamRole === 'admin' || user.role === 'broker';
  const platform = await platformRef().get();
  if (!platform.exists) return true;
  return privileged || platform.data()?.updatedBy === uid;
}

exports.getPlatformAi = onCall({ secrets: ['AI_CREDENTIALS_KEY'] }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const snap = await platformRef().get();
  const data = snap.exists ? snap.data() : null;
  const envConfigured = Boolean(process.env.XAI_API_KEY);
  return {
    configured: envConfigured || Boolean(data?.ciphertext),
    last4: envConfigured ? '' : (data?.last4 || ''),
    source: envConfigured ? 'secret' : (data?.ciphertext ? 'saved' : 'none'),
    canEdit: await canEditPlatformKey(request.auth.uid),
  };
});

exports.savePlatformAiKey = onCall({ secrets: ['AI_CREDENTIALS_KEY'] }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  if (!(await canEditPlatformKey(request.auth.uid))) {
    throw new HttpsError('permission-denied', 'Only a broker or the person who saved the platform key can change it.');
  }
  const apiKey = String(request.data?.apiKey || '').trim();
  if (!apiKey.startsWith('xai-') || apiKey.length < 12 || apiKey.length > 400) {
    throw new HttpsError('invalid-argument', 'Paste an xAI key. It starts with xai-.');
  }
  await platformRef().set({
    provider: 'grok',
    last4: apiKey.slice(-4),
    ciphertext: encryptSecret(apiKey),
    updatedBy: request.auth.uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { configured: true, last4: apiKey.slice(-4), source: 'saved', canEdit: true };
});

module.exports.loadAgentCredential = loadAgentCredential;
module.exports.loadPlatformKey = loadPlatformKey;
module.exports.PROVIDER_IDS = PROVIDER_IDS;
