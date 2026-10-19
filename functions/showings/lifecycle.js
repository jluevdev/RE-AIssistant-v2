const { reviewOutbound, isOptOut, isQuietHours, containsAccessInfo } = require('./policy');
const { proposeBuyerRequest, proposeListingDecision, outcomeFromReply, releaseAccess, routeChannel } = require('./engine');
const { stubDreLookup, classifyVerification } = require('./verification');
const { nextAudit } = require('./audit');
const { smsMode, emailMode } = require('./flag');

const DAY = new Date('2026-10-19T18:00:00.000Z');
const NIGHT = new Date('2026-10-20T06:30:00.000Z');

const SAMPLE_CARD = {
  name: 'Maria Chen',
  dreNumber: '01234567',
  brokerage: 'Harbor Realty',
  phone: '2135550199',
  email: 'maria@harbor.example',
};

const HAPPY_IDS = [
  'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10',
  'S11', 'S12', 'S13', 'S14', 'S15', 'S16', 'S17', 'S18', 'S19', 'S20', 'S21',
];

const STEPS = [
  { id: 'S1', title: 'Buyer agent creates a tour stop' },
  { id: 'S2', title: 'Buyer, buyer agent, listing agent, and seller are parties; no group thread' },
  { id: 'S3', title: 'Requester verification opens from a business-card photo' },
  { id: 'S4', title: 'Mocked vision model extracts name, DRE, brokerage, and phone' },
  { id: 'S5', title: 'DRE adapter stub returns unknown and does not scrape' },
  { id: 'S6', title: 'Card with a name and DRE is Partial while the adapter is unknown' },
  { id: 'S7', title: 'Buyer assistant drafts a 1:1 request with disclosure and STOP' },
  { id: 'S8', title: 'Draft enters the approval queue and the audit log' },
  { id: 'S9', title: 'Daytime quiet-hours check lets the draft proceed' },
  { id: 'S10', title: 'STOP check passes on the outbound draft' },
  { id: 'S11', title: 'Buyer agent approves the queued request' },
  { id: 'S12', title: 'Non-member listing agent gets a mock SMS; Twilio is not called' },
  { id: 'S13', title: '1:1 thread is stored and the tour stop becomes requested' },
  { id: 'S14', title: 'Seller is not texted; listing rules stay ask-the-agent' },
  { id: 'S15', title: 'Listing agent replies 1' },
  { id: 'S16', title: 'Reply parses as confirm' },
  { id: 'S17', title: 'Tour stop status becomes confirmed' },
  { id: 'S18', title: 'Buyer-agent notification is queued on its own thread' },
  { id: 'S19', title: 'Buyer notification is approved in mock mode' },
  { id: 'S20', title: 'Lockbox and access info stay human-only' },
  { id: 'S21', title: 'Audit log is a hash chain' },
  { id: 'S6F', title: 'A card with no name and no DRE is Failed' },
  { id: 'S6N', title: 'A not-licensed result is Failed and cannot be attested' },
  { id: 'S6V', title: 'Attestation upgrades Partial to Verified and still blocks access' },
  { id: 'S8B', title: 'A missing address is blocked' },
  { id: 'S8H', title: 'No phone and no email asks a human' },
  { id: 'S8E', title: 'No mobile number falls back to email, still mocked' },
  { id: 'S9H', title: 'A nighttime draft is held until morning' },
  { id: 'S10X', title: 'An opt-out body is refused' },
  { id: 'S12M', title: 'A member listing agent is routed in-app, not SMS' },
  { id: 'S14M', title: 'Member listing assistant queues 1/2/3 on a separate thread' },
  { id: 'S15R', title: 'Reply 2 stores a suggested time and waits for a person' },
  { id: 'S15D', title: 'Reply 3 declines the stop' },
  { id: 'S15U', title: 'Free text escalates and does not confirm' },
  { id: 'S15S', title: 'STOP opts the number out and blocks a later send' },
];

function pass(id, detail) {
  return { id, pass: true, detail };
}

function fail(id, detail) {
  return { id, pass: false, detail };
}

function sampleInput(overrides = {}) {
  return {
    buyerName: 'Alex Rivera',
    buyerAgentName: 'Joseph Luevanos',
    buyerAgentDre: '02030405',
    listingAgentName: 'Maria Chen',
    listingAgentPhone: '2135550100',
    listingAgentEmail: 'maria@harbor.example',
    listingAgentIsUser: false,
    sellerName: 'Pat Seller',
    address: '123 Elm St',
    window: 'Sat 10:30–11:00',
    card: 'sample',
    ...overrides,
  };
}

