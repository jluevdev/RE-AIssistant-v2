const { reviewOutbound } = require('./policy');
const { counterpartyRequest, listingDecisionRequest, confirmBack, emailFallback } = require('./copy');
const { parseShowingReply, applyReplyToTarget } = require('./parseReply');
const { assertAccessReleaseAllowed } = require('./verification');

function windowLabel(window) {
  if (!window) return 'at the requested time';
  if (typeof window === 'string') return window;
  const date = window.date || '';
  const start = window.start || '';
  const end = window.end || '';
  return [date, start && end ? `${start}–${end}` : start].filter(Boolean).join(' ') || 'at the requested time';
}

function proposeBuyerRequest(input, now = new Date()) {
  const address = String(input.address || '').trim();
  const phone = String(input.phone || '').trim();
  const email = String(input.email || '').trim();
  const when = windowLabel(input.window);
  if (!address) {
    return { blocked: true, reasons: ['An address is required.'], actions: [] };
  }
  const body = counterpartyRequest({
    agentName: input.agentName,
    dre: input.dre,
    contactName: input.contactName,
    address,
    windowLabel: when,
  });
  const channel = phone ? 'sms' : (email ? 'email' : null);
  if (!channel) {
    return {
      blocked: true,
      reasons: ['No mobile number and no email. Ask the agent to call.'],
      actions: [],
    };
  }
  const review = reviewOutbound(body, { quietAt: now, replyingToInbound: false });
  const mail = channel === 'email' ? emailFallback({
    agentName: input.agentName,
    dre: input.dre,
    address,
    windowLabel: when,
    body,
  }) : null;
  return {
    blocked: review.blocked,
    reasons: review.reasons,
    sendAfter: review.sendAfter,
    actions: review.blocked ? [] : [{
      type: channel === 'sms' ? 'send_sms' : 'send_email',
      side: 'buyer',
      threadRole: 'counterparty',
      toPhone: phone || null,
      toEmail: email || null,
      body,
      subject: mail?.subject || null,
      scheduleId: input.scheduleId || null,
      targetId: input.targetId || null,
      address,
      windowLabel: when,
      sendAfter: review.sendAfter,
      disclosure: true,
    }],
  };
}

function proposeListingDecision(input, now = new Date()) {
  const body = listingDecisionRequest({
    agentName: input.agentName,
    address: input.address,
    windowLabel: windowLabel(input.window),
    requesterName: input.requesterName,
  });
  const review = reviewOutbound(body, { quietAt: now });
  return {
    blocked: review.blocked,
    reasons: review.reasons,
    sendAfter: review.sendAfter,
    actions: review.blocked ? [] : [{
      type: 'listing_decision',
      side: 'listing',
      threadRole: 'listing_control',
      toPhone: input.agentPhone || null,
      body,
      address: input.address,
      requesterPhone: input.requesterPhone || null,
      requesterName: input.requesterName || null,
      sendAfter: review.sendAfter,
    }],
  };
}

function outcomeFromReply(target, text) {
  const parsed = parseShowingReply(text);
  const next = applyReplyToTarget(target, parsed);
  const followUps = [];
  if (parsed.intent === 'unclear' || parsed.confidence < 0.75) {
    followUps.push({
      type: 'escalate',
      reason: 'Low-confidence reply. A person should read it.',
      preview: String(text || '').slice(0, 240),
    });
  }
  if (next.status === 'confirmed' && parsed.confidence >= 0.8) {
    followUps.push({
      type: 'confirm_back',
      body: confirmBack({
        agentName: target.agentName,
        dre: target.dre,
        contactName: target.contactName,
        address: target.address,
        windowLabel: target.windowLabel || 'the confirmed time',
      }),
    });
  }
  return { parsed, target: next, followUps };
}

function releaseAccess() {
  return assertAccessReleaseAllowed();
}

function routeChannel({ listingAgentIsUser, phone, email }) {
  if (listingAgentIsUser) return 'in_app';
  if (phone) return 'sms';
  if (email) return 'email';
  return 'human';
}

module.exports = {
  proposeBuyerRequest,
  proposeListingDecision,
  outcomeFromReply,
  releaseAccess,
  routeChannel,
  windowLabel,
};
