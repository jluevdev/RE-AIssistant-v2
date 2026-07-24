const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const {
  ALLOWED_ROUTES,
  OFF_TOPIC_REPLY,
  searchLocalHelp,
  sanitizeLinks,
  buildKnowledgeContext,
} = require('./helpKnowledge');

const MAX_QUESTION_LENGTH = 500;
const MODEL = 'gemini-2.0-flash';

function parseJsonResponse(text) {
  const trimmed = String(text || '').trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

async function askGemini(question) {
  const apiKey = process.env.GOOGLEAI_KEY;
  if (!apiKey) return null;

  const allowedList = ALLOWED_ROUTES.map((r) => `${r.label}: ${r.to}`).join('\n');
  const knowledge = buildKnowledgeContext();

  const system = `You are RE AIssistant Help — an in-app guide ONLY for the RE AIssistant web app.
Rules:
- Answer ONLY about navigating this app and using its features (open houses, listings, offers, buyer scheduling, messages, contacts, automations, team, billing, dashboard).
- Refuse general real estate advice, legal advice, or anything outside this app. For off-topic questions, say you can only help with the app.
- Respond with JSON only, no markdown: {"answer":"...","links":[{"label":"...","to":"..."}]}
- "links" must use ONLY these routes (max 3):
${allowedList}
- Keep answer under 120 words.

App knowledge:
${knowledge}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: system,
  });

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: question }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 256,
      responseMimeType: 'application/json',
    },
  });

  const text = result.response?.text?.();
  const parsed = parseJsonResponse(text);
  if (!parsed?.answer) return null;

  const links = sanitizeLinks(parsed.links);
  const answer = String(parsed.answer).slice(0, 600);

  const offTopic =
    /cannot help|can't help|only help with|outside|not related/i.test(answer) &&
    links.length === 0;

  if (offTopic) {
    return { ...OFF_TOPIC_REPLY, source: 'llm-guardrail' };
  }

  return {
    answer,
    links: links.length ? links : [{ to: '/dashboard', label: 'Dashboard' }],
    source: 'llm',
  };
}

exports.askHelpBot = onCall(
  { secrets: ['GOOGLEAI_KEY'] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in to use help');
    }

    const question = String(request.data?.question || '').trim();
    if (!question) {
      throw new HttpsError('invalid-argument', 'question is required');
    }
    if (question.length > MAX_QUESTION_LENGTH) {
      throw new HttpsError('invalid-argument', `question must be under ${MAX_QUESTION_LENGTH} characters`);
    }

    const local = searchLocalHelp(question);
    if (local) return local;

    try {
      const llm = await askGemini(question);
      if (llm) return llm;
    } catch (err) {
      console.error('askHelpBot LLM error:', err.message);
    }

    return {
      answer:
        'I’m not sure about that yet. Try asking about a specific area — open houses, offers, buyer scheduling, messages, team, or billing — or browse the sidebar sections.',
      links: [
        { to: '/dashboard', label: 'Dashboard' },
        { to: '/open-houses', label: 'Open Houses' },
        { to: '/messages', label: 'Messages' },
      ],
      source: 'fallback',
    };
  },
);
