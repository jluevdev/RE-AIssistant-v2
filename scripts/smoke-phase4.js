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
  'src/features/dashboard/dashboardMetrics.js',
  'src/features/dashboard/useDashboardData.js',
  'src/features/automations/AutomationsPage.jsx',
  'src/features/automations/automationsUtils.js',
  'functions/automations/worker.js',
  'functions/automations/settings.js',
  'functions/automations/enqueue.js',
  'functions/automations/triggers.js',
  'src/features/teams/TeamPage.jsx',
  'src/features/teams/useTeam.js',
  'functions/teams/index.js',
  'functions/teams/handlers.js',
  'src/features/onboarding/OnboardingWizard.jsx',
  'src/features/onboarding/SetupChecklist.jsx',
  'src/features/onboarding/useOnboarding.js',
  'src/components/ui/Tooltip.jsx',
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
  'processScheduledTasksScheduled',
  'processScheduledTasksHttp',
  'onOpenHouseVisitorCreated',
  'onOfferFinalized',
  'onOpenHouseCreated',
  'scheduleOpenHouseReminder',
  'processOpenHouseReminders',
  'sendFollowUpMessages',
  'createTeam',
  'inviteMember',
  'acceptInvite',
  'createTeamCheckoutSession',
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
for (const needed of ['ownerUid+createdAt', 'agentId+date', 'openHouseId+checkInTime', 'scheduleId+createdAt', 'contactPhone+createdAt', 'agentUid+createdAt', 'userId+updatedAt', 'status+runAt']) {
  const ok = indexKeys.some((k) => {
    if (needed === 'ownerUid+createdAt') return k.includes('ownerUid') && k.includes('createdAt');
    if (needed === 'agentId+date') return k.includes('agentId') && k.includes('date');
    if (needed === 'openHouseId+checkInTime') return k.includes('openHouseId') && k.includes('checkInTime');
    if (needed === 'scheduleId+createdAt') return k.includes('scheduleId') && k.includes('createdAt');
    if (needed === 'contactPhone+createdAt') return k.includes('contactPhone') && k.includes('createdAt');
    if (needed === 'agentUid+createdAt') return k.includes('agentUid') && k.includes('createdAt');
    if (needed === 'userId+updatedAt') return k.includes('userId') && k.includes('updatedAt');
    if (needed === 'status+runAt') return k.includes('status') && k.includes('runAt');
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

// 9) Phase 9 — Dashboard money view
const dashboardSrc = read('src/features/dashboard/DashboardShell.jsx');
dashboardSrc.includes('computeDashboardMetrics') && dashboardSrc.includes('useDashboardData')
  ? pass('dashboard:metrics-wired')
  : fail('dashboard:metrics-wired', 'DashboardShell missing analytics wiring');

const metricsSrc = read('src/features/dashboard/dashboardMetrics.js');
metricsSrc.includes('computeDashboardMetrics') && metricsSrc.includes('isThisMonth')
  ? pass('dashboard:metrics-helpers')
  : fail('dashboard:metrics-helpers', 'dashboardMetrics missing core helpers');

// 10) Phase 10 — Automations
appSrc.includes('/automations') && appSrc.includes('AutomationsPage')
  ? pass('automations:route')
  : fail('automations:route', 'App.jsx missing /automations route');

const automationsNavLine = navSrc.split('\n').find((line) => line.includes("to: '/automations'"));
automationsNavLine && !automationsNavLine.includes('soon:')
  ? pass('automations:nav-enabled')
  : fail('automations:nav-enabled', 'Automations nav missing or marked soon');

const automationsPageSrc = read('src/features/automations/AutomationsPage.jsx');
automationsPageSrc.includes('automationSettings') && automationsPageSrc.includes('scheduledTasks')
  ? pass('automations:settings-activity')
  : fail('automations:settings-activity', 'AutomationsPage missing settings/activity wiring');

const workerSrc = read('functions/automations/worker.js');
workerSrc.includes('dnc') && workerSrc.includes("collection('messages')")
  ? pass('automations:worker-dnc-messages')
  : fail('automations:worker-dnc-messages', 'worker must check dnc and log messages');

const reminderSrc = read('functions/openHouse/handlers.js');
reminderSrc.includes("require('../automations/enqueue')") || reminderSrc.includes('scheduledTasks')
  ? pass('automations:reminder-migrated')
  : fail('automations:reminder-migrated', 'scheduleOpenHouseReminder should enqueue scheduledTasks');

const rulesSrc = read('firestore.rules');
rulesSrc.includes('automationSettings') && rulesSrc.includes('scheduledTasks')
  ? pass('automations:rules')
  : fail('automations:rules', 'firestore.rules missing automation collections');

// 11) Phase 11 — Teams & brokerages
appSrc.includes('/team') && appSrc.includes('TeamPage')
  ? pass('team:route')
  : fail('team:route', 'App.jsx missing /team route');

appSrc.includes('/join/:token') && appSrc.includes('JoinTeamPage')
  ? pass('team:join-route')
  : fail('team:join-route', 'App.jsx missing /join/:token route');

const teamNavLine = navSrc.split('\n').find((line) => line.includes("to: '/team'"));
teamNavLine && !teamNavLine.includes('soon:')
  ? pass('team:nav-enabled')
  : fail('team:nav-enabled', 'Team nav missing or marked soon');

dashboardSrc.includes('useTeamDashboardData') && dashboardSrc.includes('My work')
  ? pass('dashboard:team-toggle')
  : fail('dashboard:team-toggle', 'DashboardShell missing team toggle');

rulesSrc.includes('match /teams/{teamId}') && rulesSrc.includes('teamInvites')
  ? pass('team:rules')
  : fail('team:rules', 'firestore.rules missing team collections');

const usersRuleLocked =
  rulesSrc.includes('request.resource.data.teamId == resource.data.teamId') &&
  rulesSrc.includes('request.resource.data.teamRole == resource.data.teamRole');
usersRuleLocked ? pass('team:users-rule-locked') : fail('team:users-rule-locked', 'users teamId/teamRole must be client-locked');

const teamHandlersSrc = read('functions/teams/handlers.js');
teamHandlersSrc.includes('exports.createTeam') && teamHandlersSrc.includes('exports.acceptInvite')
  ? pass('team:callables')
  : fail('team:callables', 'teams handlers missing core callables');

// 12) Phase 12 — Onboarding & polish
exists('public/manifest.webmanifest') ? pass('file:public/manifest.webmanifest') : fail('file:public/manifest.webmanifest', 'missing');

const indexHtml = read('index.html');
indexHtml.includes('manifest.webmanifest') && indexHtml.includes('theme-color')
  ? pass('pwa:manifest-linked')
  : fail('pwa:manifest-linked', 'index.html missing manifest/theme-color');

const bootstrapSrc = read('src/bootstrap.jsx');
bootstrapSrc.includes('virtual:pwa-register') || bootstrapSrc.includes('registerSW')
  ? pass('pwa:register-sw')
  : fail('pwa:register-sw', 'bootstrap should register service worker');

dashboardSrc.includes('SetupChecklist')
  ? pass('onboarding:checklist-on-dashboard')
  : fail('onboarding:checklist-on-dashboard', 'DashboardShell missing SetupChecklist');

const appLayoutSrc = read('src/components/layout/AppLayout.jsx');
appLayoutSrc.includes('OnboardingWizard') && appLayoutSrc.includes('InstallPrompt')
  ? pass('onboarding:app-shell')
  : fail('onboarding:app-shell', 'AppLayout missing onboarding components');

// 13) Phase 13 — Public marketing site
for (const file of [
  'src/features/marketing/MarketingLayout.jsx',
  'src/features/marketing/marketingContent.js',
  'src/features/marketing/pages/LandingPage.jsx',
  'src/features/marketing/pages/PricingPage.jsx',
  'src/features/marketing/pages/PrivacyPage.jsx',
  'src/features/marketing/pages/TermsPage.jsx',
]) {
  exists(file) ? pass(`file:${file}`) : fail(`file:${file}`, 'missing');
}

appSrc.includes('MarketingLayout') && appSrc.includes('LandingPage')
  ? pass('marketing:landing-route')
  : fail('marketing:landing-route', 'App.jsx missing marketing landing route');

appSrc.includes('/pricing') && appSrc.includes('PricingPage')
  ? pass('marketing:pricing-route')
  : fail('marketing:pricing-route', 'App.jsx missing /pricing route');

appSrc.includes('/privacy') && appSrc.includes('/terms')
  ? pass('marketing:legal-routes')
  : fail('marketing:legal-routes', 'App.jsx missing privacy/terms routes');

const marketingContentSrc = read('src/features/marketing/marketingContent.js');
marketingContentSrc.includes('planFeatures') && marketingContentSrc.includes('faq')
  ? pass('marketing:content-module')
  : fail('marketing:content-module', 'marketingContent.js missing core sections');

const pricingCardsSrc = read('src/features/marketing/components/PricingCards.jsx');
pricingCardsSrc.includes('SUBSCRIPTION_PLANS') && pricingCardsSrc.includes('Most Popular')
  ? pass('marketing:pricing-from-config')
  : fail('marketing:pricing-from-config', 'PricingCards should use SUBSCRIPTION_PLANS');

indexHtml.includes('og:title') && indexHtml.includes('og:description')
  ? pass('marketing:seo-meta')
  : fail('marketing:seo-meta', 'index.html missing OG meta tags');

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
console.log(`\nPhase 4 static smoke: ${passed}/${results.length} passed\n`);
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
}
if (failed.length) process.exit(1);
