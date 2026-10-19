const { sha256 } = require('./sha256');

function nextAudit(prevHash, event) {
  const body = {
    type: event.type,
    ownerUid: event.ownerUid || null,
    showingId: event.showingId || null,
    summary: event.summary || '',
    at: event.at || new Date().toISOString(),
    prevHash: prevHash || 'genesis',
  };
  const hash = sha256(JSON.stringify(body));
  return { ...body, hash };
}

module.exports = { nextAudit };
