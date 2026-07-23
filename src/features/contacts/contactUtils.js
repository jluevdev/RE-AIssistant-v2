import { formatPhone, normalizePhoneKey } from '../messages/messageUtils';

export const CONTACT_TYPES = ['buyer', 'seller', 'listing_agent', 'other'];

export const TYPE_LABELS = {
  buyer: 'Buyer',
  seller: 'Seller',
  listing_agent: 'Listing agent',
  other: 'Other',
};

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function slugName(name) {
  return (
    String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'unknown'
  );
}

/** Dedupe key: normalized phone → email → name slug. */
export function contactKey(contact) {
  const phone = normalizePhoneKey(contact?.phone || '');
  if (phone) return `phone:${phone}`;
  const email = normalizeEmail(contact?.email);
  if (email) return `email:${email}`;
  return `name:${slugName(contact?.name)}`;
}

function timestampMs(ts) {
  if (!ts) return 0;
  return ts.toMillis ? ts.toMillis() : new Date(ts).getTime();
}

function maxTimestamp(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return timestampMs(a) >= timestampMs(b) ? a : b;
}

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

function addCandidate(map, raw) {
  const candidate = {
    name: String(raw.name || '').trim(),
    phone: normalizePhoneKey(raw.phone || ''),
    email: normalizeEmail(raw.email || ''),
    type: raw.type || 'other',
    source: raw.source || 'manual',
    lastContactedAt: raw.lastContactedAt || null,
  };

  if (!candidate.name && !candidate.phone && !candidate.email) return;

  if (!candidate.name) {
    candidate.name = candidate.phone
      ? formatPhone(candidate.phone)
      : candidate.email || 'Unknown contact';
  }

  const key = contactKey(candidate);
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { ...candidate });
    return;
  }

  if (isBlank(existing.name) && candidate.name) existing.name = candidate.name;
  if (isBlank(existing.phone) && candidate.phone) existing.phone = candidate.phone;
  if (isBlank(existing.email) && candidate.email) existing.email = candidate.email;
  if (isBlank(existing.type) && candidate.type) existing.type = candidate.type;
  if (isBlank(existing.source) && candidate.source) existing.source = candidate.source;
  existing.lastContactedAt = maxTimestamp(existing.lastContactedAt, candidate.lastContactedAt);
}

/**
 * Build contact candidates from activity sources (defensive field reads).
 */
export function deriveContactsFromSources({
  visitors = [],
  embeddedVisitors = [],
  offers = [],
  schedules = [],
  messages = [],
}) {
  const map = new Map();

  for (const visitor of [...visitors, ...embeddedVisitors]) {
    addCandidate(map, {
      name: visitor.name,
      phone: visitor.phone,
      email: visitor.email,
      type: 'buyer',
      source: 'open_house',
      lastContactedAt: visitor.checkInTime,
    });
  }

  for (const offer of offers) {
    const meta = offer.meta || {};
    addCandidate(map, {
      name: meta.buyerAgentName,
      phone: meta.buyerAgentPhone,
      email: meta.buyerAgentEmail,
      type: 'buyer',
      source: 'offer',
      lastContactedAt: offer.createdAt,
    });
  }

  for (const schedule of schedules) {
    for (const target of schedule.targets || []) {
      if (!target?.listingAgentPhone) continue;
      addCandidate(map, {
        name: target.address ? `Listing agent — ${target.address}` : '',
        phone: target.listingAgentPhone,
        email: '',
        type: 'listing_agent',
        source: 'buyer_tour',
        lastContactedAt: schedule.createdAt,
      });
    }
  }

  for (const message of messages) {
    const phone = normalizePhoneKey(message.contactPhone || '');
    if (!phone) continue;
    addCandidate(map, {
      name: '',
      phone,
      email: '',
      type: 'other',
      source: 'sms',
      lastContactedAt: message.createdAt,
    });
  }

  return Array.from(map.values());
}

/**
 * Plan creates/updates — enrich blanks only; never overwrite user-edited fields.
 */
export function mergeContacts(existingDocs, derived) {
  const existingByKey = new Map();
  for (const doc of existingDocs) {
    existingByKey.set(contactKey(doc), doc);
  }

  const toCreate = [];
  const toUpdate = [];

  for (const candidate of derived) {
    const key = contactKey(candidate);
    const existing = existingByKey.get(key);

    if (!existing) {
      toCreate.push({
        name: candidate.name,
        phone: candidate.phone || '',
        email: candidate.email || '',
        type: candidate.type || 'other',
        tags: [],
        notes: '',
        source: candidate.source || 'manual',
        lastContactedAt: candidate.lastContactedAt || null,
      });
      continue;
    }

    const patch = {};
    if (isBlank(existing.name) && candidate.name) patch.name = candidate.name;
    if (isBlank(existing.phone) && candidate.phone) patch.phone = candidate.phone;
    if (isBlank(existing.email) && candidate.email) patch.email = candidate.email;
    if (isBlank(existing.type) && candidate.type) patch.type = candidate.type;
    if (isBlank(existing.source) && candidate.source) patch.source = candidate.source;

    const mergedLast = maxTimestamp(existing.lastContactedAt, candidate.lastContactedAt);
    if (mergedLast && timestampMs(mergedLast) !== timestampMs(existing.lastContactedAt)) {
      patch.lastContactedAt = mergedLast;
    }

    if (Object.keys(patch).length > 0) {
      toUpdate.push({ id: existing.id, patch });
    }
  }

  return { toCreate, toUpdate };
}

export function sortContacts(contacts) {
  return contacts.slice().sort((a, b) => {
    const aMs = timestampMs(a.updatedAt) || timestampMs(a.createdAt);
    const bMs = timestampMs(b.updatedAt) || timestampMs(b.createdAt);
    return bMs - aMs;
  });
}

export function collectTags(contacts) {
  const tags = new Set();
  for (const contact of contacts) {
    for (const tag of contact.tags || []) {
      const trimmed = String(tag).trim();
      if (trimmed) tags.add(trimmed);
    }
  }
  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}

export function filterContacts(contacts, { search = '', type = 'all', tag = '' }) {
  const term = search.trim().toLowerCase();
  const tagFilter = tag.trim().toLowerCase();

  return contacts.filter((contact) => {
    if (type !== 'all' && contact.type !== type) return false;
    if (tagFilter && !(contact.tags || []).some((t) => String(t).toLowerCase() === tagFilter)) {
      return false;
    }
    if (!term) return true;

    const haystack = [
      contact.name,
      contact.email,
      contact.phone,
      formatPhone(contact.phone),
      ...(contact.tags || []),
      TYPE_LABELS[contact.type] || contact.type,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(term);
  });
}
