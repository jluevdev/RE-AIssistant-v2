const DEADLINE_FIELDS = [
  { key: 'inspection', label: 'Inspection' },
  { key: 'appraisal', label: 'Appraisal' },
  { key: 'loan', label: 'Loan' },
  { key: 'contingencyRemoval', label: 'Contingency removal' },
  { key: 'close', label: 'Close' },
];

const CHECKLIST_FIELDS = [
  { key: 'preApproval', label: 'Pre-approval' },
  { key: 'proofOfFunds', label: 'Proof of funds' },
  { key: 'signedPacket', label: 'Signed packet' },
  { key: 'inspectionBooked', label: 'Inspection booked' },
  { key: 'appraisalOrdered', label: 'Appraisal ordered' },
];

function localDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDay(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function addDays(day, count) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + count);
  return localDay(date);
}

function weekdayLabel(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long' });
}

function buildTodayItems(records, now = new Date()) {
  const today = localDay(now);
  const soon = addDays(today, 2);
  const items = [];
  const tours = records.tours || records.schedules || [];

  (records.openHouses || []).forEach((house) => {
    if (parseDay(house.date) !== today) return;
    items.push({
      kind: 'open_house',
      id: house.id,
      title: house.title || 'Open house',
      detail: house.address || house.date || '',
      to: '/open-houses',
    });
  });

  tours.forEach((tour) => {
    const date = parseDay(tour.availability?.date || tour.date);
    if (date !== today) return;
    const stops = (tour.targets || []).map((target) => target.address).filter(Boolean).slice(0, 2);
    items.push({
      kind: 'tour',
      id: tour.id,
      scheduleId: tour.id,
      title: 'Tour',
      detail: stops.join(', ') || date,
      to: '/buyer/schedule',
    });
  });

  (records.messages || [])
    .filter((message) => message.direction === 'inbound' && message.read !== true)
    .slice(0, 5)
    .forEach((message) => {
      items.push({
        kind: 'message',
        id: message.id,
        title: 'Unanswered text',
        detail: String(message.body || message.contactPhone || '').slice(0, 80),
        to: '/messages',
      });
    });

  (records.offers || []).forEach((offer) => {
    const address = offer.address || offer.meta?.address || offer.hubSlug || 'Offer';
    const deadlines = offer.file?.deadlines || {};
    DEADLINE_FIELDS.forEach((field) => {
      const date = parseDay(deadlines[field.key]);
      if (!date || date < today || date > soon) return;
      items.push({
        kind: 'deadline',
        id: `${offer.id}-${field.key}`,
        offerId: offer.id,
        deadlineKey: field.key,
        title: field.label,
        detail: `${address} · ${weekdayLabel(date)}`,
        to: `/offers/${offer.id}`,
      });
    });
    if (!offer.file) return;
    const checks = offer.file.checklist || {};
    CHECKLIST_FIELDS.forEach((field) => {
      if (checks[field.key]) return;
      items.push({
        kind: 'checklist',
        id: `${offer.id}-${field.key}`,
        offerId: offer.id,
        title: `Missing ${field.label.toLowerCase()}`,
        detail: address,
        to: `/offers/${offer.id}`,
      });
    });
  });

  return { today, items };
}

module.exports = {
  DEADLINE_FIELDS,
  CHECKLIST_FIELDS,
  localDay,
  parseDay,
  addDays,
  weekdayLabel,
  buildTodayItems,
};
