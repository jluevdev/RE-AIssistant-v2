const { acceptDraft } = require('./policy');
const { normalizeExtraction } = require('./verification');

async function postChat({ apiKey, model, messages }) {
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || process.env.XAI_MODEL || 'grok-3',
      temperature: 0.2,
      messages,
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error?.message || `Grok request failed (${response.status})`);
  }
  return json?.choices?.[0]?.message?.content || '';
}

async function polishSms({ apiKey, template }) {
  if (!apiKey) return template;
  try {
    const polished = await postChat({
      apiKey,
      messages: [
        {
          role: 'system',
          content: 'Rewrite this SMS for a polite, short tone. Keep the AI-assistant disclosure and the STOP line. Do not add lockbox codes, prices, or access instructions. Return only the SMS.',
        },
        { role: 'user', content: template },
      ],
    });
    return acceptDraft(template, polished);
  } catch (error) {
    console.warn('SmartShowings draft polish skipped:', error.message);
    return template;
  }
}

function parseJsonObject(text) {
  const raw = String(text || '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function extractCardFields({ apiKey, imageBase64, model }) {
  if (!apiKey) {
    return { ok: false, reason: 'Platform xAI key is not configured (XAI_API_KEY secret).' };
  }
  if (!imageBase64) {
    return { ok: false, reason: 'No card image.' };
  }
  const content = await postChat({
    apiKey,
    model: model || process.env.XAI_VISION_MODEL || 'grok-2-vision-1212',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract JSON with keys name, dreNumber, brokerage, phone, email from this real estate business card. Use empty strings when a field is missing. JSON only.',
          },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
          },
        ],
      },
    ],
  });
  const parsed = parseJsonObject(content);
  if (!parsed) return { ok: false, reason: 'Could not read the card.' };
  return { ok: true, extraction: normalizeExtraction(parsed) };
}

module.exports = {
  polishSms,
  extractCardFields,
  parseJsonObject,
};
