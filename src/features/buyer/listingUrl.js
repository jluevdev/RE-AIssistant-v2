const ALLOWED_HOSTS = ['zillow.com', 'redfin.com', 'realtor.com'];

function parseAllowedListingUrl(urlString) {
  try {
    const url = new URL(String(urlString || '').trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const allowed = ALLOWED_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
    if (!allowed) return null;
    return url;
  } catch {
    return null;
  }
}

function canonicalizeListingUrl(urlString) {
  const parsed = parseAllowedListingUrl(urlString);
  if (!parsed) return '';
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/, '/') || '/';
  return parsed.href;
}

function titleCaseSlug(value) {
  const streetSuffix = new Set(['st', 'ct', 'ln', 'dr', 'pl', 'rd', 'ave', 'blvd', 'way', 'cir']);
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (/^\d/.test(word)) return word;
      const lower = word.toLowerCase();
      if (streetSuffix.has(lower)) return word.charAt(0).toUpperCase() + lower.slice(1);
      if (word.length <= 2 && /^[a-z]+$/i.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function formatSlugAddress(slug) {
  const parts = decodeURIComponent(String(slug || ''))
    .replace(/_/g, '-')
    .split('-')
    .map((part) => part.trim())
    .filter(Boolean);
  const zipIdx = [...parts].reverse().findIndex((part) => /^\d{5}(?:\d{4})?$/.test(part));
  const zipAt = zipIdx === -1 ? -1 : parts.length - 1 - zipIdx;
  const stateAt = zipAt > 0 && /^[A-Za-z]{2}$/.test(parts[zipAt - 1]) ? zipAt - 1 : -1;
  if (stateAt < 1) return titleCaseSlug(parts.join(' '));
  const zip = parts[zipAt].slice(0, 5);
  const state = parts[stateAt].toUpperCase();
  const before = parts.slice(0, stateAt);
  const city = titleCaseSlug(before[before.length - 1] || '');
  const street = titleCaseSlug(before.slice(0, -1).join(' '));
  if (!street || !city) return titleCaseSlug(parts.join(' '));
  return `${street}, ${city}, ${state} ${zip}`;
}

export function addressFromListingUrl(urlString) {
  try {
    const url = new URL(canonicalizeListingUrl(urlString) || urlString);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host.endsWith('zillow.com')) {
      const match = url.pathname.match(/\/homedetails\/([^/]+)/i);
      return match ? formatSlugAddress(match[1]) : '';
    }
    if (host.endsWith('redfin.com')) {
      const match = url.pathname.match(/\/([^/]+)\/home\/\d+/i);
      return match ? formatSlugAddress(match[1].replace(/^\d+-?/, '')) : '';
    }
    if (host.endsWith('realtor.com')) {
      const match = url.pathname.match(/realestateandhomes-detail\/([^/]+)/i);
      return match ? formatSlugAddress(match[1]) : '';
    }
  } catch {
    return '';
  }
  return '';
}

export function listingPreviewsFromPaste(text) {
  const matches = String(text || '').match(/https?:\/\/[^\s<>"'\]\)]+/gi) || [];
  const seen = new Set();
  const previews = [];
  for (const raw of matches) {
    const sourceUrl = canonicalizeListingUrl(raw.replace(/[.,;]+$/, ''));
    if (!sourceUrl || seen.has(sourceUrl)) continue;
    seen.add(sourceUrl);
    previews.push({
      id: `preview-${sourceUrl}`,
      address: addressFromListingUrl(sourceUrl) || 'Listing from link',
      sourceUrl,
      photoUrl: '',
      status: 'pending',
      clientInterest: 'interested',
      clientNote: '',
      clientRank: null,
    });
  }
  return previews;
}