function createSession(overrides = {}) {
  return {
    now: DAY,
    input: sampleInput(overrides),
    cursor: 0,
    tour: null,
    verification: null,
    approvals: [],
    threads: [],
    messages: [],
    audits: [],
    dnc: [],
    profile: null,
    draft: null,
    inbound: null,
    parsed: null,
    network: { twilio: 0, xai: 0, email: 0 },
  };
}

function audit(session, event) {
  const prev = session.audits[session.audits.length - 1];
  const entry = nextAudit(prev ? prev.hash : null, {
    ...event,
    ownerUid: 'agent-1',
    at: session.now.toISOString(),
  });
  session.audits.push(entry);
  return entry;
}

function mockOcr(card) {
  if (card === 'blank') {
    return {
      ok: true,
      calledNetwork: false,
      extraction: { name: '', dreNumber: '', brokerage: '', phone: '', email: '' },
    };
  }
  if (card === 'unreadable') {
    return { ok: false, calledNetwork: false, reason: 'Could not read the card.' };
  }
  return { ok: true, calledNetwork: false, extraction: { ...SAMPLE_CARD } };
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  const withCountry = digits.length === 11 && digits.startsWith('1')
    ? digits
    : `1${digits.padStart(10, '0').slice(-10)}`;
  return `+${withCountry}`;
}

function threadFor(session, role, key) {
  const id = `${role}:${key || 'none'}`;
  let thread = session.threads.find((item) => item.id === id);
  if (!thread) {
    thread = {
      id,
      role,
      participants: [key || role],
      messages: [],
      optedOut: false,
    };
    session.threads.push(thread);
  }
  return thread;
}

function queue(session, action) {
  const row = {
    ...action,
    id: `appr-${session.approvals.length + 1}`,
    status: action.sendAfter ? 'held' : 'pending',
  };
  session.approvals.push(row);
  audit(session, { type: 'queued', showingId: row.id, summary: `${action.type} queued` });
  return row;
}

function liveBlocked() {
  if (smsMode() === 'live' || emailMode() === 'live') {
    throw new Error('SmartShowings scenario refuses live SMS and email. Set both modes back to mock.');
  }
}

function recordDelivery(session, action) {
  liveBlocked();
  const phone = normalizePhone(action.toPhone);
  if (phone && session.dnc.includes(phone)) {
    return { ok: false, reason: 'STOP is on file for that number.' };
  }
  if (isOptOut(action.body)) {
    return { ok: false, reason: 'That message looks like an opt-out and will not be sent.' };
  }
  if (containsAccessInfo(action.body) || action.type === 'release_access') {
    return { ok: false, reason: releaseAccess().reason };
  }
  if (action.sendAfter && new Date(action.sendAfter).getTime() > session.now.getTime()) {
    return { ok: false, held: true, reason: 'Quiet hours. Held until 8:00 a.m. Pacific.' };
  }
  const channel = action.channel || (action.type === 'send_email' ? 'email' : 'sms');
  if (channel === 'sms' || channel === 'email' || channel === 'in_app') {
    const key = channel === 'in_app' ? 'buyer-or-listing-agent' : (phone || action.toEmail);
    const thread = threadFor(session, action.threadRole || 'counterparty', key);
    if (thread.participants.length !== 1) {
      return { ok: false, reason: 'Group texts are not created.' };
    }
    thread.messages.push(action.body);
  }
  session.messages.push({
    direction: 'outbound',
    body: action.body,
    channel,
    toPhone: phone || null,
    toEmail: action.toEmail || null,
    threadRole: action.threadRole || null,
    delivered: false,
    mode: 'mock',
  });
  return { ok: true, channel, delivered: false, mode: 'mock' };
}

function stepS1(session) {
  const input = session.input;
  session.tour = {
    id: 'tour-1',
    address: input.address,
    windowLabel: input.window,
    status: 'draft',
    parties: [],
    listingAgent: {
      name: input.listingAgentName,
      phone: input.listingAgentPhone,
      email: input.listingAgentEmail,
      isUser: Boolean(input.listingAgentIsUser),
    },
    seller: { name: input.sellerName, notified: false },
    buyerName: input.buyerName,
  };
  audit(session, { type: 'tour_created', showingId: session.tour.id, summary: `Tour stop ${input.address}` });
  if (!session.tour.address) return fail('S1', 'Tour stop needs an address.');
  return pass('S1', `Tour stop created for ${session.tour.address} at ${session.tour.windowLabel}.`);
}

function stepS2(session) {
  session.tour.parties = [
    { role: 'buyer', name: session.input.buyerName },
    { role: 'buyer_agent', name: session.input.buyerAgentName },
    { role: 'listing_agent', name: session.input.listingAgentName },
    { role: 'seller', name: session.input.sellerName },
  ];
  const grouped = session.threads.filter((thread) => thread.participants.length > 1);
  if (session.tour.parties.length !== 4 || grouped.length || session.threads.length) {
    return fail('S2', 'Expected four parties and no threads yet.');
  }
  return pass('S2', 'Buyer, buyer agent, listing agent, and seller are on the stop. No group text.');
}

