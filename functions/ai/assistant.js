const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { admin } = require('../shared/admin');
const {
  ALLOWED_ROUTES,
  sanitizeLinks,
  buildKnowledgeContext,
} = require('./helpKnowledge');
const { generateAssistantReply } = require('./providers');
const { loadAgentCredential } = require('./credentials');
const { runOwnerTurn } = require('./grokAgent');

const MAX_QUESTION_LENGTH = 800;

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

function stamp(value) {
  if (!value) return '';
  if (typeof value.toDate === 'function') return value.toDate().toISOString().slice(0, 16);
  return '';
}

async function safeDocs(queryRef) {
  try {
    const snap = await queryRef.get();
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    console.warn('assistant snapshot query failed:', error.message);
    return [];
  }
}

async function loadWorkspace(db, uid) {
  const [tours, messages, openHouses, offers] = await Promise.all([
    safeDocs(db.collection('buyerSchedules').where('ownerUid', '==', uid).orderBy('createdAt', 'desc').limit(5)),
    safeDocs(db.collection('messages').where('agentUid', '==', uid).orderBy('createdAt', 'desc').limit(8)),
    safeDocs(db.collection('openHouses').where('agentId', '==', uid).orderBy('date', 'desc').limit(5)),
    safeDocs(db.collection('offers').where('ownerUid', '==', uid).orderBy('createdAt', 'desc').limit(5)),
  ]);

  const tourLines = tours.map((tour) => {
    const when = tour.availability?.date || stamp(tour.createdAt) || 'unscheduled';
    const stops = (tour.targets || []).map((target) => target.address).filter(Boolean).slice(0, 4).join('; ');
    return `- ${tour.tourKind || 'sale'} tour ${when} status ${tour.status || 'draft'}${stops ? `: ${stops}` : ''}`;
  });
  const messageLines = messages.map((message) => {
    const body = String(message.body || '').replace(/\s+/g, ' ').slice(0, 140);
    return `- ${message.direction || 'note'} ${stamp(message.createdAt)}: ${body}`;
  });
  const openHouseLines = openHouses.map((row) => (
    `- ${row.title || 'Open house'} at ${row.address || 'unknown'} on ${row.date || 'unscheduled'} (${row.status || 'scheduled'})`
  ));
  const offerLines = offers.map((row) => (
    `- ${row.address || row.listingAddress || 'Offer'} status ${row.status || 'open'}`
  ));

  return [
    'Tours:',
    tourLines.join('\n') || '- none',
    'Recent messages:',
    messageLines.join('\n') || '- none',
    'Open houses:',
    openHouseLines.join('\n') || '- none',
    'Offers:',
    offerLines.join('\n') || '- none',
  ].join('\n');
}

exports.askAssistant = onCall(
  { secrets: ['AI_CREDENTIALS_KEY', 'XAI_API_KEY'], timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in');
    }
    const question = String(request.data?.question || '').trim();
    if (!question) throw new HttpsError('invalid-argument', 'question is required');
    if (question.length > MAX_QUESTION_LENGTH) {
      throw new HttpsError('invalid-argument', `question must be under ${MAX_QUESTION_LENGTH} characters`);
    }

    const userSnap = await admin.firestore().collection('users').doc(request.auth.uid).get();
    const useOwn = Boolean(userSnap.data()?.useOwnAiKey);
    let ownProvider = '';
    if (useOwn) {
      try {
        const saved = await loadAgentCredential(request.auth.uid);
        ownProvider = saved?.provider || '';
      } catch (error) {
        if (error?.code !== 'failed-precondition') {
          console.error('askAssistant own-key error:', error.message);
        }
      }
    }
    if (!(useOwn && ownProvider && ownProvider !== 'grok')) {
      try {
        const answer = await runOwnerTurn(admin.firestore(), request.auth.uid, question);
        if (answer && !String(answer).includes('platform Grok key is not saved')) {
          return {
            answer: String(answer).slice(0, 900),
            links: [{ to: '/line', label: 'Your line' }],
            source: 'grok',
          };
        }
      } catch (error) {
        console.error('askAssistant grok error:', error.message);
      }
    }

    const db = admin.firestore();
    const workspace = await loadWorkspace(db, request.auth.uid);
    const allowedList = ALLOWED_ROUTES.map((route) => `${route.label}: ${route.to}`).join('\n');
    const system = `You are the RE AIssistant dashboard assistant for the signed-in agent.
Answer using their workspace snapshot and the app guide. Do not invent tours, messages, or offers that are not in the snapshot.
If the snapshot does not contain the answer, say so and point them to the right page.
Respond with JSON only: {"answer":"...","links":[{"label":"...","to":"..."}]}
links must use ONLY these routes (max 3):
${allowedList}
Keep the answer under 160 words.

App guide:
${buildKnowledgeContext()}

This agent's workspace:
${workspace}`;

    let provider = 'vertex';
    let apiKey = '';
    try {
      const credential = await loadAgentCredential(request.auth.uid);
      if (credential?.apiKey) {
        provider = credential.provider;
        apiKey = credential.apiKey;
      }
    } catch (error) {
      if (error?.code === 'failed-precondition') {
        provider = 'vertex';
      } else {
        console.error('askAssistant credential error:', error.message);
        throw new HttpsError('failed-precondition', 'Saved AI key could not be read. Save it again in Assistant settings.');
      }
    }

    try {
      const text = await generateAssistantReply({ provider, apiKey, system, user: question });
      const parsed = parseJsonResponse(text);
      if (parsed?.answer) {
        const links = sanitizeLinks(parsed.links);
        return {
          answer: String(parsed.answer).slice(0, 900),
          links: links.length ? links : [{ to: '/dashboard', label: 'Dashboard' }],
          source: provider,
        };
      }
      if (text) {
        return {
          answer: String(text).slice(0, 900),
          links: [{ to: '/dashboard', label: 'Dashboard' }],
          source: provider,
        };
      }
    } catch (error) {
      console.error('askAssistant provider error:', error.message);
      if (provider !== 'vertex') {
        throw new HttpsError('failed-precondition', 'That AI key was rejected. Check the key in Assistant settings.');
      }
    }

    return {
      answer: 'I could not read that just now. Ask again, or open Dashboard, Tours, Messages, or Open Houses from the sidebar.',
      links: [
        { to: '/dashboard', label: 'Dashboard' },
        { to: '/buyer/schedule', label: 'Tours' },
        { to: '/messages', label: 'Messages' },
      ],
      source: 'fallback',
    };
  },
);
