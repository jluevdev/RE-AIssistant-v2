import { normalizePhoneKey } from '../messages/messageUtils';

const INACTIVE_OFFER_STATUSES = new Set(['declined', 'withdrawn', 'expired', 'rejected', 'cancelled']);

export function timestampToDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (ts instanceof Date) return ts;
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function monthRange(referenceDate = new Date()) {
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export function isThisMonth(ts, referenceDate = new Date()) {
  const date = timestampToDate(ts);
  if (!date) return false;
  const { start, end } = monthRange(referenceDate);
  return date >= start && date <= end;
}

export function parseOfferPrice(raw) {
  if (raw == null || raw === '') return null;
  const cleaned = String(raw).replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function formatCurrency(amount) {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPercent(rate) {
  if (rate == null || !Number.isFinite(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}

function isActiveOffer(offer) {
  const status = String(offer?.status || 'received').toLowerCase();
  return !INACTIVE_OFFER_STATUSES.has(status);
}

function openHouseInMonth(openHouse, referenceDate) {
  const candidates = [openHouse?.date, openHouse?.createdAt, openHouse?.updatedAt];
  return candidates.some((ts) => isThisMonth(ts, referenceDate));
}

function computeResponseRate(messages, referenceDate) {
  const monthMessages = (messages || []).filter((m) => isThisMonth(m.createdAt, referenceDate));
  const outboundPhones = new Set();
  const inboundPhones = new Set();

  for (const message of monthMessages) {
    const phone = normalizePhoneKey(message.contactPhone || '');
    if (!phone) continue;
    if (message.direction === 'outbound') outboundPhones.add(phone);
    if (message.direction === 'inbound') inboundPhones.add(phone);
  }

  if (outboundPhones.size === 0) return null;

  let replied = 0;
  for (const phone of outboundPhones) {
    if (inboundPhones.has(phone)) replied += 1;
  }

  return replied / outboundPhones.size;
}

/**
 * Aggregate dashboard metrics from raw Firestore arrays (defensive reads).
 */
export function computeDashboardMetrics(
  { visitors = [], offers = [], schedules = [], messages = [], contacts = [], openHouses = [] },
  referenceDate = new Date()
) {
  const visitorsThisMonth = visitors.filter((v) => isThisMonth(v.checkInTime, referenceDate)).length;
  const visitorsAllTime = visitors.length;

  const activeOfferRows = offers.filter(isActiveOffer);
  const activeOffers = activeOfferRows.length;
  const offerPipelineUsd = activeOfferRows.reduce((sum, offer) => {
    const price = parseOfferPrice(offer?.meta?.price);
    return price != null ? sum + price : sum;
  }, 0);

  const toursThisMonth = schedules.filter((s) => isThisMonth(s.createdAt, referenceDate)).length;
  const confirmedTargets = schedules.reduce((sum, schedule) => {
    const confirmed = (schedule.targets || []).filter((t) => t?.status === 'confirmed').length;
    return sum + confirmed;
  }, 0);

  const responseRate = computeResponseRate(messages, referenceDate);

  const openHousesThisMonth = openHouses.filter((oh) => openHouseInMonth(oh, referenceDate)).length;

  const contactsThisMonth = contacts.filter((c) => isThisMonth(c.createdAt, referenceDate)).length;

  return {
    visitorsThisMonth,
    visitorsAllTime,
    activeOffers,
    offerPipelineUsd,
    toursThisMonth,
    confirmedTargets,
    responseRate,
    openHousesThisMonth,
    contactsThisMonth,
  };
}