function stepS3(session) {
  session.verification = {
    status: 'opened',
    card: session.input.card || 'sample',
    extraction: null,
    level: null,
  };
  audit(session, { type: 'verification_opened', showingId: 'card-1', summary: 'Business card received' });
  return pass('S3', 'Verification opened from a business-card photo.');
}

function stepS4(session) {
  const extracted = mockOcr(session.verification.card);
  if (extracted.calledNetwork) session.network.xai += 1;
  if (!extracted.ok) return fail('S4', extracted.reason);
  session.verification.extraction = extracted.extraction;
  session.verification.ocr = 'mock';
  const fields = extracted.extraction;
  if (session.network.xai !== 0) return fail('S4', 'OCR called xAI.');
  if (!fields.name || !fields.dreNumber || !fields.brokerage || !fields.phone) {
    return fail('S4', 'Sample card did not yield name, DRE, brokerage, and phone.');
  }
  return pass('S4', `Mock OCR: ${fields.name}, DRE ${fields.dreNumber}, ${fields.brokerage}, ${fields.phone}.`);
}

async function stepS5(session) {
  const dre = await stubDreLookup(session.verification.extraction);
  session.verification.dre = dre;
  if (dre.status !== 'unknown' || dre.source !== 'stub' || !/Do not scrape/i.test(dre.reason)) {
    return fail('S5', 'DRE adapter did not stay on the stub.');
  }
  return pass('S5', 'DRE stub returned unknown. No public-site scrape.');
}

function stepS6(session) {
  const verdict = classifyVerification({
    extraction: session.verification.extraction,
    dreResult: session.verification.dre,
    attested: false,
    independentConfirmed: false,
  });
  session.verification.level = verdict.level;
  session.verification.reason = verdict.reason;
  session.verification.accessEligible = verdict.accessEligible;
  audit(session, { type: 'verification', showingId: 'card-1', summary: `${verdict.level}: ${verdict.reason}` });
  if (verdict.level !== 'Partial' || verdict.accessEligible) {
    return fail('S6', `Expected Partial without access, got ${verdict.level}.`);
  }
  return pass('S6', 'Partial. A person must confirm before this is Verified. No access info.');
}

function draftRequest(session, input = session.input, now = session.now) {
  const proposed = proposeBuyerRequest({
    agentName: input.buyerAgentName,
    dre: input.buyerAgentDre,
    contactName: input.listingAgentName,
    address: input.address,
    phone: input.listingAgentPhone,
    email: input.listingAgentEmail,
    window: input.window,
  }, now);
  if (proposed.actions[0]) {
    const channel = routeChannel({
      listingAgentIsUser: input.listingAgentIsUser,
      phone: input.listingAgentPhone,
      email: input.listingAgentEmail,
    });
    if (channel === 'in_app') {
      proposed.actions[0] = {
        ...proposed.actions[0],
        type: 'in_app',
        channel: 'in_app',
        toPhone: null,
      };
    }
  }
  return proposed;
}

function stepS7(session) {
  const proposed = draftRequest(session);
  session.proposal = proposed;
  if (proposed.blocked || proposed.actions.length !== 1) {
    return fail('S7', proposed.reasons.join(' ') || 'Draft was blocked.');
  }
  const action = proposed.actions[0];
  session.draft = action;
  if (!/AI assistant/i.test(action.body) || !/\bSTOP\b/.test(action.body)) {
    return fail('S7', 'Disclosure or STOP is missing.');
  }
  if (action.threadRole !== 'counterparty') return fail('S7', 'Request is not a 1:1 counterparty thread.');
  return pass('S7', 'Draft names the AI assistant and the buyer agent, and includes STOP.');
}

function stepS8(session) {
  if (!session.draft) return fail('S8', 'Nothing to queue.');
  const row = queue(session, session.draft);
  session.requestApprovalId = row.id;
  if (row.status !== 'pending' || session.audits[session.audits.length - 1].type !== 'queued') {
    return fail('S8', 'Approval was not queued.');
  }
  return pass('S8', `Approval ${row.id} is pending.`);
}

function stepS9(session) {
  if (isQuietHours(session.now) || session.draft.sendAfter) {
    return fail('S9', 'Daytime draft was held.');
  }
  return pass('S9', 'Inside 8:00 a.m.–8:00 p.m. Pacific. The draft can be approved.');
}

function stepS10(session) {
  const review = reviewOutbound(session.draft.body, { quietAt: session.now });
  if (isOptOut(session.draft.body) || !review.ok) {
    return fail('S10', review.reasons.join(' ') || 'STOP check failed.');
  }
  return pass('S10', 'Outbound draft is not an opt-out.');
}

