function firstName(name) {
  const part = String(name || '').trim().split(/\s+/)[0];
  return part || '';
}

function disclosure({ agentName, dre }) {
  const license = dre ? ` (DRE #${dre})` : '';
  return `this is the AI assistant for ${agentName || 'your agent'}${license}`;
}

function counterpartyRequest({
  agentName,
  dre,
  contactName,
  address,
  windowLabel,
}) {
  const greeting = firstName(contactName) ? `Hi ${firstName(contactName)}, ` : 'Hi, ';
  return (
    `${greeting}${disclosure({ agentName, dre })}. `
    + `Could ${agentName || 'they'} show ${address} ${windowLabel}? `
    + 'Reply YES or suggest a time. Reply STOP to opt out.'
  );
}

function listingDecisionRequest({
  agentName,
  address,
  windowLabel,
  requesterName,
}) {
  return (
    `Hi ${firstName(agentName) || 'there'}, this is your AI assistant. `
    + `Showing request for ${address} ${windowLabel}`
    + `${requesterName ? ` from ${requesterName}` : ''}. `
    + 'Reply 1 to approve, 2 to suggest a time, 3 to decline. Reply STOP to opt out.'
  );
}

function confirmBack({
  agentName,
  dre,
  contactName,
  address,
  windowLabel,
}) {
  const greeting = firstName(contactName) ? `Hi ${firstName(contactName)}, ` : 'Hi, ';
  return (
    `${greeting}${disclosure({ agentName, dre })}. `
    + `${address} is confirmed for ${windowLabel}. `
    + 'Reply if you need a different time. Reply STOP to opt out.'
  );
}

function emailFallback({ agentName, dre, address, windowLabel, body }) {
  const text = body || counterpartyRequest({ agentName, dre, address, windowLabel });
  return {
    subject: `Showing request for ${address}`,
    text: `${text}\n\nSent by ${agentName || 'the agent'}'s AI assistant via REAIssistant.`,
  };
}

module.exports = {
  counterpartyRequest,
  listingDecisionRequest,
  confirmBack,
  emailFallback,
  disclosure,
};
