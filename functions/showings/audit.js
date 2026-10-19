const crypto = require('crypto');

function nextAudit(prevHash, event) {
  const body = {
    type: event.type,
    ownerUid: event.ownerUid || null,
    showingId: event.showingId || null,
    summary: event.summary || '',
    at: event.at || new Date().toISOString(),
    prevHash: prevHash || 'genesis',
  };
  const hash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  return { ...body, hash };
}

module.exports = { nextAudit };