function stepS11(session) {
  const row = session.approvals.find((item) => item.id === session.requestApprovalId);
  if (!row) return fail('S11', 'Queued request is missing.');
  row.status = 'approved';
  audit(session, { type: 'approved', showingId: row.id, summary: 'Buyer agent approved the request' });
  return pass('S11', 'Buyer agent approved the request. It has not been delivered yet.');
}

function stepS12(session) {
  const row = session.approvals.find((item) => item.id === session.requestApprovalId);
  const delivery = recordDelivery(session, row);
  if (!delivery.ok) return fail('S12', delivery.reason);
  row.status = 'recorded';
  row.delivery = delivery;
  if (delivery.channel !== 'sms' || delivery.delivered || delivery.mode !== 'mock' || session.network.twilio !== 0) {
    return fail('S12', 'Non-member delivery was not a mock SMS.');
  }
  audit(session, { type: 'recorded', showingId: row.id, summary: 'Recorded without sending (SMS mock mode)' });
  return pass('S12', 'Mock SMS recorded for the non-member listing agent. Twilio was not called.');
}

function stepS13(session) {
  const phone = normalizePhone(session.input.listingAgentPhone);
  const thread = session.threads.find((item) => item.role === 'counterparty' && item.participants[0] === phone);
  session.tour.status = 'requested';
  if (!thread || thread.participants.length !== 1) return fail('S13', 'Counterparty thread is missing or grouped.');
  if (session.tour.status !== 'requested') return fail('S13', 'Stop did not become requested.');
  audit(session, { type: 'status', showingId: session.tour.id, summary: 'requested' });
  return pass('S13', `Thread ${thread.id} is 1:1. Stop status is requested.`);
}

function stepS14(session) {
  session.profile = {
    address: session.tour.address,
    approvalMode: 'ask',
    occupantNotify: 'agent',
    noticeHours: 24,
  };
  session.tour.seller.notified = false;
  const sellerThread = session.threads.find((item) => item.role === 'seller');
  if (session.profile.occupantNotify !== 'agent' || session.tour.seller.notified || sellerThread) {
    return fail('S14', 'Seller was contacted or the profile does not ask the agent.');
  }
  if (session.input.listingAgentIsUser) return fail('S14', 'Happy path listing agent is not a user.');
  return pass('S14', 'Seller is not texted. Rules stay ask-the-agent. The non-member already has the plain SMS.');
}

function stepS15(session) {
  return receiveReply(session, '1', 'S15');
}

function receiveReply(session, text, id) {
  const phone = normalizePhone(session.input.listingAgentPhone);
  if (session.dnc.includes(phone) && !isOptOut(text)) {
    return fail(id, 'That number is already opted out.');
  }
  session.inbound = text;
  session.messages.push({
    direction: 'inbound',
    body: text,
    fromPhone: phone,
    channel: 'sms',
  });
  const thread = threadFor(session, 'counterparty', phone);
  thread.messages.push(text);
  if (isOptOut(text)) {
    session.dnc.push(phone);
    thread.optedOut = true;
    session.tour.optedOut = true;
    audit(session, { type: 'stop', showingId: thread.id, summary: `STOP from ${phone}` });
    return pass(id, `STOP stored for ${phone}. No reply was sent.`);
  }
  return pass(id, `Listing agent replied "${text}".`);
}

function stepS16(session) {
  const outcome = outcomeFromReply({
    address: session.tour.address,
    contactName: session.input.listingAgentName,
    agentName: session.input.buyerAgentName,
    dre: session.input.buyerAgentDre,
    windowLabel: session.tour.windowLabel,
    status: session.tour.status,
  }, session.inbound);
  session.outcome = outcome;
  session.parsed = outcome.parsed;
  if (outcome.parsed.intent !== 'confirm' || outcome.parsed.choice !== '1') {
    return fail('S16', `Expected confirm/1, got ${outcome.parsed.intent}.`);
  }
  return pass('S16', 'Parsed as confirm, choice 1.');
}

function stepS17(session) {
  session.tour.status = session.outcome.target.status;
  session.tour.needsReview = Boolean(session.outcome.target.needsReview);
  audit(session, { type: 'status', showingId: session.tour.id, summary: session.tour.status });
  if (session.tour.status !== 'confirmed') return fail('S17', `Status is ${session.tour.status}.`);
  return pass('S17', 'Tour stop is confirmed.');
}

