const { admin } = require('../shared/admin');
const { loadAgentCredential, loadPlatformKey } = require('./credentials');
const { loadActiveBot } = require('./bots');
const { loadWorkspace, workspaceText, loadAgentContext, effectiveGuardrail } = require('./workspace');
const { buildMapsDirectionsUrl } = require('../shared/mapsLink');
const { queuePendingAction, hardLockError, assertKnownAddress, assertKnownPhone, assertNotDnc } = require('../shared/guardrails');
const { sendFromLine } = require('../line/execute');
const { summaryFromOffer, reviewSignaturePacket } = require('../esign/review');
const { ingestListingUrls } = require('../buyer/listingLinks');
const { buildTodayItems, DEADLINE_FIELDS, CHECKLIST_FIELDS, weekdayLabel, parseDay } = require('./today');

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_today',
      description: 'Read what is due today: tours, open houses, unanswered texts, and deadlines inside 48 hours.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_workspace',
      description: 'Read this agent tours, open houses, offers, and recent texts.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'plan_tour',
      description: 'Order showing stops from the agent instruction and known addresses, then return a Google Maps link. Do not invent drive times.',
      parameters: {
        type: 'object',
        properties: {
          stops: { type: 'array', items: { type: 'string' }, description: 'Addresses in the order the agent asked for.' },
        },
        required: ['stops'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_listing',
      description: 'Read a listing page with Gemini so the address and price are real.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_client_text',
      description: 'Queue a text to a client. It does not send until the agent approves.',
      parameters: {
        type: 'object',
        properties: { toPhone: { type: 'string' }, body: { type: 'string' } },
        required: ['toPhone', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_open_house_reminder',
      description: 'Queue a reminder for an open house the agent owns.',
      parameters: {
        type: 'object',
        properties: { openHouseId: { type: 'string' } },
        required: ['openHouseId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_showing_requests',
      description: 'Queue showing-request texts for a tour.',
      parameters: {
        type: 'object',
        properties: { scheduleId: { type: 'string' }, body: { type: 'string' } },
        required: ['scheduleId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_offer_note',
      description: 'Queue a note on an offer. It does not change offer status.',
      parameters: {
        type: 'object',
        properties: { offerId: { type: 'string' }, note: { type: 'string' } },
        required: ['offerId', 'note'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_deadline',
      description: 'Queue a deadline date on an offer. It does not change the contract.',
      parameters: {
        type: 'object',
        properties: { offerId: { type: 'string' }, key: { type: 'string' }, date: { type: 'string' } },
        required: ['offerId', 'key', 'date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_checklist',
      description: 'Queue a file checklist change on an offer.',
      parameters: {
        type: 'object',
        properties: { offerId: { type: 'string' }, key: { type: 'string' }, done: { type: 'boolean' } },
        required: ['offerId', 'key', 'done'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_tour_followup',
      description: 'Queue one follow-up text for a tour. It does not send until the agent approves.',
      parameters: {
        type: 'object',
        properties: { scheduleId: { type: 'string' }, body: { type: 'string' } },
        required: ['scheduleId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_deadline_reminder',
      description: 'Queue a reminder text to the agent, not the client, for a deadline already on the file.',
      parameters: {
        type: 'object',
        properties: { offerId: { type: 'string' }, key: { type: 'string' } },
        required: ['offerId', 'key'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prep_signature_packet',
      description: 'Prepare a signature checklist from an offer. This does not send or sign.',
      parameters: {
        type: 'object',
        properties: {
          offerId: { type: 'string' },
          parties: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                role: { type: 'string' },
                name: { type: 'string' },
                phone: { type: 'string' },
              },
            },
          },
        },
        required: ['offerId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_signatures',
      description: 'Queue signature links for a prepared packet. Never signs for anyone.',
      parameters: {
        type: 'object',
        properties: { packetId: { type: 'string' } },
        required: ['packetId'],
      },
    },
  },
];

async function grokKey(uid, user) {
  if (user?.useOwnAiKey) {
    try {
      const credential = await loadAgentCredential(uid);
      if (credential?.provider === 'grok' && credential.apiKey) {
        return credential.apiKey;
      }
    } catch (error) {
      console.warn('account grok key skipped:', error.message);
    }
  }
  if (process.env.XAI_API_KEY) return process.env.XAI_API_KEY;
  try {
    return (await loadPlatformKey()) || '';
  } catch (error) {
    console.warn('platform grok key skipped:', error.message);
    return '';
  }
}

async function complete(apiKey, messages, tools) {
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.XAI_MODEL || 'grok-3',
      temperature: 0.2,
      messages,
      tools,
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error?.message || `Grok request failed (${response.status})`);
  }
  return json?.choices?.[0]?.message || { content: '' };
}

function clip(value) {
  return String(value || '').slice(0, 1400);
}

async function runTool(db, ctx, name, args) {
  const { uid, user, team, level, ownerText, records, bot } = ctx;
  if (bot?.tools && !bot.tools.includes(name)) {
    throw hardLockError(`${bot.name} cannot do that. Switch bots to delegate it.`);
  }
  if (name === 'read_workspace') {
    return { level, workspace: workspaceText(records) };
  }
  if (name === 'read_today') {
    return buildTodayItems({ ...records, tours: records.tours });
  }
  if (name === 'plan_tour') {
    const stops = (args.stops || []).map((stop) => assertKnownAddress(stop, ownerText, records));
    const mapsLink = buildMapsDirectionsUrl(stops);
    return { stops, mapsLink, note: 'Google Maps will route these stops. Drive times are not estimated here.' };
  }
  if (name === 'read_listing') {
    const result = await ingestListingUrls({
      db,
      urls: [args.url],
      agentUid: uid,
      teamId: user.teamId || null,
      source: 'assistant',
    });
    const listings = Array.isArray(result?.listings) ? result.listings : [];
    return {
      source: 'gemini',
      scheduleId: result?.scheduleId || null,
      listings: listings.slice(0, 4).map((row) => ({
        address: row.address || null,
        price: row.price || row.listPrice || null,
      })),
    };
  }
  if (level === 'observe') {
    throw hardLockError('Observe only reads and answers.');
  }

  if (name === 'propose_client_text') {
    const body = String(args.body || '').trim();
    const templates = (team?.routineTemplates || []).map((item) => String(item || '').trim());
    if (level === 'routine' && templates.includes(body) && user.line?.status === 'active') {
      const toPhone = await assertNotDnc(db, assertKnownPhone(args.toPhone, ownerText, records));
      const sid = await sendFromLine(db, uid, user.line, toPhone, body, { teamId: team?.id, messageType: 'routine_template' });
      return { sent: true, sid, note: 'Sent an unchanged broker template.' };
    }
    const warning = `This will text ${args.toPhone} from your number: ${args.body}`;
    const queued = await queuePendingAction(db, {
      uid,
      teamId: team?.id,
      level,
      kind: 'send_sms',
      warning,
      payload: { toPhone: args.toPhone, body: args.body, records },
      ownerText,
    });
    return { queued: true, ...queued, instruction: 'Tell the agent the exact warning and ask them to reply YES.' };
  }
  if (name === 'propose_open_house_reminder') {
    const house = records.openHouses.find((row) => row.id === args.openHouseId);
    if (!house) throw hardLockError('That open house is not in this account.');
    const warning = `This schedules a reminder for ${house.address || house.title || args.openHouseId}.`;
    const queued = await queuePendingAction(db, {
      uid, teamId: team?.id, level, kind: 'open_house_reminder', warning,
      payload: { openHouseId: args.openHouseId }, ownerText,
    });
    return { queued: true, ...queued };
  }
  if (name === 'propose_showing_requests') {
    const tour = records.tours.find((row) => row.id === args.scheduleId);
    if (!tour) throw hardLockError('That tour is not in this account.');
    const warning = `This texts showing requests for tour ${args.scheduleId}.`;
    const queued = await queuePendingAction(db, {
      uid, teamId: team?.id, level, kind: 'showing_requests', warning,
      payload: { scheduleId: args.scheduleId, body: args.body || '' }, ownerText,
    });
    return { queued: true, ...queued };
  }
  if (name === 'propose_offer_note') {
    const offer = records.offers.find((row) => row.id === args.offerId);
    if (!offer) throw hardLockError('That offer is not in this account.');
    const warning = `This adds a note on offer ${args.offerId}. It does not change the contract. Note: ${args.note}`;
    const queued = await queuePendingAction(db, {
      uid, teamId: team?.id, level, kind: 'offer_note', warning,
      payload: { offerId: args.offerId, note: String(args.note || '').slice(0, 1000) }, ownerText,
    });
    return { queued: true, ...queued };
  }
  if (name === 'propose_deadline') {
    const offer = records.offers.find((row) => row.id === args.offerId);
    if (!offer) throw hardLockError('That offer is not in this account.');
    const field = DEADLINE_FIELDS.find((item) => item.key === args.key);
    if (!field || !parseDay(args.date)) throw hardLockError('Use a real deadline and a YYYY-MM-DD date.');
    const warning = `This sets ${field.label} to ${args.date} on ${offer.address || offer.hubSlug || args.offerId}. It does not change the contract.`;
    const queued = await queuePendingAction(db, {
      uid, teamId: team?.id, level, kind: 'offer_deadline', warning,
      payload: { offerId: args.offerId, key: field.key, date: parseDay(args.date) }, ownerText,
    });
    return { queued: true, ...queued };
  }
  if (name === 'propose_checklist') {
    const offer = records.offers.find((row) => row.id === args.offerId);
    if (!offer) throw hardLockError('That offer is not in this account.');
    const field = CHECKLIST_FIELDS.find((item) => item.key === args.key);
    if (!field) throw hardLockError('That checklist item is not on the file.');
    const done = Boolean(args.done);
    const warning = `This marks ${field.label} ${done ? 'done' : 'not done'} on ${offer.address || offer.hubSlug || args.offerId}.`;
    const queued = await queuePendingAction(db, {
      uid, teamId: team?.id, level, kind: 'offer_checklist', warning,
      payload: { offerId: args.offerId, key: field.key, done }, ownerText,
    });
    return { queued: true, ...queued };
  }
  if (name === 'propose_tour_followup') {
    const tour = records.tours.find((row) => row.id === args.scheduleId);
    if (!tour) throw hardLockError('That tour is not in this account.');
    const buyer = (tour.buyers || []).find((row) => row.phone) || null;
    if (!buyer?.phone) throw hardLockError('That tour has no buyer phone to follow up with.');
    const body = String(args.body || 'Following up on the tour. Reply if you want to see any of the homes again.').trim();
    const warning = `This will text ${buyer.phone} from your number: ${body}`;
    const queued = await queuePendingAction(db, {
      uid, teamId: team?.id, level, kind: 'send_sms', warning,
      payload: { toPhone: buyer.phone, body, records }, ownerText,
    });
    return { queued: true, ...queued, instruction: 'Tell the agent the exact warning and ask them to reply YES.' };
  }
  if (name === 'propose_deadline_reminder') {
    const offer = records.offers.find((row) => row.id === args.offerId);
    if (!offer) throw hardLockError('That offer is not in this account.');
    const field = DEADLINE_FIELDS.find((item) => item.key === args.key);
    const date = parseDay(offer.file?.deadlines?.[args.key]);
    if (!field || !date) throw hardLockError('That deadline is not on the file yet.');
    const toPhone = user.line?.ownerMobile || user.phone;
    if (!toPhone) throw hardLockError('Add your mobile on your profile so the reminder has somewhere to go.');
    const address = offer.address || offer.meta?.address || offer.hubSlug || 'the offer';
    const body = `${field.label} is ${weekdayLabel(date)} for ${address}.`;
    const warning = `This texts you, not the client: ${body}`;
    const queued = await queuePendingAction(db, {
      uid, teamId: team?.id, level, kind: 'send_sms', warning,
      payload: { toPhone, body, records: { ...records, contacts: [...(records.contacts || []), { phone: toPhone }] } },
      ownerText,
    });
    return { queued: true, ...queued, instruction: 'This goes to the agent. A client text still needs its own approval.' };
  }
  if (name === 'prep_signature_packet') {
    const offer = records.offers.find((row) => row.id === args.offerId);
    if (!offer) throw hardLockError('That offer is not in this account.');
    const summary = summaryFromOffer(offer, args.parties || []);
    const review = reviewSignaturePacket(summary);
    const packet = db.collection('signaturePackets').doc();
    await packet.set({
      id: packet.id,
      offerId: offer.id,
      ownerUid: uid,
      summary,
      blockers: review.blockers,
      warnings: review.warnings,
      status: 'draft',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { packetId: packet.id, summary, ...review, sent: false };
  }
  if (name === 'request_signatures') {
    const snap = await db.collection('signaturePackets').doc(args.packetId).get();
    if (!snap.exists || snap.data().ownerUid !== uid) throw hardLockError('That signature packet is not in this account.');
    const packet = snap.data();
    if (packet.blockers?.length) throw hardLockError(`Signature packet is blocked: ${packet.blockers.join('; ')}`);
    const fields = [
      packet.summary?.address,
      packet.summary?.price,
      packet.summary?.closeDate,
      ...(packet.summary?.parties || []).map((party) => `${party.role} ${party.name} ${party.phone}`),
    ].filter(Boolean).join('; ');
    const warning = `This texts signature links. Signers will see: ${fields}. Warnings: ${(packet.warnings || []).join(' ') || 'none'}.`;
    const queued = await queuePendingAction(db, {
      uid, teamId: team?.id, level, kind: 'signature_request', warning,
      payload: { packetId: args.packetId, blockers: packet.blockers || [] }, ownerText,
    });
    return { queued: true, ...queued };
  }
  throw new Error(`Unknown tool ${name}`);
}

async function runOwnerTurn(db, uid, ownerText) {
  const text = String(ownerText || '');
  if (/\b(fair housing|is this legal|commission rate|rewrite the (contract|clause)|change the clause)\b/i.test(text)) {
    return 'I cannot give legal, contract, fair-housing, or commission advice. Handle that yourself.';
  }
  const { user, team } = await loadAgentContext(db, uid);
  const apiKey = await grokKey(uid, user);
  const level = effectiveGuardrail(user, team);
  const records = await loadWorkspace(db, uid);
  const bot = await loadActiveBot(db, uid, user);
  const tools = TOOLS.filter((tool) => bot.tools.includes(tool.function.name));
  if (!apiKey) {
    return 'The platform Grok key is not saved yet. A broker can add it on Assistant. I can still take YES or NO on a pending approval.';
  }

  const messages = [
    {
      role: 'system',
      content: `You are ${bot.name}, a specialist for one licensed agent. ${bot.instructions}
Guardrail level: ${level}.
Use read_today when the agent asks what is due.
You propose. The agent completes sends, deadline changes, checklist changes, and signature requests.
If a task is outside your tools, say which bot should take it instead of doing it yourself.
Do not invent phones, addresses, prices, or drive times.
Do not give legal, contract, fair-housing, or commission advice. Tell the agent to handle that themselves.
If a tool returns a warning, repeat that warning and ask the agent to reply YES.
Keep replies under 500 characters.`,
    },
    { role: 'user', content: String(ownerText || '').slice(0, 1600) },
  ];

  const ctx = { uid, user, team, level, ownerText, records, bot };
  for (let step = 0; step < 4; step += 1) {
    const message = await complete(apiKey, messages, tools);
    const calls = message.tool_calls || [];
    if (!calls.length) return clip(message.content || 'I could not complete that.');
    messages.push(message);
    for (const call of calls) {
      let parsed = {};
      try { parsed = JSON.parse(call.function?.arguments || '{}'); } catch { parsed = {}; }
      let content;
      try {
        content = await runTool(db, ctx, call.function?.name, parsed);
      } catch (error) {
        content = { error: error.message || 'Tool failed' };
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(content).slice(0, 4000),
      });
    }
  }
  return 'I need a clearer instruction.';
}

module.exports = { runOwnerTurn, TOOLS };
