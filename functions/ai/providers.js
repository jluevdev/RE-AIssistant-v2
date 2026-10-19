const { vertexGenerateContent, extractText } = require('../shared/gemini');

const PROVIDERS = {
  grok: {
    url: 'https://api.x.ai/v1/chat/completions',
    model: 'grok-3',
    style: 'openai',
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    style: 'openai',
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-5-sonnet-latest',
    style: 'anthropic',
  },
};

async function completeOpenAI({ url, model, apiKey, system, user }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error?.message || `AI provider request failed (${res.status})`);
  }
  return json?.choices?.[0]?.message?.content || '';
}

async function completeAnthropic({ url, model, apiKey, system, user }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error?.message || `AI provider request failed (${res.status})`);
  }
  return (json?.content || []).map((part) => part.text || '').join('').trim();
}

async function generateAssistantReply({ provider, apiKey, system, user }) {
  if (!provider || provider === 'vertex') {
    const payload = await vertexGenerateContent({
      systemInstruction: system,
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 700,
        responseMimeType: 'application/json',
      },
    });
    return extractText(payload);
  }

  const spec = PROVIDERS[provider];
  if (!spec) throw new Error(`Unsupported AI provider: ${provider}`);
  if (!apiKey) throw new Error('API key is required for this provider');

  if (spec.style === 'anthropic') {
    return completeAnthropic({ ...spec, apiKey, system, user });
  }
  return completeOpenAI({ ...spec, apiKey, system, user });
}

module.exports = {
  PROVIDERS,
  generateAssistantReply,
};