function stepS18(session) {
  const notice = (
    `Hi ${session.input.buyerAgentName.split(' ')[0]}, this is your AI assistant. `
    + `${session.tour.address} is confirmed for ${session.tour.windowLabel}. `
    + 'Tell your buyer yourself. The seller was not texted. Reply STOP to opt out.'
  );
  const review = reviewOutbound(notice, { quietAt: session.now });
  if (!review.ok) return fail('S18', review.reasons.join(' '));
  const row = queue(session, {
    type: 'notify_buyer_agent',
    channel: 'in_app',
    threadRole: 'buyer_agent',
    body: notice,
    toPhone: null,
  });
  session.buyerNoticeId = row.id;
  const confirm = (session.outcome.followUps || []).find((item) => item.type === 'confirm_back');
  if (confirm) {
    queue(session, {
      type: 'send_sms',
      channel: 'sms',
      threadRole: 'counterparty',
      toPhone: session.input.listingAgentPhone,
      body: confirm.body,
    });
  }
  const buyerThread = session.threads.find((item) => item.role === 'buyer_agent');
  if (buyerThread) return fail('S18', 'Buyer thread was opened before approval.');
  return pass('S18', 'Buyer-agent note is queued in-app. Listing-agent confirmation is a separate queued SMS.');
}

function stepS19(session) {
  const row = session.approvals.find((item) => item.id === session.buyerNoticeId);
  const delivery = recordDelivery(session, row);
  if (!delivery.ok || delivery.channel !== 'in_app' || delivery.delivered) {
    return fail('S19', delivery.reason || 'Buyer notice was not an in-app mock.');
  }
  row.status = 'recorded';
  row.delivery = delivery;
  const buyerThreads = session.threads.filter((item) => item.role === 'buyer_agent');
  const listingThreads = session.threads.filter((item) => item.role === 'counterparty');
  if (buyerThreads.length !== 1 || buyerThreads[0].participants.length !== 1) {
    return fail('S19', 'Buyer-agent thread is not 1:1.');
  }
  if (listingThreads.some((item) => item.participants.length !== 1)) {
    return fail('S19', 'A group thread was created.');
  }
  audit(session, { type: 'recorded', showingId: row.id, summary: 'Buyer agent notified in-app (mock)' });
  return pass('S19', 'Buyer agent notified in the app. Nothing was sent to a carrier.');
}

function stepS20(session) {
  const blocked = releaseAccess();
  const sneaky = recordDelivery(session, {
    type: 'release_access',
    threadRole: 'counterparty',
    toPhone: session.input.listingAgentPhone,
    body: 'Lockbox code is 4455. Reply STOP to opt out.',
  });
  audit(session, { type: 'access_blocked', showingId: session.tour.id, summary: blocked.reason });
  if (blocked.allowed || sneaky.ok) return fail('S20', 'Access info was released.');
  const leaked = session.messages.some((item) => /4455|lockbox/i.test(item.body));
  if (leaked) return fail('S20', 'Access text was stored as an outbound message.');
  return pass('S20', blocked.reason);
}

function stepS21(session) {
  if (session.audits.length < 2) return fail('S21', 'Audit log is too short.');
  for (let i = 1; i < session.audits.length; i += 1) {
    if (session.audits[i].prevHash !== session.audits[i - 1].hash) {
      return fail('S21', `Chain broke at entry ${i}.`);
    }
  }
  if (session.network.twilio || session.network.xai || session.network.email) {
    return fail('S21', 'A live provider was contacted.');
  }
  return pass('S21', `${session.audits.length} audit entries, hash chain intact, no live SMS, email, or xAI.`);
}

async function stepS6F() {
  const extracted = mockOcr('blank');
  const dre = await stubDreLookup(extracted.extraction);
  const verdict = classifyVerification({ extraction: extracted.extraction, dreResult: dre });
  if (verdict.level !== 'Failed') return fail('S6F', verdict.level);
  return pass('S6F', verdict.reason);
}

async function stepS6N() {
  const verdict = classifyVerification({
    extraction: SAMPLE_CARD,
    dreResult: { status: 'not_licensed', nameMatch: false, source: 'stub', reason: 'name mismatch' },
  });
  if (verdict.level !== 'Failed') return fail('S6N', 'Expected Failed.');
  const attested = classifyVerification({
    extraction: SAMPLE_CARD,
    dreResult: { status: 'not_licensed', nameMatch: false, reason: 'name mismatch' },
    attested: true,
  });
  if (attested.level !== 'Failed') return fail('S6N', 'Failed was upgraded by attestation.');
  return pass('S6N', 'Not licensed stays Failed. Attestation cannot upgrade it.');
}

async function stepS6V() {
  const dre = await stubDreLookup(SAMPLE_CARD);
  const partial = classifyVerification({ extraction: SAMPLE_CARD, dreResult: dre });
  const verified = classifyVerification({ extraction: SAMPLE_CARD, dreResult: dre, attested: true });
  const access = releaseAccess();
  if (partial.level !== 'Partial' || verified.level !== 'Verified' || access.allowed || verified.accessEligible === false) {
    return fail('S6V', 'Attestation did not reach Verified, or access was treated as sendable.');
  }
  if (access.allowed) return fail('S6V', 'Access was allowed.');
  return pass('S6V', 'Verified by listing-agent attestation. The assistant still cannot send access info.');
}

