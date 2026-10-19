const { GoogleAuth } = require('google-auth-library');

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'realestatescheduler-fa876';
const LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const MODEL = process.env.VERTEX_GEMINI_MODEL || 'gemini-2.5-flash';

let authClient;

async function getAccessToken() {
  if (!authClient) {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    authClient = await auth.getClient();
  }
  const tokenResponse = await authClient.getAccessToken();
  const accessToken = tokenResponse?.token;
  if (!accessToken) {
    throw new Error('Google Cloud authentication failed');
  }
  return accessToken;
}

function extractText(payload) {
  const candidates = payload?.candidates || [];
  for (const candidate of candidates) {
    const text = (candidate.content?.parts || []).map((part) => part.text || '').join('').trim();
    if (text) return text;
  }
  return '';
}

async function vertexGenerateContent({
  contents,
  generationConfig,
  tools,
  systemInstruction,
} = {}) {
  const accessToken = await getAccessToken();
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;
  const body = { contents, generationConfig };
  if (tools) body.tools = tools;
  if (systemInstruction) {
    body.systemInstruction = typeof systemInstruction === 'string'
      ? { parts: [{ text: systemInstruction }] }
      : systemInstruction;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message || `Vertex Gemini request failed (${res.status})`);
  }
  return json;
}

module.exports = {
  MODEL,
  PROJECT_ID,
  getAccessToken,
  vertexGenerateContent,
  extractText,
};
