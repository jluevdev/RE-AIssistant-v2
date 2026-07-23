/** Client-side automation helpers (mirrors functions/automations/settings.js). */

export const DELAY_PRESETS = [
  { id: 'immediate', label: 'Immediate', minutes: 0 },
  { id: '15m', label: '15 minutes', minutes: 15 },
  { id: '1h', label: '1 hour', minutes: 60 },
  { id: '4h', label: '4 hours', minutes: 240 },
  { id: '24h', label: '24 hours', minutes: 1440 },
  { id: 'custom', label: 'Custom', minutes: null },
];

export const REMINDER_PRESETS = [
  { minutes: 30, label: '30 min before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 120, label: '2 hours before' },
];

export const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Phoenix',
];

export const RULE_META = {
  openHouseVisitorSms: {
    title: 'Open house visitor SMS',
    description: 'Sent to the visitor after check-in.',
    channel: 'sms',
    timing: 'delay',
  },
  openHouseVisitorEmail: {
    title: 'Open house visitor email',
    description: 'Sent to the visitor after check-in.',
    channel: 'email',
    timing: 'delay',
  },
  openHouseAgentReminderSms: {
    title: 'Open house agent reminder',
    description: 'SMS reminder to you before your open house starts.',
    channel: 'sms',
    timing: 'minutesBefore',
  },
  offerBuyerAgentSms: {
    title: 'Offer received — buyer agent SMS',
    description: 'Acknowledges the buyer’s agent after an offer is finalized.',
    channel: 'sms',
    timing: 'delay',
  },
  offerBuyerAgentEmail: {
    title: 'Offer received — buyer agent email',
    description: 'Email ack to the buyer’s agent after an offer is finalized.',
    channel: 'email',
    timing: 'delay',
  },
  buyerTourFollowupSms: {
    title: 'Buyer tour follow-up SMS',
    description: 'Coming soon — automatic follow-up after a buyer tour is created.',
    channel: 'sms',
    timing: 'delay',
    comingSoon: true,
  },
};

export const TYPE_LABELS = {
  open_house_visitor_sms: 'Visitor SMS',
  open_house_visitor_email: 'Visitor email',
  open_house_agent_reminder_sms: 'Agent reminder',
  offer_buyer_agent_sms: 'Offer SMS',
  offer_buyer_agent_email: 'Offer email',
  buyer_tour_followup_sms: 'Tour follow-up',
};

export function renderTemplate(template, vars = {}) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = vars[key];
    return value == null ? '' : String(value);
  });
}

export function getDefaultAutomationSettings(ownerUid) {
  return {
    ownerUid: ownerUid || null,
    global: {
      quietHoursEnabled: false,
      quietHoursStart: '21:00',
      quietHoursEnd: '08:00',
      timezone: 'America/Los_Angeles',
      sendWindow: 'immediate',
    },
    rules: {
      openHouseVisitorSms: {
        enabled: false,
        delayPreset: '1h',
        delayMinutes: 60,
        template:
          "Hi {{visitorName}} — thanks for visiting {{address}}! I'm {{agentName}}. Any questions or want to schedule a private showing? Reply STOP to opt out.",
      },
      openHouseVisitorEmail: {
        enabled: false,
        delayPreset: '1h',
        delayMinutes: 60,
        subject: 'Thanks for visiting {{address}}',
        template:
          "Hi {{visitorName}},\n\nThank you for visiting {{address}} on {{openHouseDate}}. I'm {{agentName}} — happy to answer questions or set up a private showing.\n\nBest regards",
      },
      openHouseAgentReminderSms: {
        enabled: true,
        minutesBefore: 60,
        template:
          'Reminder: Your open house at {{address}} starts in ~{{minutesBefore}} min ({{openHouseTime}}).',
      },
      offerBuyerAgentSms: {
        enabled: false,
        delayPreset: 'immediate',
        delayMinutes: 0,
        template:
          'Hi {{buyerAgentName}} — we received your offer for {{hubSlug}} ({{price}}). {{agentName}} will review and follow up shortly.',
      },
      offerBuyerAgentEmail: {
        enabled: false,
        delayPreset: 'immediate',
        delayMinutes: 0,
        subject: 'Offer received — {{hubSlug}}',
        template:
          'Hi {{buyerAgentName}},\n\nWe received your offer for {{hubSlug}} ({{price}}). {{agentName}} will review and follow up shortly.\n\nThank you.',
      },
      buyerTourFollowupSms: {
        enabled: false,
        delayMinutes: 60,
        template:
          'Hi — following up on the buyer tour schedule. Please reply with any updates. Reply STOP to opt out.',
      },
    },
  };
}

function deepMerge(base, overlay) {
  if (!overlay || typeof overlay !== 'object') return base;
  const out = { ...base };
  for (const key of Object.keys(overlay)) {
    const v = overlay[key];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[key] && typeof base[key] === 'object') {
      out[key] = deepMerge(base[key], v);
    } else if (v !== undefined) {
      out[key] = v;
    }
  }
  return out;
}

export function mergeSettings(stored, ownerUid) {
  const defaults = getDefaultAutomationSettings(ownerUid);
  if (!stored) return defaults;
  return deepMerge(defaults, { ...stored, ownerUid: ownerUid || stored.ownerUid });
}

export function resolveDelayMinutes(preset, customMinutes) {
  const found = DELAY_PRESETS.find((p) => p.id === preset);
  if (preset === 'custom' || !found || found.minutes == null) {
    const n = Number(customMinutes);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }
  return found.minutes;
}

export const SAMPLE_VARS = {
  visitorName: 'Alex',
  address: '123 Main St',
  agentName: 'Jordan',
  openHouseDate: 'Sat, Mar 15',
  openHouseTime: '1:00 PM',
  minutesBefore: '60',
  buyerAgentName: 'Sam',
  hubSlug: '123-main-st',
  price: '$875,000',
};

export function statusTone(status) {
  if (status === 'sent') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'skipped' || status === 'canceled') return 'warning';
  return 'neutral';
}
