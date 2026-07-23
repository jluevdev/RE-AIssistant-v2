/**
 * Automation settings defaults, merge, templates, and timing helpers.
 */

const DELAY_PRESETS = {
  immediate: 0,
  '15m': 15,
  '1h': 60,
  '4h': 240,
  '24h': 1440,
};

const DEFAULT_TEMPLATES = {
  openHouseVisitorSms:
    "Hi {{visitorName}} — thanks for visiting {{address}}! I'm {{agentName}}. Any questions or want to schedule a private showing? Reply STOP to opt out.",
  openHouseVisitorEmail:
    'Hi {{visitorName}},\n\nThank you for visiting {{address}} on {{openHouseDate}}. I\'m {{agentName}} — happy to answer questions or set up a private showing.\n\nBest regards',
  openHouseVisitorEmailSubject: 'Thanks for visiting {{address}}',
  openHouseAgentReminderSms:
    'Reminder: Your open house at {{address}} starts in ~{{minutesBefore}} min ({{openHouseTime}}).',
  offerBuyerAgentSms:
    'Hi {{buyerAgentName}} — we received your offer for {{hubSlug}} ({{price}}). {{agentName}} will review and follow up shortly.',
  offerBuyerAgentEmail:
    'Hi {{buyerAgentName}},\n\nWe received your offer for {{hubSlug}} ({{price}}). {{agentName}} will review and follow up shortly.\n\nThank you.',
  offerBuyerAgentEmailSubject: 'Offer received — {{hubSlug}}',
  buyerTourFollowupSms:
    'Hi — following up on the buyer tour schedule. Please reply with any updates. Reply STOP to opt out.',
};

function getDefaultAutomationSettings(ownerUid) {
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
        template: DEFAULT_TEMPLATES.openHouseVisitorSms,
      },
      openHouseVisitorEmail: {
        enabled: false,
        delayPreset: '1h',
        delayMinutes: 60,
        subject: DEFAULT_TEMPLATES.openHouseVisitorEmailSubject,
        template: DEFAULT_TEMPLATES.openHouseVisitorEmail,
      },
      // Recommended default — opt-outable
      openHouseAgentReminderSms: {
        enabled: true,
        minutesBefore: 60,
        template: DEFAULT_TEMPLATES.openHouseAgentReminderSms,
      },
      offerBuyerAgentSms: {
        enabled: false,
        delayPreset: 'immediate',
        delayMinutes: 0,
        template: DEFAULT_TEMPLATES.offerBuyerAgentSms,
      },
      offerBuyerAgentEmail: {
        enabled: false,
        delayPreset: 'immediate',
        delayMinutes: 0,
        subject: DEFAULT_TEMPLATES.offerBuyerAgentEmailSubject,
        template: DEFAULT_TEMPLATES.offerBuyerAgentEmail,
      },
      buyerTourFollowupSms: {
        enabled: false,
        delayMinutes: 60,
        template: DEFAULT_TEMPLATES.buyerTourFollowupSms,
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

function mergeSettings(stored, ownerUid) {
  const defaults = getDefaultAutomationSettings(ownerUid);
  if (!stored) return defaults;
  return deepMerge(defaults, {
    ...stored,
    ownerUid: ownerUid || stored.ownerUid || defaults.ownerUid,
  });
}

function renderTemplate(template, vars = {}) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = vars[key];
    return value == null ? '' : String(value);
  });
}

function resolveDelayMinutes(preset, customMinutes) {
  if (preset === 'custom') {
    const n = Number(customMinutes);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }
  if (preset && Object.prototype.hasOwnProperty.call(DELAY_PRESETS, preset)) {
    return DELAY_PRESETS[preset];
  }
  const n = Number(customMinutes);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function parseHm(hm) {
  const [h, m] = String(hm || '0:0').split(':').map((x) => Number(x));
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
}

/**
 * If quiet hours enabled, bump runAt into the next allowed window (local timezone approx via Intl).
 * For simplicity we interpret quiet hours in the configured timezone using offset-free local parts.
 */
function applyQuietHours(runAt, globalSettings = {}) {
  if (!globalSettings.quietHoursEnabled) return new Date(runAt);

  const date = new Date(runAt);
  const tz = globalSettings.timezone || 'America/Los_Angeles';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour === '24' ? 0 : parts.hour);
  const minute = Number(parts.minute);
  const mins = hour * 60 + minute;

  const start = parseHm(globalSettings.quietHoursStart || '21:00');
  const end = parseHm(globalSettings.quietHoursEnd || '08:00');
  const startMins = start.h * 60 + start.m;
  const endMins = end.h * 60 + end.m;

  const inQuiet =
    startMins > endMins
      ? mins >= startMins || mins < endMins
      : mins >= startMins && mins < endMins;

  if (!inQuiet) return date;

  // Advance to quietHoursEnd same day or next day
  const advanceMins =
    startMins > endMins
      ? mins >= startMins
        ? 24 * 60 - mins + endMins
        : endMins - mins
      : endMins - mins;

  return new Date(date.getTime() + advanceMins * 60 * 1000);
}

function applyBusinessHours(runAt, globalSettings = {}) {
  if (globalSettings.sendWindow !== 'business_hours') return new Date(runAt);
  const date = new Date(runAt);
  const tz = globalSettings.timezone || 'America/Los_Angeles';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour === '24' ? 0 : parts.hour);
  const weekday = parts.weekday;
  const isWeekend = weekday === 'Sat' || weekday === 'Sun';

  // Business hours 9–18 local
  if (!isWeekend && hour >= 9 && hour < 18) return date;

  // Bump forward hour-by-hour until inside window (cap 7 days)
  let cursor = new Date(date);
  for (let i = 0; i < 24 * 7; i += 1) {
    cursor = new Date(cursor.getTime() + 60 * 60 * 1000);
    const p = Object.fromEntries(formatter.formatToParts(cursor).map((x) => [x.type, x.value]));
    const h = Number(p.hour === '24' ? 0 : p.hour);
    const wd = p.weekday;
    if (wd !== 'Sat' && wd !== 'Sun' && h >= 9 && h < 18) return cursor;
  }
  return date;
}

function computeRunAt(baseDate, delayMinutes, globalSettings) {
  let runAt = new Date(baseDate.getTime() + (Number(delayMinutes) || 0) * 60 * 1000);
  runAt = applyQuietHours(runAt, globalSettings);
  runAt = applyBusinessHours(runAt, globalSettings);
  return runAt;
}

module.exports = {
  DELAY_PRESETS,
  DEFAULT_TEMPLATES,
  getDefaultAutomationSettings,
  mergeSettings,
  renderTemplate,
  resolveDelayMinutes,
  applyQuietHours,
  applyBusinessHours,
  computeRunAt,
};