function stepS8B() {
  const proposed = proposeBuyerRequest({
    agentName: 'Joseph Luevanos',
    phone: '2135550100',
    window: 'Sat 10:30',
  }, DAY);
  if (!proposed.blocked) return fail('S8B', 'Missing address was queued.');
  return pass('S8B', proposed.reasons[0]);
}

function stepS8H() {
  const proposed = proposeBuyerRequest({
    agentName: 'Joseph Luevanos',
    address: '123 Elm St',
    window: 'Sat 10:30',
  }, DAY);
  if (!proposed.blocked || proposed.actions.length) return fail('S8H', 'A send was drafted without a contact.');
  return pass('S8H', proposed.reasons[0]);
}

function stepS8E() {
  liveBlocked();
  const proposed = draftRequest(createSession({
    listingAgentPhone: '',
    listingAgentIsUser: false,
  }));
  const action = proposed.actions[0];
  if (!action || action.type !== 'send_email') return fail('S8E', 'Email fallback was not chosen.');
  const session = createSession({ listingAgentPhone: '', listingAgentIsUser: false });
  session.draft = action;
  const delivery = recordDelivery(session, { ...action, channel: 'email' });
  if (!delivery.ok || delivery.channel !== 'email' || delivery.mode !== 'mock' || session.network.email) {
    return fail('S8E', 'Email fallback tried to send.');
  }
  return pass('S8E', 'Email draft recorded in mock mode. SendGrid was not called.');
}

function stepS9H() {
  const session = createSession();
  session.now = NIGHT;
  const proposed = draftRequest(session, session.input, NIGHT);
  if (!isQuietHours(NIGHT) || !proposed.sendAfter || !proposed.actions[0]) {
    return fail('S9H', 'Night draft was not held.');
  }
  const row = queue(session, proposed.actions[0]);
  const delivery = recordDelivery(session, row);
  if (row.status !== 'held' || delivery.ok || session.messages.length) {
    return fail('S9H', 'Held draft was delivered.');
  }
  return pass('S9H', `Held until ${proposed.sendAfter}. Approve again after 8:00 a.m. Pacific.`);
}

function stepS10X() {
  const session = createSession();
  const delivery = recordDelivery(session, {
    type: 'send_sms',
    threadRole: 'counterparty',
    toPhone: '2135550100',
    body: 'STOP',
  });
  if (delivery.ok || session.messages.length) return fail('S10X', 'Opt-out body was sent.');
  return pass('S10X', delivery.reason);
}

async function stepS12M() {
  const session = createSession({ listingAgentIsUser: true });
  const steps = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11'];
  for (const id of steps) {
    const row = await runStep(session, id);
    if (!row.pass) return fail('S12M', `${id} failed: ${row.detail}`);
  }
  const row = session.approvals.find((item) => item.id === session.requestApprovalId);
  const delivery = recordDelivery(session, row);
  if (!delivery.ok || delivery.channel !== 'in_app' || session.network.twilio) {
    return fail('S12M', delivery.reason || 'Member route used SMS.');
  }
  const channel = routeChannel({ listingAgentIsUser: true, phone: '2135550100', email: 'maria@harbor.example' });
  if (channel !== 'in_app') return fail('S12M', 'routeChannel did not choose in-app.');
  return pass('S12M', 'Member listing agent is in-app. Twilio was not called.');
}

async function stepS14M() {
  const session = createSession({ listingAgentIsUser: true });
  session.tour = {
    address: session.input.address,
    windowLabel: session.input.window,
    seller: { name: session.input.sellerName, notified: false },
  };
  const proposed = proposeListingDecision({
    agentName: session.input.listingAgentName,
    agentPhone: session.input.listingAgentPhone,
    address: session.input.address,
    window: session.input.window,
    requesterName: session.input.buyerAgentName,
  }, DAY);
  const action = proposed.actions[0];
  if (!action || action.threadRole !== 'listing_control') return fail('S14M', 'Control thread was not drafted.');
  if (!/Reply 1 to approve, 2 to suggest a time, 3 to decline/.test(action.body)) {
    return fail('S14M', '1/2/3 instructions missing.');
  }
  queue(session, { ...action, channel: 'sms' });
  session.profile = { approvalMode: 'ask', occupantNotify: 'agent' };
  const delivery = recordDelivery(session, { ...action, channel: 'sms' });
  if (!delivery.ok || delivery.delivered || session.tour.seller.notified) {
    return fail('S14M', 'Listing decision texted the seller or called Twilio for real.');
  }
  const roles = new Set(session.threads.map((item) => item.role));
  if (!roles.has('listing_control') || roles.has('seller')) return fail('S14M', 'Control thread was not separate.');
  return pass('S14M', '1/2/3 is queued on listing_control only. Seller was not texted. SMS stayed mock.');
}

