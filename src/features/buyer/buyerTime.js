export function formatTime12(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw || raw.toUpperCase() === 'TBD') return raw || 'TBD';
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  const minutes = match[2];
  let hours = Number(match[1]);
  if (Number.isNaN(hours)) return raw;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${suffix}`;
}

export function formatDateLabel(dateStr, locale = 'en-US') {
  if (!dateStr) return '';
  const [year, month, day] = String(dateStr).split('-').map(Number);
  if (!year || !month || !day) return dateStr;
  return new Date(year, month - 1, day).toLocaleDateString(locale, {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatAvailabilityLabel(availability, locale = 'en-US') {
  if (!availability?.date) return null;
  const dateLabel = formatDateLabel(availability.date, locale);
  const start = formatTime12(availability.start) || 'TBD';
  const end = formatTime12(availability.end) || 'TBD';
  return `${dateLabel} · ${start} – ${end}`;
}
