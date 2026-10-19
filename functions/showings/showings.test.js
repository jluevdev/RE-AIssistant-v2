const test = require('node:test');
const assert = require('node:assert/strict');
const { isQuietHours, reviewOutbound, acceptDraft, isOptOut } = require('./policy');
const { parseShowingReply, applyReplyToTarget } = require('./parseReply');
const { classifyVerification, stubDreLookup, assertAccessReleaseAllowed } = require('./verification');
const { proposeBuyerRequest, proposeListingDecision, outcomeFromReply, routeChannel, releaseAccess } = require('./engine');
const { counterpartyRequest } = require('./copy');
const { nextAudit } = require('./audit');
const { smartShowingsEnabled, smsMode } = require('./flag');

test('feature flag defaults on and sms mode defaults to mock', () => {
  assert.equal(smartShowingsEnabled({}), true);
  assert.equal(smartShowingsEnabled({ SMART_SHOWINGS_ENABLED: 'false' }), false);
  assert.equal(smartShowingsEnabled({ SMART_SHOWINGS_ENABLED: 'true' }), true);
  assert.equal(smsMode({}), 'mock');
  assert.equal(smsMode({ SMART_SHOWINGS_SMS_MODE: 'live' }), 'live');
  assert.equal(smsMode({ SMART_SHOWINGS_SMS_MODE: 'live' }), 'live');
});

test('buyer request discloses AI identity and STOP, and stays 1:1', () => {
  const body = counterpartyRequest({
    agentName: 'Joseph Luevanos',
    dre: '01234567',
    contactName: 'Maria Chen',
    address: '123 Elm',
    windowLabel: 'Sat 10:30–11:00',
  });
  assert.match(body, /AI assistant for Joseph Luevanos/);
  assert.match(body, /DRE #01234567/);
  assert.match(body, /STOP/);
  const proposed = proposeBuyerRequest({
    agentName: 'Joseph Luevanos',
    dre: '01234567',
    contactName: 'Maria Chen',
    address: '123 Elm',
    phone: '2135550100',
    window: 'Sat 10:30–11:00',
  }, new Date('2026-10-19T18:00:00Z'));
  assert.equal(proposed.blocked, false);
  assert.equal(proposed.actions.length, 1);
  assert.equal(proposed.actions[0].threadRole, 'counterparty');
  assert.equal(proposed.actions[0].type, 'send_sms');
});

test('quiet hours hold the send instead of texting at night', () => {
  const night = new Date('2026-10-20T06:30:00Z');
  assert.equal(isQuietHours(night, 'America/Los_Angeles'), true);
  const proposed = proposeBuyerRequest({
    agentName: 'Joseph Luevanos',
    address: '123 Elm',
    phone: '2135550100',
    window: 'Sat 10:30',
  }, night);
  assert.ok(proposed.sendAfter);
  assert.equal(proposed.actions[0].sendAfter, proposed.sendAfter);
});

test('missing phone falls back to email, missing both asks a human', () => {
  const email = proposeBuyerRequest({
    agentName: 'Joseph Luevanos',
    address: '123 Elm',
    email: 'maria@example.com',
    window: 'Sat 10:30',
  }, new Date('2026-10-19T18:00:00Z'));
  assert.equal(email.actions[0].type, 'send_email');
  const none = proposeBuyerRequest({
    agentName: 'Joseph Luevanos',
    address: '123 Elm',
    window: 'Sat 10:30',
  }, new Date('2026-10-19T18:00:00Z'));
  assert.equal(none.blocked, true);
});

test('listing decision is a separate control-thread approval', () => {
  const proposed = proposeListingDecision({
    agentName: 'Maria Chen',
    address: '123 Elm',
    window: 'Sat 10:30–11:00',
    requesterName: 'Joseph Luevanos',
  }, new Date('2026-10-19T18:00:00Z'));
  assert.equal(proposed.actions[0].threadRole, 'listing_control');
  assert.match(proposed.actions[0].body, /Reply 1 to approve, 2 to suggest a time, 3 to decline/);
  assert.equal(routeChannel({ listingAgentIsUser: true, phone: '2135550100' }), 'in_app');
  assert.equal(routeChannel({ listingAgentIsUser: false, phone: '2135550100' }), 'sms');
});

test('replies update tour status and unclear replies escalate', () => {
  const yes = outcomeFromReply({ address: '123 Elm', contactName: 'Maria' }, 'YES');
  assert.equal(yes.target.status, 'confirmed');
  assert.equal(yes.followUps.some((item) => item.type === 'confirm_back'), true);
  const no = applyReplyToTarget({}, parseShowingReply('No, unavailable'));
  assert.equal(no.status, 'declined');
  const later = outcomeFromReply({ address: '123 Elm' }, 'can we do 2pm instead');
  assert.equal(later.target.status, 'pending');
  assert.equal(later.followUps[0].type, 'escalate');
  assert.equal(isOptOut("please don't text me"), true);
});

test('access info never leaves the assistant', () => {
  const review = reviewOutbound('Gate code is 1234. Reply STOP to opt out. AI assistant');
  assert.equal(review.ok, false);
  assert.equal(releaseAccess().allowed, false);
  assert.equal(assertAccessReleaseAllowed().allowed, false);
  const kept = acceptDraft(
    'Hi, this is the AI assistant for Jo. Reply STOP to opt out.',
    'The lockbox code is 4455. Reply STOP to opt out.',
  );
  assert.match(kept, /AI assistant for Jo/);
  assert.doesNotMatch(kept, /4455/);
});

test('DRE stub cannot verify a card without a person', async () => {
  const dre = await stubDreLookup();
  assert.equal(dre.status, 'unknown');
  const partial = classifyVerification({
    extraction: { name: 'Maria Chen', dreNumber: '01234567', brokerage: 'Acme', phone: '2135550100' },
    dreResult: dre,
  });
  assert.equal(partial.level, 'Partial');
  assert.equal(partial.accessEligible, false);
  const attested = classifyVerification({
    extraction: { name: 'Maria Chen', dreNumber: '01234567' },
    dreResult: dre,
    attested: true,
  });
  assert.equal(attested.level, 'Verified');
  assert.match(attested.reason, /listing-agent attested/);
  const failed = classifyVerification({
    extraction: { name: 'Maria Chen', dreNumber: '01234567' },
    dreResult: { status: 'not_licensed', nameMatch: false, reason: 'name mismatch' },
  });
  assert.equal(failed.level, 'Failed');
});

test('audit entries chain', () => {
  const first = nextAudit(null, { type: 'queued', ownerUid: 'a', summary: 'one', at: '2026-10-19T00:00:00Z' });
  const second = nextAudit(first.hash, { type: 'sent', ownerUid: 'a', summary: 'two', at: '2026-10-19T00:01:00Z' });
  assert.equal(second.prevHash, first.hash);
  assert.notEqual(second.hash, first.hash);
});