async function branchFromDelivered(reply, id, expect) {
  const session = await sessionThrough('S14');
  if (session.failed) return fail(id, session.failed.detail);
  const received = receiveReply(session.session, reply, id);
  if (!received.pass && id !== 'S15S') return received;
  if (id === 'S15S') {
    const later = recordDelivery(session.session, {
      type: 'send_sms',
      threadRole: 'counterparty',
      toPhone: session.session.input.listingAgentPhone,
      body: 'Hi, this is the AI assistant for Joseph Luevanos. Reply STOP to opt out.',
    });
    if (later.ok) return fail(id, 'A message was sent after STOP.');
    return received.pass ? pass(id, `${received.detail} Later send blocked.`) : received;
  }
  const outcome = outcomeFromReply({
    status: 'requested',
    address: '123 Elm St',
    contactName: 'Maria Chen',
    agentName: 'Joseph Luevanos',
    windowLabel: 'Sat 10:30–11:00',
  }, reply);
  session.session.tour.status = outcome.target.status;
  session.session.tour.rescheduleNote = outcome.target.rescheduleNote || null;
  session.session.tour.needsReview = Boolean(outcome.target.needsReview);
  if (outcome.followUps.some((item) => item.type === 'escalate')) {
    queue(session.session, {
      type: 'escalate',
      threadRole: 'buyer_agent',
      channel: 'in_app',
      body: `Unclear reply: ${reply}`,
    });
  }
  return expect(session.session, outcome);
}

function stepS15R() {
  return branchFromDelivered('2 3pm', 'S15R', (session, outcome) => {
    if (outcome.parsed.intent !== 'reschedule' || session.tour.status === 'confirmed') {
      return fail('S15R', 'Reschedule confirmed the stop.');
    }
    if (!session.tour.rescheduleNote || !session.tour.needsReview) {
      return fail('S15R', 'Suggested time was not held for a person.');
    }
    return pass('S15R', `Pending. Suggested time: ${session.tour.rescheduleNote}. A person reviews it.`);
  });
}

function stepS15D() {
  return branchFromDelivered('3', 'S15D', (session, outcome) => {
    if (outcome.parsed.intent !== 'decline' || session.tour.status !== 'declined') {
      return fail('S15D', `Status is ${session.tour.status}.`);
    }
    return pass('S15D', 'Tour stop declined.');
  });
}

function stepS15U() {
  return branchFromDelivered('maybe check with the seller?', 'S15U', (session, outcome) => {
    if (outcome.parsed.intent !== 'unclear' || session.tour.status === 'confirmed') {
      return fail('S15U', 'Free text confirmed the stop.');
    }
    const escalated = session.approvals.some((item) => item.type === 'escalate');
    if (!escalated) return fail('S15U', 'No escalation was queued.');
    return pass('S15U', 'Free text stays unconfirmed and is queued for a person.');
  });
}

function stepS15S() {
  return branchFromDelivered('STOP', 'S15S', () => fail('S15S', 'unreachable'));
}

const RUNNERS = {
  S1: stepS1,
  S2: stepS2,
  S3: stepS3,
  S4: stepS4,
  S5: stepS5,
  S6: stepS6,
  S7: stepS7,
  S8: stepS8,
  S9: stepS9,
  S10: stepS10,
  S11: stepS11,
  S12: stepS12,
  S13: stepS13,
  S14: stepS14,
  S15: stepS15,
  S16: stepS16,
  S17: stepS17,
  S18: stepS18,
  S19: stepS19,
  S20: stepS20,
  S21: stepS21,
};

async function runStep(session, id) {
  const runner = RUNNERS[id];
  if (!runner) return fail(id, 'Unknown step.');
  return runner(session);
}

async function sessionThrough(id, overrides) {
  const session = createSession(overrides);
  for (const stepId of HAPPY_IDS) {
    const row = await runStep(session, stepId);
    if (!row.pass) return { session, failed: row };
    if (stepId === id) return { session, failed: null };
  }
  return { session, failed: fail(id, 'Step is not on the happy path.') };
}

async function runSmartShowingsScenario() {
  const session = createSession();
  const rows = [];
  for (const id of HAPPY_IDS) {
    rows.push(await runStep(session, id));
  }
  rows.push(await stepS6F());
  rows.push(await stepS6N());
  rows.push(await stepS6V());
  rows.push(stepS8B());
  rows.push(stepS8H());
  rows.push(stepS8E());
  rows.push(stepS9H());
  rows.push(stepS10X());
  rows.push(await stepS12M());
  rows.push(await stepS14M());
  rows.push(await stepS15R());
  rows.push(await stepS15D());
  rows.push(await stepS15U());
  rows.push(await stepS15S());
  return { rows, session, network: session.network };
}

