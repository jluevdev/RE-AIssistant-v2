/** Quick-reply templates — edit in code to customize. */
export const QUICK_REPLY_TEMPLATES = [
  'On my way',
  'Can we reschedule?',
  'Thanks, confirmed!',
  'Got it — will follow up shortly.',
];

export function formatPhone(raw) {
  if (!raw) return 'Unknown';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

/** Canonical E.164-ish key for grouping threads (+1XXXXXXXXXX). */
export function normalizePhoneKey(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return String(raw);
  const withCountry =
    digits.length === 11 && digits.startsWith('1')
      ? digits
      : `1${digits.padStart(10, '0').slice(-10)}`;
  return `+${withCountry}`;
}

export function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export function formatMessageTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function messageTimestampMs(message) {
  const ts = message?.createdAt;
  if (!ts) return 0;
  return ts.toMillis ? ts.toMillis() : new Date(ts).getTime();
}

/** Group flat message docs into thread summaries keyed by normalized contactPhone. */
export function buildThreads(messages) {
  const byContact = new Map();

  for (const message of messages) {
    const phone = normalizePhoneKey(message.contactPhone);
    if (!phone) continue;

    const existing = byContact.get(phone);
    const unreadInc =
      message.direction === 'inbound' && message.read === false ? 1 : 0;

    if (!existing) {
      byContact.set(phone, {
        contactPhone: phone,
        lastMessage: message,
        unreadCount: unreadInc,
        messages: [message],
        offerId: message.offerId || null,
        listingId: message.listingId || null,
        scheduleId: message.scheduleId || null,
      });
      continue;
    }

    existing.messages.push(message);
    existing.unreadCount += unreadInc;
    if (messageTimestampMs(message) > messageTimestampMs(existing.lastMessage)) {
      existing.lastMessage = message;
      if (message.offerId) existing.offerId = message.offerId;
      if (message.listingId) existing.listingId = message.listingId;
      if (message.scheduleId) existing.scheduleId = message.scheduleId;
    }
  }

  return Array.from(byContact.values()).sort(
    (a, b) => messageTimestampMs(b.lastMessage) - messageTimestampMs(a.lastMessage)
  );
}

export function getThreadMessages(messages, contactPhone) {
  const key = normalizePhoneKey(contactPhone);
  return messages
    .filter((m) => normalizePhoneKey(m.contactPhone) === key)
    .sort((a, b) => messageTimestampMs(a) - messageTimestampMs(b));
}

export function countUnreadInbound(messages) {
  return messages.filter((m) => m.direction === 'inbound' && m.read === false).length;
}
