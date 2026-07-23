/**
 * Phase 4 static smoke checks (no live Firebase required).
 * Run: node scripts/smoke-phase4.js
 */
import { createRequire } from 'module';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
}
function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

// 1) Core routes & pages
for (const file of [
  'src/features/auth/LoginPage.jsx',
  'src/features/auth/SignupPage.jsx',
  'src/features/openHouse/OpenHouseManager.jsx',
  'src/features/openHouse/PublicCheckIn.jsx',
  'src/features/offers/ListingHub.jsx',
  'src/features/offers/ListingCreate.jsx',
  'src/features/offers/OfferCompare.jsx',
  'src/features/offers/OfferDetail.jsx',
  'src/features/billing/BillingPage.jsx',
  'src/features/buyer/BuyerScheduling.jsx',
  'src/features/buyer/BuyerClientPortal.jsx',
  'src/features/messages/MessagesInbox.jsx',
  'src/features/messages/useUnreadMessages.js',
  'src/features/contacts/ContactsPage.jsx',
  'src/features/contacts/contactUtils.js',
]) {
  exists(file) ? pass(`file:${file}`) : fail(`file:${file}`, 'missing');
}

// 2) Function exports
const fnExports = Object.keys(require(path.join(root, 'functions/index.js')));
for (const fn of [
  'createCheckoutSession',
  'stripeWebhook',
  'sendAgentSms',
  'smsWebhook',
  'submitOfferInit',
  'submitOfferFinalize',
  'setOfferStatus',
  'sendOpenHouseVerificationCode',
  'verifyOpenHouseCodeAndCheckIn',
  'submitOpenHouseFeedback',
  'sendBuyerShowingRequests',
  'buildBuyerRoute',
  'getBuyerPlan',
]) {
  fnExports.includes(fn) ? pass(`fn:${fn}`) : fail(`fn:${fn}`, 'missing from functions exports');
}

// 3) PublicCheckIn FeedbackAndFlyer must be module-scoped (not nested in render IIFE)
const checkInSrc = read('src/features/openHouse/PublicCheckIn.jsx');
const feedbackDef = checkInSrc.indexOf('function FeedbackAndFlyer');
const iifeStart = checkInSrc.indexOf('{(() => {');
if (feedbackDef === -1) {
  fail('checkin:FeedbackAndFlyer', 'component not found');
} else if (iifeStart !== -1 && feedbackDef > iifeStart) {
  fail('checkin:FeedbackAndFlyer', 'defined inside render IIFE — ReferenceError at check-in success');
} else {
  pass('checkin:FeedbackAndFlyer', 'module-scoped');
}

if (checkInSrc.includes('<FeedbackAndFlyer')) pass('checkin:feedback-render');
else fail('checkin:feedback-render', 'not used on success screen');

// 4) Firestore indexes for common queries
const indexes = JSON.parse(read('firestore.indexes.json'));
const indexKeys = indexes.indexes.map((i) => i.fields.map((f) => f.fieldPath).join('+'));
for (const needed of ['ownerUid+createdAt', 'agentId+date', 'openHouseId+checkInTime', 'scheduleId+createdAt', 'contactPhone+createdAt', 'agentUid+createdAt', 'userId+updatedAt']) {
  const ok = indexKeys.some((k) => {
    if (needed === 'ownerUid+createdAt') return k.includes('ownerUid') && k.includes('createdAt');
    if (needed === 'agentId+date') return k.includes('agentId') && k.includes('date');
    if (needed === 'openHouseId+checkInTime') return k.includes('openHouseId') && k.includes('checkInTime');
    if (needed === 'scheduleId+createdAt') return k.includes('scheduleId') && k.includes('createdAt');
    if (needed === 'contactPhone+createdAt') return k.includes('contactPhone') && k.includes('createdAt');
    if (needed === 'agentUid+createdAt') return k.includes('agentUid') && k.includes('createdAt');
    if (needed === 'userId+updatedAt') return k.includes('userId') && k.includes('updatedAt');
    return false;
  });
  ok ? pass(`index:${needed}`) : fail(`index:${needed}`, 'missing from firestore.indexes.json');
}

// Buyer portal must use server-side token resolution (not direct clientPlanTokens reads)
const portalSrc = read('src/features/buyer/BuyerClientPortal.jsx');
portalSrc.includes("httpsCallable(functions, 'getBuyerPlan')")
  ? pass('buyer:getBuyerPlan-callable')
  : fail('buyer:getBuyerPlan-callable', 'client portal should not read tokens directly');
if (portalSrc.includes('clientPlanTokens')) {
  fail('buyer:portal-token-leak', 'client portal reads clientPlanTokens directly');
} else {
  pass('buyer:portal-token-leak');
}

// 5) No hardcoded stripe secret patterns in src/functions
const badPatterns = [/sk_live_[a-zA-Z0-9]+/, /sk_test_[a-zA-Z0-9]{20,}/, /AC[a-f0-9]{32}/i];
for (const rel of ['functions/billing/handlers.js', 'functions/messaging/handlers.js', 'functions/buyer/handlers.js', 'src/config/stripe.js']) {
  const src = read(rel);
  const hit = badPatterns.find((re) => re.test(src));
  hit ? fail(`secrets:${rel}`, `possible hardcoded credential matched ${hit}`) : pass(`secrets:${rel}`);
}

// 6) stripeWebhook must be onRequest not stub onCall
const billingHandlers = read('functions/billing/handlers.js');
billingHandlers.includes('exports.stripeWebhook = onRequest') ? pass('billing:stripeWebhook-http') : fail('billing:stripeWebhook-http');

// 7) Phase 7 — Messages inbox wiring
const appSrc = read('src/App.jsx');
appSrc.includes('/messages') && appSrc.includes('MessagesInbox')
  ? pass('messages:route')
  : fail('messages:route', 'App.jsx missing /messages route');

const inboxSrc = read('src/features/messages/MessagesInbox.jsx');
inboxSrc.includes("httpsCallable(functions, 'sendAgentSms')")
  ? pass('messages:sendAgentSms-callable')
  : fail('messages:sendAgentSms-callable', 'inbox should use sendAgentSms callable');

const navSrc = read('src/components/layout/navConfig.js');
const messagesNavLine = navSrc.split('\n').find((line) => line.includes("to: '/messages'"));
messagesNavLine && !messagesNavLine.includes('soon:')
  ? pass('messages:nav-enabled')
  : fail('messages:nav-enabled', 'Messages nav still marked soon');

// 8) Phase 8 — Contacts CRM wiring
appSrc.includes('/contacts') && appSrc.includes('ContactsPage')
  ? pass('contacts:route')
  : fail('contacts:route', 'App.jsx missing /contacts route');

const contactsNavLine = navSrc.split('\n').find((line) => line.includes("to: '/contacts'"));
contactsNavLine && !contactsNavLine.includes('soon:')
  ? pass('contacts:nav-enabled')
  : fail('contacts:nav-enabled', 'Contacts nav still marked soon');

const contactsUtilsSrc = read('src/features/contacts/contactUtils.js');
contactsUtilsSrc.includes('deriveContactsFromSources') && contactsUtilsSrc.includes('mergeContacts')
  ? pass('contacts:utils')
  : fail('contacts:utils', 'contactUtils missing derive/merge helpers');

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
console.log(`\nPhase 4 static smoke: ${passed}/${results.length} passed\n`);
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
}
if (failed.length) process.exit(1);