async function advanceHappy(session) {
  const id = HAPPY_IDS[session.cursor];
  if (!id) return pass('done', 'Happy path is complete.');
  const row = await runStep(session, id);
  session.cursor += 1;
  return row;
}

function replyStepId(text) {
  const value = String(text || '').trim();
  if (isOptOut(value)) return 'S15S';
  if (/^1\b/i.test(value) || /^(yes|y|yep|yeah|ok|okay)\b/i.test(value)) return 'S15';
  if (/^3\b/i.test(value) || /^(no|n|nope|decline)\b/i.test(value)) return 'S15D';
  if (/^2\b/i.test(value) || /\b(instead|another time|reschedul|how about)\b/i.test(value)) return 'S15R';
  return 'S15U';
}

async function simulateListingReply(session, text) {
  while (session.cursor < HAPPY_IDS.indexOf('S14') + 1) {
    const row = await advanceHappy(session);
    if (!row.pass) return row;
  }
  const id = replyStepId(text);
  if (id === 'S15') {
    const received = receiveReply(session, text, 'S15');
    if (!received.pass) return received;
    const parsed = await stepS16(session);
    if (!parsed.pass) return parsed;
    const confirmed = await stepS17(session);
    session.cursor = HAPPY_IDS.indexOf('S18');
    session.recentRows = [received, parsed, confirmed];
    return confirmed;
  }
  if (id === 'S15S') {
    const received = receiveReply(session, text, 'S15S');
    const later = recordDelivery(session, {
      type: 'send_sms',
      threadRole: 'counterparty',
      toPhone: session.input.listingAgentPhone,
      body: 'Hi, this is the AI assistant for Joseph Luevanos. Reply STOP to opt out.',
    });
    if (later.ok) return fail('S15S', 'A message was sent after STOP.');
    session.cursor = HAPPY_IDS.length;
    session.recentRows = [received];
    return received;
  }
  const received = receiveReply(session, text, id);
  if (!received.pass) return received;
  const outcome = outcomeFromReply({
    status: session.tour.status,
    address: session.tour.address,
    contactName: session.input.listingAgentName,
    agentName: session.input.buyerAgentName,
    dre: session.input.buyerAgentDre,
    windowLabel: session.tour.windowLabel,
  }, text);
  session.outcome = outcome;
  session.parsed = outcome.parsed;
  session.tour.status = outcome.target.status || session.tour.status;
  session.tour.rescheduleNote = outcome.target.rescheduleNote || null;
  session.tour.needsReview = Boolean(outcome.target.needsReview);
  if (outcome.followUps.some((item) => item.type === 'escalate')) {
    queue(session, {
      type: 'escalate',
      threadRole: 'buyer_agent',
      channel: 'in_app',
      body: `Unclear reply from the listing agent: ${String(text).slice(0, 160)}`,
    });
  }
  audit(session, { type: 'reply', showingId: session.tour.id, summary: `${id} ${outcome.parsed.intent}` });
  session.cursor = HAPPY_IDS.length;
  const row = id === 'S15R'
    ? pass('S15R', `Pending. Suggested time: ${session.tour.rescheduleNote || 'another time'}.`)
    : id === 'S15D'
      ? pass('S15D', 'Tour stop declined.')
      : pass('S15U', 'Free text was queued for a person. The stop was not confirmed.');
  session.recentRows = [received, row];
  return row;
}

function attestCurrent(session) {
  if (!session.verification || !session.verification.extraction) {
    return fail('S6V', 'Upload a card before attesting.');
  }
  if (session.verification.level === 'Failed') {
    return fail('S6N', 'A failed check cannot be attested.');
  }
  const verified = classifyVerification({
    extraction: session.verification.extraction,
    dreResult: session.verification.dre || { status: 'unknown', source: 'stub' },
    attested: true,
  });
  session.verification.level = verified.level;
  session.verification.reason = verified.reason;
  session.verification.accessEligible = false;
  audit(session, { type: 'attestation', showingId: 'card-1', summary: verified.reason });
  return pass('S6V', `${verified.reason} ${releaseAccess().reason}`);
}

function applyCard(session, card) {
  session.input.card = card;
  if (session.verification) session.verification.card = card;
  return card;
}

module.exports = {
  DAY,
  NIGHT,
  HAPPY_IDS,
  STEPS,
  SAMPLE_CARD,
  createSession,
  runStep,
  runSmartShowingsScenario,
  advanceHappy,
  simulateListingReply,
  applyCard,
  attestCurrent,
  mockOcr,
  releaseAccess,
};
