export const TESTER_STORAGE_VERSION = 'v1';

export const TESTER_MODE_KEY = 'reai.testerMode';

export function testerProgressKey(uid) {
  return `reai.testerChecklist.${TESTER_STORAGE_VERSION}.${uid || 'anon'}`;
}

export const TESTER_STEP_ORDER = [
  'dashboard',
  'openHouse',
  'automations',
  'contacts',
  'messages',
  'navSections',
  'helpBot',
  'team',
];

/** @type {Record<string, { title: string; description: string; goodLooksLike: string; to?: string; actionLabel: string; optional?: boolean; smsWarning?: string }>} */
export const TESTER_STEPS = {
  dashboard: {
    title: 'Dashboard stats',
    description: 'Confirm your workspace loads and monthly stats appear.',
    goodLooksLike: 'Numbers load (0 is OK). Listing / Buyer / Team tool sections visible.',
    to: '/dashboard',
    actionLabel: 'Open dashboard',
  },
  openHouse: {
    title: 'Open house check-in',
    description: 'Create or open an open house and check in a test visitor.',
    goodLooksLike: 'Visitor saves with name + phone. No crash on mobile.',
    to: '/open-houses',
    actionLabel: 'Open houses',
  },
  automations: {
    title: 'Automations activity',
    description: 'Open Automations and check the Activity tab after check-in.',
    goodLooksLike: 'A task may appear (Scheduled → Sent/Failed) within a few minutes.',
    to: '/automations',
    actionLabel: 'Automations',
  },
  contacts: {
    title: 'Contacts sync',
    description: 'Open Contacts after check-in and confirm the visitor appears.',
    goodLooksLike: 'New contact shows up (may take a moment).',
    to: '/contacts',
    actionLabel: 'Contacts',
  },
  messages: {
    title: 'SMS inbox (optional)',
    description: 'Send or view a thread if Twilio is configured for this project.',
    goodLooksLike: 'Threads group by phone; unread badge on Messages nav.',
    to: '/messages',
    actionLabel: 'Messages',
    optional: true,
    smsWarning:
      'All testers share one Twilio number. Use a unique client test phone — do not text the same number another tester used.',
  },
  navSections: {
    title: 'Navigation pass',
    description: 'Tap through sidebar sections: Workspace, Listing Agent, Buyer Agent, Team.',
    goodLooksLike: 'No blank screens or broken layouts on phone and desktop.',
    to: '/dashboard',
    actionLabel: 'Review nav',
  },
  helpBot: {
    title: 'In-app help',
    description: 'Open the ? help button and ask how to create an open house.',
    goodLooksLike: 'Help answers with a link you can tap to navigate.',
    actionLabel: 'Open help',
  },
  team: {
    title: 'Team page (optional)',
    description: 'If you have team access, open Team and review invites or roles.',
    goodLooksLike: 'Team page loads; invite flow visible for owners.',
    to: '/team',
    actionLabel: 'Team',
    optional: true,
  },
};

export const TESTER_REPORT_EMAIL = 'support@reaiassistant.com';

export function countTesterProgress(completed) {
  const required = TESTER_STEP_ORDER.filter((id) => !TESTER_STEPS[id]?.optional);
  const doneRequired = required.filter((id) => completed[id]).length;
  const doneAll = TESTER_STEP_ORDER.filter((id) => completed[id]).length;
  return {
    doneRequired,
    requiredTotal: required.length,
    doneAll,
    allTotal: TESTER_STEP_ORDER.length,
  };
}
