/** Pure onboarding helpers — step order, defaults, derived completion. */

export const STEP_ORDER = ['profile', 'inbox', 'contacts', 'analytics', 'automation', 'team'];

export const STEP_META = {
  profile: {
    id: 'profile',
    title: 'Complete your profile',
    description: 'Name, phone, and timezone power SMS and reminders.',
    whyNext: 'A complete profile unlocks your inbox — replies show your name and number correctly.',
    to: '/dashboard',
    actionLabel: 'Update profile',
  },
  inbox: {
    id: 'inbox',
    title: 'Open your inbox',
    description: 'Send or receive your first SMS thread.',
    whyNext: 'Conversations feed your CRM automatically.',
    to: '/messages',
    actionLabel: 'Go to Messages',
  },
  contacts: {
    id: 'contacts',
    title: 'Build your CRM',
    description: 'Contacts auto-fill from check-ins, offers, and tours.',
    whyNext: 'Your book of business makes analytics meaningful.',
    to: '/contacts',
    actionLabel: 'View Contacts',
  },
  analytics: {
    id: 'analytics',
    title: 'Review your dashboard',
    description: 'See visitors, offers, and response rates in one place.',
    whyNext: 'Numbers justify automations and team expansion.',
    to: '/dashboard',
    actionLabel: 'View analytics',
  },
  automation: {
    id: 'automation',
    title: 'Turn on automations',
    description: 'Follow-ups after open houses and offers run while you sleep.',
    whyNext: 'Automations scale when you add a team.',
    to: '/automations',
    actionLabel: 'Set up Automations',
  },
  team: {
    id: 'team',
    title: 'Join or create a team',
    description: 'Share listings and offers with your brokerage (optional).',
    whyNext: 'Teams multiply everything you built above.',
    to: '/team',
    actionLabel: 'Explore Team',
  },
};

export const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Phoenix',
];

export function defaultOnboarding() {
  return {
    startedAt: null,
    completedAt: null,
    dismissedWizard: false,
    dismissedChecklist: false,
    wizardStep: 0,
    steps: {
      profile: false,
      inbox: false,
      contacts: false,
      analytics: false,
      automation: false,
      team: false,
    },
  };
}

export function mergeOnboarding(stored) {
  const base = defaultOnboarding();
  if (!stored || typeof stored !== 'object') return base;
  return {
    ...base,
    ...stored,
    steps: { ...base.steps, ...(stored.steps || {}) },
  };
}

function profileComplete(userProfile) {
  const fullName = String(userProfile?.fullName || '').trim();
  const phone = String(userProfile?.phone || '').trim();
  const timezone = String(userProfile?.timezone || '').trim();
  return Boolean(fullName && phone && timezone);
}

function hasDashboardActivity(data) {
  if (!data) return false;
  return (
    (data.visitors?.length || 0) > 0 ||
    (data.offers?.length || 0) > 0 ||
    (data.openHouses?.length || 0) > 0 ||
    (data.schedules?.length || 0) > 0 ||
    (data.messages?.length || 0) > 0 ||
    (data.contacts?.length || 0) > 0
  );
}

function automationEnabled(settingsDoc) {
  if (!settingsDoc?.rules) return false;
  return Object.values(settingsDoc.rules).some((rule) => rule?.enabled);
}

/**
 * @returns {Record<string, { done: boolean, derived: boolean, manual: boolean }>}
 */
export function computeStepStatus({
  userProfile,
  dashboardData,
  automationSettings,
  manualSteps = {},
}) {
  const teamId = userProfile?.teamId || null;
  const messages = dashboardData?.messages || [];
  const contacts = dashboardData?.contacts || [];

  const derived = {
    profile: profileComplete(userProfile),
    inbox: messages.length > 0,
    contacts: contacts.length > 0,
    analytics: hasDashboardActivity(dashboardData),
    automation: automationEnabled(automationSettings),
    team: Boolean(teamId),
  };

  const result = {};
  for (const id of STEP_ORDER) {
    const manual = Boolean(manualSteps[id]);
    result[id] = {
      done: derived[id] || manual,
      derived: derived[id],
      manual,
    };
  }
  return result;
}

export function countCompleted(stepStatus) {
  const done = STEP_ORDER.filter((id) => stepStatus[id]?.done).length;
  return { done, total: STEP_ORDER.length };
}

export function isFullyComplete(stepStatus) {
  return STEP_ORDER.every((id) => stepStatus[id]?.done);
}

export function shouldShowWizard(userProfile) {
  const onboarding = mergeOnboarding(userProfile?.onboarding);
  if (onboarding.completedAt || onboarding.dismissedWizard) return false;
  return true;
}

export function shouldShowChecklist(userProfile, stepStatus) {
  const onboarding = mergeOnboarding(userProfile?.onboarding);
  if (onboarding.dismissedChecklist) return false;
  if (onboarding.completedAt) return false;
  return !isFullyComplete(stepStatus);
}
