const ACCESS_PATTERNS = [
  /lock\s?box/i,
  /sentrilock/i,
  /\bsupra\b/i,
  /cbs code/i,
  /gate code/i,
  /alarm code/i,
  /access code/i,
  /entry code/i,
  /door code/i,
];

const FAIR_HOUSING_PATTERNS = [
  [/good schools?|school quality|best schools?/i, 'school quality'],
  [/demographic|racial|ethnicity/i, 'demographics'],
  [/safe (neighborhood|area)|crime rate|high crime/i, 'safety characterization'],
  [/family-friendly|good families/i, 'family-status characterization'],
];

const OPT_OUT_PATTERNS = [
  /^\s*stop\b/i,
  /\bunsubscribe\b/i,
  /\bstop texting\b/i,
  /\bdon'?t text me\b/i,
  /\bdo not text\b/i,
];

function minutesInZone(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  const hour = Number(parts.hour === '24' ? 0 : parts.hour);
  const minute = Number(parts.minute);
  return {
    minutes: hour * 60 + minute,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute,
  };
}

function isQuietHours(date, timeZone = 'America/Los_Angeles', startMin = 8 * 60, endMin = 20 * 60) {
  const { minutes } = minutesInZone(date, timeZone);
  return minutes < startMin || minutes >= endMin;
}

function nextAllowedSend(date, timeZone = 'America/Los_Angeles') {
  if (!isQuietHours(date, timeZone)) return new Date(date);
  const cursor = new Date(date.getTime());
  for (let i = 0; i < 24 * 60; i += 15) {
    cursor.setTime(date.getTime() + i * 60 * 1000);
    if (!isQuietHours(cursor, timeZone)) return new Date(cursor);
  }
  return new Date(date.getTime() + 12 * 60 * 60 * 1000);
}

function isOptOut(text) {
  const value = String(text || '').trim();
  return OPT_OUT_PATTERNS.some((pattern) => pattern.test(value));
}

function isHelp(text) {
  return /^\s*help\b/i.test(String(text || '').trim());
}

function containsAccessInfo(text) {
  return ACCESS_PATTERNS.some((pattern) => pattern.test(String(text || '')));
}

function fairHousingReason(text) {
  const value = String(text || '');
  const hit = FAIR_HOUSING_PATTERNS.find(([pattern]) => pattern.test(value));
  return hit ? hit[1] : null;
}

function hasDisclosure(text) {
  return /AI assistant/i.test(String(text || ''));
}

function hasStopLine(text) {
  return /\bSTOP\b/.test(String(text || ''));
}

function acceptDraft(template, polished) {
  const fallback = String(template || '').trim();
  const candidate = String(polished || '').trim();
  if (!candidate) return fallback;
  if (!hasDisclosure(candidate) || !hasStopLine(candidate)) return fallback;
  if (containsAccessInfo(candidate)) return fallback;
  if (fairHousingReason(candidate)) return fallback;
  return candidate;
}

function reviewOutbound(body, { quietAt = null, replyingToInbound = false } = {}) {
  const reasons = [];
  if (containsAccessInfo(body)) {
    reasons.push('Access info is human-only. The assistant will not send lockbox, gate, or alarm details.');
  }
  const housing = fairHousingReason(body);
  if (housing) reasons.push(`Fair-housing escalation: ${housing}.`);
  if (!hasDisclosure(body)) reasons.push('First-contact disclosure is missing.');
  if (!hasStopLine(body)) reasons.push('STOP opt-out line is missing.');
  let sendAfter = null;
  if (!replyingToInbound && quietAt && isQuietHours(quietAt)) {
    sendAfter = nextAllowedSend(quietAt).toISOString();
    reasons.push('Outside quiet hours (8:00 a.m.–8:00 p.m. Pacific). Hold until the next allowed time.');
  }
  const blocked = reasons.some((reason) => !reason.startsWith('Outside quiet hours'));
  return { ok: !blocked, blocked, reasons, sendAfter };
}

module.exports = {
  isQuietHours,
  nextAllowedSend,
  isOptOut,
  isHelp,
  containsAccessInfo,
  fairHousingReason,
  hasDisclosure,
  acceptDraft,
  reviewOutbound,
};
