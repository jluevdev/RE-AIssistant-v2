const TIME_RE = /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b/i;

function parseShowingReply(text) {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();
  if (!raw) {
    return { intent: 'unclear', confidence: 0, choice: null, suggestedTime: null };
  }
  if (/^\s*stop\b/i.test(raw) || /\bdon'?t text me\b/i.test(lower) || /\bdo not text\b/i.test(lower)) {
    return { intent: 'opt_out', confidence: 0.99, choice: null, suggestedTime: null };
  }
  if (/^(1|yes|y|yep|yeah|ok|okay|approve|approved|confirm|confirmed)\b/.test(lower)) {
    return { intent: 'confirm', confidence: 0.95, choice: '1', suggestedTime: null };
  }
  if (/^(3|no|n|nope|decline|declined)\b/.test(lower)) {
    return { intent: 'decline', confidence: 0.95, choice: '3', suggestedTime: null };
  }
  if (/^2\b/.test(lower) || /\b(instead|another time|reschedul|how about|can we do)\b/i.test(lower)) {
    const time = raw.match(TIME_RE);
    return {
      intent: 'reschedule',
      confidence: time ? 0.7 : 0.55,
      choice: '2',
      suggestedTime: time ? time[0] : null,
    };
  }
  if (/\b(yes|confirm|works|available|sounds good)\b/i.test(lower) && !/\b(no|not|can't|cannot)\b/i.test(lower)) {
    return { intent: 'confirm', confidence: 0.8, choice: '1', suggestedTime: null };
  }
  if (/\b(no|unavailable|can't|cannot|not available|decline)\b/i.test(lower)) {
    return { intent: 'decline', confidence: 0.75, choice: '3', suggestedTime: null };
  }
  return { intent: 'unclear', confidence: 0.2, choice: null, suggestedTime: null };
}

function applyReplyToTarget(target, parsed) {
  const next = { ...(target || {}) };
  if (parsed.intent === 'opt_out') {
    next.status = next.status || 'pending';
    next.optedOut = true;
    next.needsReview = true;
    return next;
  }
  if (parsed.intent === 'confirm' && parsed.confidence >= 0.8) {
    next.status = 'confirmed';
    next.needsReview = false;
    return next;
  }
  if (parsed.intent === 'decline' && parsed.confidence >= 0.75) {
    next.status = 'declined';
    next.needsReview = false;
    return next;
  }
  if (parsed.intent === 'reschedule') {
    next.status = 'pending';
    next.rescheduleNote = parsed.suggestedTime || 'suggested another time';
    next.needsReview = parsed.confidence < 0.8;
    return next;
  }
  next.needsReview = true;
  next.status = next.status || 'pending';
  return next;
}

module.exports = {
  parseShowingReply,
  applyReplyToTarget,
};
