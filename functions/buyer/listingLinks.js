const { randomUUID } = require('crypto');
const { normalizePhone } = require('../shared/twilio');
const { vertexGenerateContent, extractText } = require('../shared/gemini');

const MAX_URLS = 10;
const ALLOWED_HOSTS = ['zillow.com', 'redfin.com', 'realtor.com'];
const FETCH_TIMEOUT_MS = 12000;
const MAX_HTML_CHARS = 14000;

function getAdmin() {
  return require('../shared/admin').admin;
}

function getFrontendUrl() {
  return require('../shared/publicUrl').getPublicAppUrl();
}

function extractListingUrls(text) {
  const matches = String(text || '').match(/https?:\/\/[^\s<>"'\]\)]+/gi) || [];
  const seen = new Set();
  const urls = [];
  for (const raw of matches) {
    const cleaned = raw.replace(/[.,;]+$/, '');
    const parsed = parseAllowedListingUrl(cleaned);
    if (!parsed) continue;
    if (seen.has(parsed.href)) continue;
    seen.add(parsed.href);
    urls.push(parsed.href);
    if (urls.length >= MAX_URLS) break;
  }
  return urls;
}

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

function listingHost(urlString) {
  try {
    return new URL(String(urlString || '').trim()).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function zillowHtmlFetchBlocked(urlString) {
  const host = listingHost(urlString);
  return host === 'zillow.com' || host.endsWith('.zillow.com');
}

function googleTranslateListingUrl(urlString) {
  try {
    const url = new URL(canonicalizeListingUrl(urlString) || urlString);
    if (!url.hostname) return '';
    const translatedHost = `${url.hostname.replace(/\./g, '-')}.translate.goog`;
    const path = url.pathname || '/';
    return `https://${translatedHost}${path}?_x_tr_sl=auto&_x_tr_tl=en`;
  } catch {
    return '';
  }
}

function unwrapTranslateAssetUrl(value) {
  const raw = String(value || '').trim();
  const wrapped = raw.match(/^https:\/\/photos-zillowstatic-com\.translate\.goog(\/fp\/[^\s"'<>]+)/i);
  if (!wrapped) return raw;
  const path = wrapped[1].replace(/[?&]_x_tr_[^=&]+(=[^&]*)?/g, '').replace(/\?&/, '?').replace(/\?$/, '');
  return `https://photos.zillowstatic.com${path}`;
}

function canonicalizeListingUrl(urlString) {
  const parsed = parseAllowedListingUrl(urlString);
  if (!parsed) return String(urlString || '').trim();
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

function zpidFromListingUrl(urlString) {
  const match = String(urlString || '').match(/(\d+)_zpid/i);
  return match ? match[1] : '';
}

function usPhoneDigits(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length === 10) return digits;
  return '';
}

function phoneAppearsInText(phone, text) {
  const digits = usPhoneDigits(phone);
  if (!digits || !text) return false;
  return String(text).replace(/\D/g, '').includes(digits);
}

function snippetAroundPhone(phone, evidence) {
  const digits = usPhoneDigits(phone);
  const text = String(evidence || '');
  if (!digits || !text) return '';
  const last4 = digits.slice(-4);
  let from = 0;
  let collected = '';
  while (from < text.length) {
    const idx = text.indexOf(last4, from);
    if (idx < 0) break;
    const snippet = text.slice(Math.max(0, idx - 240), Math.min(text.length, idx + 80));
    if (snippet.replace(/\D/g, '').includes(digits)) {
      collected += ` ${snippet}`;
    }
    from = idx + last4.length;
  }
  return collected.trim() || text.slice(0, 500);
}

function compactAlnum(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function appearsInEvidence(value, evidence) {
  const needle = String(value || '').trim().toLowerCase();
  if (needle.length < 3 || !evidence) return false;
  return String(evidence).toLowerCase().includes(needle);
}

function normalizeMls(value, evidence) {
  const match = String(value || '').toUpperCase().match(/\b([A-Z]{2,4}\d{5,10})\b/);
  if (!match) return '';
  const mls = match[1];
  const haystack = compactAlnum(evidence);
  return haystack.includes(mls) ? mls : '';
}

function normalizeDre(value, evidence) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 10) return '';
  return String(evidence || '').replace(/\D/g, '').includes(digits) ? digits : '';
}

function normalizeEmail(value, evidence) {
  const match = String(value || '').trim().toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  if (!match) return '';
  return appearsInEvidence(match[0], evidence) ? match[0] : '';
}

function keepIfInEvidence(value, evidence) {
  const trimmed = String(value || '').trim();
  return appearsInEvidence(trimmed, evidence) ? trimmed : '';
}

function normalizeTourKind(value) {
  return value === 'rental' ? 'rental' : 'sale';
}

function normalizeListingKind(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'rental' || key === 'rent' || key === 'lease' || key === 'for_rent' || key === 'for-rent') {
    return 'rental';
  }
  if (key === 'sale' || key === 'sell' || key === 'for_sale' || key === 'for-sale') return 'sale';
  return '';
}

function normalizeContactRole(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (key === 'owner' || key === 'property_owner' || key === 'landlord' || key === 'fsbo') return 'owner';
  if (key === 'property_manager' || key === 'pm' || key === 'manager') return 'property_manager';
  if (key === 'listing_agent' || key === 'agent' || key === 'realtor') return 'listing_agent';
  return '';
}

function looksLikeRentalEvidence(evidence) {
  return /\b(for rent|for-rent|rental listing|listed by (the )?property owner|property owner|property manager|landlord|owner listed|available for rent)\b/i.test(evidence);
}

function looksLikeSaleAgentEvidence(evidence) {
  return /\b(for sale|listed for sale|sold on|listing agent|buyer'?s agent|mls\s*#|crmls|courtesy of)\b/i.test(evidence);
}

function inferContactRole(explicit, evidence) {
  const fromField = normalizeContactRole(explicit);
  if (fromField) return fromField;
  if (/\b(property manager|property management|managed by)\b/i.test(evidence)) return 'property_manager';
  if (/\b(listed by (the )?property owner|property owner|owner listed|landlord)\b/i.test(evidence)) return 'owner';
  if (/\blisting agent\b/i.test(evidence)) return 'listing_agent';
  return '';
}

function addressFromListingUrl(urlString) {
  try {
    const url = new URL(canonicalizeListingUrl(urlString));
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

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unescapeListingHtml(html) {
  return String(html || '')
    .replace(/\\u002[fF]/g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&');
}

function normalizePhotoUrl(value) {
  try {
    const url = new URL(unwrapTranslateAssetUrl(unescapeListingHtml(String(value || '').trim())));
    if (url.protocol !== 'https:') return '';
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const path = `${url.pathname}${url.search}`.toLowerCase();
    const allowedHost = [
      'photos.zillowstatic.com',
      'zillowstatic.com',
      'ssl.cdn-redfin.com',
      'cdn-redfin.com',
      'ap.rdcpix.com',
      'ar.rdcpix.com',
      'photos.realtordotcom.com',
      'gstatic.com',
      'googleusercontent.com',
      'googleapis.com',
    ].some((domain) => host === domain || host.endsWith(`.${domain}`));
    const looksImage = /\.(jpe?g|png|webp|gif)(\?|$)/i.test(path) || /\/images\?/i.test(path);
    if (!allowedHost && !looksImage) return '';
    if (url.href.length > 2000) return '';
    return url.href;
  } catch {
    return '';
  }
}

function listingPhotoScore(url) {
  const value = String(url || '').toLowerCase();
  let score = 0;
  if (/photos\.zillowstatic\.com\/fp\/[a-f0-9]{16,}/.test(value)) score += 80;
  if (/ssl\.cdn-redfin\.com|ap\.rdcpix\.com|ar\.rdcpix\.com|photos\.realtordotcom\.com/.test(value)) score += 50;
  if (/\/fp\//.test(value)) score += 20;
  if (/cc_ft_(768|960|1152|1536)/.test(value)) score += 20;
  if (/\.jpe?g(\?|$)/.test(value)) score += 12;
  if (/\.webp(\?|$)/.test(value)) score += 4;
  if (/cc_ft_(192|384)/.test(value)) score -= 20;
  if (/static-maps|streetview|logo|sprite|favicon/.test(value)) score -= 80;
  return score;
}

function pickBestListingPhoto(urls) {
  const unique = [];
  for (const raw of urls || []) {
    const url = normalizePhotoUrl(String(raw || '').replace(/[.,;]+$/, ''));
    if (!url || unique.includes(url)) continue;
    unique.push(url);
  }
  unique.sort((a, b) => listingPhotoScore(b) - listingPhotoScore(a));
  return unique[0] || '';
}

function walkStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => walkStrings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => walkStrings(item, out));
  return out;
}

function retrievalMetadata(payload) {
  const candidate = payload?.candidates?.[0] || {};
  return {
    grounding: candidate.groundingMetadata || candidate.grounding_metadata || {},
    urlContext: candidate.urlContextMetadata || candidate.url_context_metadata || payload?.urlContextMetadata || {},
  };
}

function extractPhotoUrlsFromGrounding(payload) {
  const strings = walkStrings(retrievalMetadata(payload)).map((text) => unescapeListingHtml(text));
  const found = [];
  const re = /https:\/\/(?:encrypted-tbn\d\.gstatic\.com\/images\?[^"'\s<>\\]+|photos\.zillowstatic\.com\/[^"'\s<>\\]+|ssl\.cdn-redfin\.com\/[^"'\s<>\\]+|ap\.rdcpix\.com\/[^"'\s<>\\]+|lh3\.googleusercontent\.com\/[^"'\s<>\\]+)/gi;
  for (const text of strings) {
    const matches = String(text || '').match(re) || [];
    for (const raw of matches) {
      const url = normalizePhotoUrl(raw);
      if (url && !found.includes(url)) found.push(url);
    }
  }
  return found.sort((a, b) => listingPhotoScore(b) - listingPhotoScore(a));
}

async function verifyPhotoUrl(value) {
  const url = normalizePhotoUrl(value);
  if (!url) return '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const head = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    });
    const type = String(head.headers.get('content-type') || '');
    if (head.ok && (!type || /^image\//i.test(type))) return url;
    if (head.status === 405 || head.status === 403 || head.status === 501) {
      const getRes = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-64' },
        redirect: 'follow',
        signal: controller.signal,
      });
      const getType = String(getRes.headers.get('content-type') || '');
      if (getRes.ok && (!getType || /^image\//i.test(getType))) return url;
    }
    return '';
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function photoAppearsInEvidence(value, evidence) {
  const url = normalizePhotoUrl(value);
  if (!url || !evidence) return '';
  const haystack = String(evidence).toLowerCase();
  if (haystack.includes(url.toLowerCase())) return url;
  try {
    const path = new URL(url).pathname;
    if (path.length >= 12 && haystack.includes(path.toLowerCase())) return url;
  } catch {
    return '';
  }
  return '';
}

function extractListingPhotoFromHtml(html) {
  const raw = String(html || '');
  const unescaped = unescapeListingHtml(raw);
  const meta = raw.match(/property=["']og:image(?::url)?["'][^>]*content=["']([^"']+)["']/i)
    || raw.match(/content=["']([^"']+)["'][^>]*property=["']og:image(?::url)?["']/i)
    || raw.match(/name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i)
    || raw.match(/content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i)
    || unescaped.match(/property=["']og:image(?::url)?["'][^>]*content=["']([^"']+)["']/i);
  const fromMeta = normalizePhotoUrl(meta?.[1]);
  if (fromMeta && listingPhotoScore(fromMeta) >= 50) return fromMeta;

  const cdnRe = /https:\/\/(?:photos\.zillowstatic\.com|ssl\.cdn-redfin\.com|ap\.rdcpix\.com|ar\.rdcpix\.com|photos\.realtordotcom\.com)\/[^\s"'<>\\]+/gi;
  const found = unescaped.match(cdnRe) || [];
  return pickBestListingPhoto([fromMeta, ...found]);
}

function extractPageSignals(html) {
  const chunks = [];
  const ldMatches = String(html || '').matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of ldMatches) {
    chunks.push(String(match[1] || '').slice(0, 4000));
  }
  const nextData = String(html || '').match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextData) chunks.push(nextData[1].slice(0, 6000));
  const ogTitle = String(html || '').match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
    || String(html || '').match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (ogTitle) chunks.push(ogTitle[1]);
  const photoUrl = extractListingPhotoFromHtml(html);
  if (photoUrl) chunks.push(photoUrl);
  chunks.push(stripHtml(html).slice(0, 8000));
  return chunks.filter(Boolean).join('\n').slice(0, MAX_HTML_CHARS);
}

function parseJsonObject(text) {
  const trimmed = String(text || '').trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

async function fetchListingText(url, options = {}) {
  if (zillowHtmlFetchBlocked(url)) {
    const proxyUrl = googleTranslateListingUrl(url);
    if (proxyUrl) {
      const proxied = await fetchListingText(proxyUrl, {
        ...options,
        timeoutMs: Math.max(Number(options.timeoutMs) || 0, 10000),
      });
      if (proxied.photoUrl || proxied.text) return proxied;
    }
    return { text: '', status: 403, blocked: true, photoUrl: '' };
  }
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const html = await res.text();
    const photoUrl = extractListingPhotoFromHtml(html);
    const blocked = !res.ok || res.status === 403 || res.status === 429;
    return {
      text: res.ok ? extractPageSignals(html) : '',
      status: res.status,
      blocked,
      photoUrl,
    };
  } catch (error) {
    return { text: '', status: 0, blocked: true, error: error.message, photoUrl: '' };
  } finally {
    clearTimeout(timer);
  }
}

async function extractListingWithGemini(url, pageText) {
  const prompt = `Extract listing details from this real estate listing URL.
Return JSON only with this shape:
{"address":"","mlsNumber":"","listingKind":"sale","contactRole":"listing_agent","listingAgent":{"name":"","phone":"","email":"","brokerage":"","dreNumber":""},"photoUrl":"","price":"","confidence":"high"}

Rules:
- Use empty strings for unknown fields.
- Never invent a phone number, MLS number, or street address.
- Phone should be a US number when present.
- listingKind is "sale" or "rental".
- contactRole is "listing_agent", "owner", or "property_manager".
- If the listing is listed by the property owner (FSBO / owner-listed rental), contactRole is "owner" and listingAgent fields are the owner's name and phone — not a real-estate agent.
- If a property manager is the contact, contactRole is "property_manager".
- photoUrl is a direct https image URL of the property when present in the page (og:image or listing photo CDN). Empty if unknown. Never invent a URL.
- confidence is high, medium, or low.

URL: ${url}

If page text is missing, still extract a street address when the URL slug clearly contains one (Zillow /homedetails/123-Main-St-City-ST-12345). Never invent a phone number or MLS#.

Page text (may be empty if the site blocked scraping):
${pageText || '(no page text)'}`;

  const payload = await vertexGenerateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
    },
  });

  return parseJsonObject(extractText(payload)) || {};
}

function searchRan(response) {
  const candidate = response?.candidates?.[0] || {};
  const meta = candidate.groundingMetadata || candidate.grounding_metadata;
  if (!meta) return false;
  return Boolean(
    (Array.isArray(meta.webSearchQueries) && meta.webSearchQueries.length)
    || (Array.isArray(meta.web_search_queries) && meta.web_search_queries.length)
    || (Array.isArray(meta.groundingChunks) && meta.groundingChunks.length)
    || (Array.isArray(meta.grounding_chunks) && meta.grounding_chunks.length)
    || meta.searchEntryPoint
    || meta.search_entry_point
  );
}

function groundingEvidence(response) {
  try {
    return JSON.stringify(response?.candidates?.[0] || {});
  } catch {
    return '';
  }
}

async function findListingContactViaWebSearch({ url, address, tourKind }) {
  const queryAddress = String(address || '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  if (!queryAddress) return null;

  const isRental = normalizeTourKind(tourKind) === 'rental';
  const zpid = zpidFromListingUrl(url);
  const searchHint = isRental
    ? `"${queryAddress}" for rent "listed by" "property owner" OR "property manager" phone${zpid ? ` Zillow zpid ${zpid}` : ''}`
    : `"${queryAddress}" listing agent phone email DRE MLS CRMLS${zpid ? ` Zillow zpid ${zpid}` : ''}`;

  const prompt = isRental
    ? `Use Google Search to find who to contact for the CURRENT FOR-RENT listing at this US residential address (property owner or property manager). Do not invent values.
Search for: ${searchHint}

Return JSON only with this shape:
{"phone":"","name":"","email":"","brokerage":"","contactRole":"owner","photoUrl":"","source":""}

Rules:
- This is a rental. Do NOT return a for-sale listing agent, MLS/CRMLS agent, or a phone from a sold or for-sale page at the same address.
- Prefer "listed by property owner" or a property manager for the current rental.
- Fill a field only when that exact value appears in search result text you actually saw.
- Empty string if unsure. Never invent a phone or email.
- photoUrl is a direct https listing photo if you saw one (Zillow/Redfin/Realtor CDN). Empty if unsure.
- contactRole is owner or property_manager (empty if unsure).
- source should be the website name or URL where the details appeared.`
    : `Use Google Search to find listing-agent details for this US residential property from public indexed pages (broker sites, MLS, Realtor, Redfin). Do not invent values.
Search for: ${searchHint}

Return JSON only with this shape:
{"phone":"","name":"","email":"","brokerage":"","dreNumber":"","mlsNumber":"","contactRole":"listing_agent","photoUrl":"","source":""}

Rules:
- Fill a field only when that exact value appears in search result text you actually saw.
- Empty string if unsure. Never invent a phone, email, DRE, or MLS ID.
- Prefer the listing agent's direct phone over a brokerage main line when both appear.
- dreNumber is the state license (California DRE digits only).
- mlsNumber is the public MLS/CRMLS id such as HD26162900 or CV26141125.
- photoUrl is a direct https listing photo if you saw one (Zillow/Redfin/Realtor CDN). Empty if unsure.
- contactRole is listing_agent unless the listing is clearly owner-listed.
- source should be the website name or URL where the details appeared.`;

  const payload = await vertexGenerateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1024,
    },
  });

  const text = extractText(payload);
  if (!text) {
    console.warn('Listing web search empty text', {
      finishReason: payload?.candidates?.[0]?.finishReason || null,
      partTypes: (payload?.candidates?.[0]?.content?.parts || []).map((part) => Object.keys(part)),
    });
  }
  const parsed = parseJsonObject(text) || {};
  const evidence = `${groundingEvidence(payload)}\n${text}`;
  const phone = String(parsed.phone || '').trim();
  const digits = usPhoneDigits(phone);
  const inText = phoneAppearsInText(phone, evidence);
  const ran = searchRan(payload);
  let verifiedPhone = digits && inText ? phone : '';
  const contactRole = inferContactRole(parsed.contactRole, evidence);
  const saleOnly = isRental && looksLikeSaleAgentEvidence(evidence) && !looksLikeRentalEvidence(evidence);

  if (isRental && verifiedPhone) {
    const snippet = snippetAroundPhone(verifiedPhone, evidence);
    const ownerNear = looksLikeRentalEvidence(snippet) || /\b(property owner|landlord|property manager)\b/i.test(snippet);
    const agentNear = /\blisting agent\b/i.test(snippet);
    const trustedRole = contactRole === 'owner' || contactRole === 'property_manager';
    if (saleOnly || contactRole === 'listing_agent' || (agentNear && !ownerNear) || (!trustedRole && !ownerNear)) {
      console.warn('Rental web search rejected non-owner contact', {
        ran,
        contactRole,
        saleOnly,
        agentNear,
        ownerNear,
      });
      verifiedPhone = '';
    }
  }

  const hit = {
    phone: verifiedPhone,
    name: keepIfInEvidence(parsed.name, evidence),
    email: normalizeEmail(parsed.email, evidence),
    brokerage: keepIfInEvidence(parsed.brokerage, evidence),
    dreNumber: isRental ? '' : normalizeDre(parsed.dreNumber || parsed.dre, evidence),
    mlsNumber: isRental ? '' : normalizeMls(parsed.mlsNumber || parsed.mls, evidence),
    contactRole: isRental && contactRole === 'listing_agent' ? '' : contactRole,
    listingKind: isRental ? 'rental' : 'sale',
    photoUrl: await verifyPhotoUrl(
      extractPhotoUrlsFromGrounding(payload)[0]
      || photoAppearsInEvidence(parsed.photoUrl, walkStrings(retrievalMetadata(payload)).join('\n')),
    ),
    source: keepIfInEvidence(parsed.source, evidence),
  };

  if (isRental && !hit.phone && saleOnly) {
    hit.name = '';
    hit.email = '';
    hit.brokerage = '';
  }

  const hasAny = Boolean(hit.phone || hit.name || hit.email || hit.brokerage || hit.dreNumber || hit.mlsNumber || hit.photoUrl);
  if (!hasAny) {
    console.warn('Listing web search skip', {
      ran,
      hasPhone: Boolean(digits),
      inText,
      rental: isRental,
      finishReason: payload?.candidates?.[0]?.finishReason || null,
    });
    return null;
  }

  return hit;
}

function toTarget(url, parsed) {
  const address = String(parsed?.address || '').trim();
  const mlsNumber = String(parsed?.mlsNumber || '').trim();
  const listingAgentName = String(parsed?.listingAgent?.name || '').trim();
  const listingAgentPhone = String(parsed?.listingAgent?.phone || '').trim();
  const listingAgentEmail = String(parsed?.listingAgent?.email || '').trim();
  const brokerage = String(parsed?.listingAgent?.brokerage || parsed?.brokerage || '').trim();
  const dreNumber = String(parsed?.listingAgent?.dreNumber || parsed?.dreNumber || '').trim();
  const listingKind = normalizeListingKind(parsed?.listingKind) || '';
  const contactRole = normalizeContactRole(parsed?.contactRole) || '';
  const photoUrl = normalizePhotoUrl(parsed?.photoUrl);
  const price = String(parsed?.price || '').trim();
  const phoneSource = parsed?.phoneSource === 'web_search' ? 'web_search' : '';
  const hasCore = Boolean(address || listingAgentPhone);
  let parseStatus = 'failed';
  if (address && listingAgentPhone && phoneSource !== 'web_search') parseStatus = 'ok';
  else if (hasCore) parseStatus = 'partial';
  const noteParts = [];
  if (mlsNumber) noteParts.push(`MLS# ${mlsNumber}`);
  if (dreNumber) noteParts.push(`DRE# ${dreNumber}`);
  if (contactRole === 'owner') noteParts.push('Owner listed');
  if (contactRole === 'property_manager') noteParts.push('Property manager');

  return {
    id: randomUUID(),
    address,
    listingAgentPhone,
    listingAgentName,
    listingAgentEmail,
    brokerage,
    dreNumber,
    mlsNumber,
    listingKind,
    contactRole,
    photoUrl,
    sourceUrl: url,
    price,
    note: String(parsed?.note || '').trim() || noteParts.join(' · '),
    parseStatus,
    phoneSource,
    confidence: parsed?.confidence === 'high' || parsed?.confidence === 'medium' ? parsed.confidence : 'low',
    status: 'pending',
    confirmedAt: null,
    lastInboundPreview: null,
    clientNote: '',
    clientRank: null,
    clientInterest: 'interested',
  };
}

function applyTourKindToParsed(parsed, tourKind, pageText = '') {
  const next = parsed && typeof parsed === 'object' ? parsed : {};
  if (!next.listingAgent) next.listingAgent = {};
  const kind = normalizeTourKind(tourKind);
  const detectedKind = normalizeListingKind(next.listingKind);
  const evidence = `${pageText || ''} ${next.listingAgent?.name || ''} ${next.note || ''}`;
  if (!detectedKind && looksLikeRentalEvidence(evidence)) next.listingKind = 'rental';
  next.listingKind = kind === 'rental' ? 'rental' : (normalizeListingKind(next.listingKind) || detectedKind || 'sale');
  next.contactRole = inferContactRole(next.contactRole, evidence);

  if (kind === 'rental') {
    const role = next.contactRole;
    const trusted = role === 'owner' || role === 'property_manager';
    if (!trusted) {
      next.listingAgent.phone = '';
      next.phoneSource = '';
      if (role === 'listing_agent') {
        next.listingAgent.name = '';
        next.listingAgent.email = '';
        next.listingAgent.brokerage = '';
        next.listingAgent.dreNumber = '';
        next.mlsNumber = '';
        next.contactRole = '';
      }
    }
  }
  return next;
}

async function parsePropertyUrls(rawUrls, options = {}) {
  const tourKind = normalizeTourKind(options.tourKind);
  const quick = options.quick === true;
  const unique = [];
  const seen = new Set();
  for (const raw of rawUrls || []) {
    const allowed = parseAllowedListingUrl(raw);
    if (!allowed) continue;
    const cleanUrl = canonicalizeListingUrl(allowed.href);
    if (seen.has(cleanUrl)) continue;
    seen.add(cleanUrl);
    unique.push(cleanUrl);
    if (unique.length >= MAX_URLS) break;
  }

  const listings = [];
  for (const url of unique) {
    try {
      const fetched = await fetchListingText(url, { timeoutMs: quick ? 10000 : FETCH_TIMEOUT_MS });
      if (quick) {
        const parsed = {
          address: addressFromListingUrl(url),
          listingKind: tourKind,
          listingAgent: {},
          photoUrl: await verifyPhotoUrl(fetched.photoUrl),
        };
        const target = toTarget(url, parsed);
        listings.push({
          url,
          ok: Boolean(target.address),
          target,
          fetchStatus: fetched.status,
          blocked: fetched.blocked,
        });
        continue;
      }

      let parsed = {};
      try {
        parsed = await extractListingWithGemini(url, fetched.text);
      } catch (geminiError) {
        console.warn('Gemini listing parse failed:', geminiError.message);
      }
      if (!parsed.address) {
        parsed.address = addressFromListingUrl(url);
      }
      parsed = applyTourKindToParsed(parsed, tourKind, fetched.text);
      parsed.photoUrl = (await verifyPhotoUrl(fetched.photoUrl))
        || (await verifyPhotoUrl(parsed.photoUrl));
      if (!parsed.photoUrl) {
        try {
          parsed.photoUrl = await findListingPhotoFromListingPage({
            url,
            address: parsed.address,
          });
        } catch (photoError) {
          console.warn('Listing photo lookup failed:', photoError.message);
        }
      }
      const missingPhone = !String(parsed.listingAgent.phone || '').trim();
      const missingName = !String(parsed.listingAgent.name || '').trim();
      const missingMeta = tourKind === 'rental'
        ? missingName
        : (!String(parsed.mlsNumber || '').trim() || missingName);
      if (parsed.address && (missingPhone || missingMeta || fetched.blocked)) {
        try {
          const searchHit = await findListingContactViaWebSearch({
            url,
            address: parsed.address,
            tourKind,
          });
          if (searchHit) {
            if (searchHit.phone && missingPhone) {
              parsed.listingAgent.phone = searchHit.phone;
              parsed.phoneSource = 'web_search';
              parsed.confidence = parsed.confidence === 'high' ? 'medium' : (parsed.confidence || 'low');
            }
            if (!parsed.listingAgent.name && searchHit.name) parsed.listingAgent.name = searchHit.name;
            if (!parsed.listingAgent.email && searchHit.email) parsed.listingAgent.email = searchHit.email;
            if (!parsed.listingAgent.brokerage && searchHit.brokerage) parsed.listingAgent.brokerage = searchHit.brokerage;
            if (tourKind !== 'rental') {
              if (!parsed.listingAgent.dreNumber && searchHit.dreNumber) parsed.listingAgent.dreNumber = searchHit.dreNumber;
              if (!parsed.mlsNumber && searchHit.mlsNumber) parsed.mlsNumber = searchHit.mlsNumber;
            }
            if (searchHit.contactRole) parsed.contactRole = searchHit.contactRole;
            if (searchHit.listingKind) parsed.listingKind = searchHit.listingKind;
            if (!parsed.photoUrl && searchHit.photoUrl) {
              parsed.photoUrl = await verifyPhotoUrl(searchHit.photoUrl);
            }
          }
        } catch (searchError) {
          console.warn('Gemini listing web search failed:', searchError.message);
        }
      }
      const target = toTarget(url, parsed);
      listings.push({
        url,
        ok: target.parseStatus !== 'failed',
        target,
        fetchStatus: fetched.status,
        blocked: fetched.blocked,
      });
    } catch (error) {
      listings.push({
        url,
        ok: false,
        error: error.message,
        target: toTarget(url, {
          address: addressFromListingUrl(url),
          listingKind: tourKind,
        }),
      });
    }
  }

  return listings;
}

function mergeTargets(existing, incoming) {
  const next = Array.isArray(existing) ? [...existing] : [];
  for (const target of incoming) {
    const idx = next.findIndex((row) => row.sourceUrl && target.sourceUrl && row.sourceUrl === target.sourceUrl);
    if (idx >= 0) {
      const previous = next[idx];
      const keepStatus = previous.status === 'confirmed' || previous.status === 'declined'
        ? previous.status
        : (target.status || previous.status || 'pending');
      next[idx] = {
        ...previous,
        ...target,
        id: previous.id,
        status: keepStatus,
        confirmedAt: previous.confirmedAt || null,
        lastInboundPreview: previous.lastInboundPreview || null,
        listingAgentEmail: target.listingAgentEmail || previous.listingAgentEmail || '',
        brokerage: target.brokerage || previous.brokerage || '',
        dreNumber: target.dreNumber || previous.dreNumber || '',
        mlsNumber: target.mlsNumber || previous.mlsNumber || '',
        listingKind: target.listingKind || previous.listingKind || '',
        contactRole: target.contactRole || previous.contactRole || '',
        photoUrl: target.photoUrl || previous.photoUrl || '',
        clientNote: previous.clientNote || '',
        clientRank: previous.clientRank ?? null,
        clientInterest: previous.clientInterest === 'passed' ? 'passed' : 'interested',
      };
    } else {
      next.push(target);
    }
  }
  return next.filter((row) => row.address || row.listingAgentPhone || row.sourceUrl);
}

function targetsNeedReview(targets) {
  return (targets || []).some((target) => !target.listingAgentPhone || target.parseStatus !== 'ok');
}

async function findListingPhotoViaUrlContext(url) {
  const listingUrl = String(url || '').trim();
  if (!parseAllowedListingUrl(listingUrl)) return '';
  const prompt = `Read this US real estate listing page and extract one current listing photo URL from the page HTML (og:image or a photos.zillowstatic.com /fp/ image).
URL: ${listingUrl}

Return JSON only:
{"photoUrl":""}

Rules:
- photoUrl must be a direct https image URL that appears on the page.
- Prefer photos.zillowstatic.com/fp/...jpg with cc_ft_960 or cc_ft_1536.
- Empty string if not found. Never invent a URL.`;

  let payload;
  try {
    payload = await vertexGenerateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ urlContext: {} }, { googleSearch: {} }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 256,
      },
    });
  } catch (error) {
    console.warn('Listing photo urlContext+search failed, retrying urlContext:', error.message);
    payload = await vertexGenerateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ urlContext: {} }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 256,
      },
    });
  }
  const parsed = parseJsonObject(extractText(payload)) || {};
  const fromGrounding = extractPhotoUrlsFromGrounding(payload)[0] || '';
  const fromModel = photoAppearsInEvidence(
    parsed.photoUrl,
    walkStrings(retrievalMetadata(payload)).join('\n'),
  );
  return (await verifyPhotoUrl(fromGrounding)) || (await verifyPhotoUrl(fromModel));
}

async function findListingPhotoFromListingPage({ url, address }) {
  if (url) {
    try {
      const fromPage = await findListingPhotoViaUrlContext(url);
      if (fromPage) return fromPage;
    } catch (error) {
      console.warn('Listing URL context photo failed:', error.message);
    }
  }
  return findListingPhotoViaWebSearch({ url, address });
}

async function findListingPhotoViaWebSearch({ url, address }) {
  const queryAddress = String(address || '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const listingUrl = String(url || '').trim();
  if (!queryAddress && !listingUrl) return '';
  const zpid = zpidFromListingUrl(listingUrl);
  const searchHint = [
    listingUrl,
    queryAddress ? `"${queryAddress}" listing photo photos.zillowstatic.com` : '',
    zpid ? `Zillow zpid ${zpid}` : '',
  ].filter(Boolean).join(' ');
  const prompt = `Use Google Search to find one current listing photo for this US residential property. Prefer a photos.zillowstatic.com/fp/ URL from the Zillow listing page. Do not invent URLs.
Search for: ${searchHint}

Return JSON only:
{"photoUrl":""}

Rules:
- photoUrl must be a direct https image URL you actually saw (photos.zillowstatic.com, ssl.cdn-redfin.com, or ap.rdcpix.com).
- Empty string if unsure. Never invent a URL.`;

  const payload = await vertexGenerateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 256,
    },
  });
  const parsed = parseJsonObject(extractText(payload)) || {};
  const fromGrounding = extractPhotoUrlsFromGrounding(payload)[0] || '';
  const fromModel = photoAppearsInEvidence(
    parsed.photoUrl,
    walkStrings(retrievalMetadata(payload)).join('\n'),
  );
  return (await verifyPhotoUrl(fromGrounding)) || (await verifyPhotoUrl(fromModel));
}

async function fillMissingListingPhotos(targets, options = {}) {
  const allowSlowLookup = options.allowSlowLookup === true;
  const fetchTimeoutMs = Number(options.fetchTimeoutMs) > 0 ? Number(options.fetchTimeoutMs) : (allowSlowLookup ? 8000 : 4000);
  const rows = Array.isArray(targets) ? targets : [];
  const updated = await Promise.all(rows.map(async (target) => {
    const existing = await verifyPhotoUrl(target?.photoUrl);
    if (existing) return { ...target, photoUrl: existing };
    const address = String(target?.address || '').trim();
    const sourceUrl = String(target?.sourceUrl || '').trim();
    try {
      if (sourceUrl) {
        const fetched = await fetchListingText(sourceUrl, { timeoutMs: fetchTimeoutMs });
        const fromHtml = await verifyPhotoUrl(fetched.photoUrl);
        if (fromHtml) return { ...target, photoUrl: fromHtml };
      }
      if (!allowSlowLookup) return target;
      if (sourceUrl || address) {
        const fromPage = await findListingPhotoFromListingPage({
          url: sourceUrl,
          address,
        });
        if (fromPage) return { ...target, photoUrl: fromPage };
      }
    } catch (error) {
      console.warn('Listing photo backfill failed', { address, sourceUrl, message: error.message });
    }
    return target;
  }));
  const changed = updated.some((row, index) => row.photoUrl && row.photoUrl !== rows[index]?.photoUrl);
  return { targets: updated, changed };
}

function mergePublicListingPhotos(nextListings, previousListings) {
  return (nextListings || []).map((stop) => {
    if (normalizePhotoUrl(stop?.photoUrl)) return stop;
    const match = (previousListings || []).find((row) => (
      (row.sourceUrl && stop.sourceUrl && row.sourceUrl === stop.sourceUrl)
      || (row.id && stop.id && row.id === stop.id)
      || (row.address && stop.address && row.address === stop.address)
    ));
    const photoUrl = normalizePhotoUrl(match?.photoUrl);
    return photoUrl ? { ...stop, photoUrl } : stop;
  });
}

function publicListingStops(targets) {
  return (targets || [])
    .filter((target) => target.address || target.sourceUrl)
    .map((target, index) => {
      const status = target.status === 'confirmed' || target.status === 'declined'
        ? target.status
        : 'pending';
      return {
        id: String(target.id || `stop-${index + 1}`),
        address: String(target.address || '').trim() || 'Listing from link',
        status,
        sourceUrl: String(target.sourceUrl || '').trim(),
        photoUrl: normalizePhotoUrl(target.photoUrl),
        clientNote: String(target.clientNote || '').slice(0, 600),
        clientRank: Number.isFinite(Number(target.clientRank)) ? Number(target.clientRank) : null,
        clientInterest: target.clientInterest === 'passed' ? 'passed' : 'interested',
      };
    });
}

async function notifyAgentOfImport(db, { agentUid, scheduleId, count, source, contactPhone, teamId, tourKind }) {
  const reviewUrl = `${getFrontendUrl()}/buyer/schedule/${scheduleId}`;
  const phoneLabel = normalizeTourKind(tourKind) === 'rental'
    ? 'owner/PM phones'
    : 'listing-agent phones';
  await db.collection('messages').add({
    threadKey: `system::${agentUid}`,
    agentUid,
    agentEmail: null,
    agentPhone: null,
    contactPhone: contactPhone || 'listing-import',
    direction: 'inbound',
    body: `${count} listing link${count === 1 ? '' : 's'} imported via ${source}. Review ${phoneLabel}, then send showing requests: ${reviewUrl}`,
    twilioSid: null,
    messageType: 'listing_links_imported',
    scheduleId,
    listingId: null,
    offerId: null,
    teamId: teamId || null,
    read: false,
    createdAt: getAdmin().firestore.FieldValue.serverTimestamp(),
  });
}

async function findScheduleForBuyerPhone(db, agentUid, contactPhone) {
  if (!agentUid || !contactPhone) return null;
  const snap = await db.collection('buyerSchedules')
    .where('ownerUid', '==', agentUid)
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const buyers = Array.isArray(data.buyers) ? data.buyers : [];
    if (buyers.some((buyer) => buyer.phone && normalizePhone(buyer.phone) === contactPhone)) {
      return { ref: docSnap.ref, data, id: docSnap.id };
    }
  }
  return null;
}

async function ingestListingUrls({
  db,
  urls,
  agentUid,
  teamId = null,
  scheduleId = null,
  source = 'import',
  contactPhone = null,
  agentName = null,
  tourKind: requestedTourKind = null,
}) {
  if (!agentUid) {
    throw new Error('NO_AGENT');
  }

  let scheduleRef = null;
  let scheduleData = {};

  if (scheduleId) {
    scheduleRef = db.collection('buyerSchedules').doc(scheduleId);
    const snap = await scheduleRef.get();
    if (!snap.exists) throw new Error('SCHEDULE_NOT_FOUND');
    scheduleData = snap.data();
    if (scheduleData.ownerUid && scheduleData.ownerUid !== agentUid) {
      throw new Error('SCHEDULE_NOT_OWNED');
    }
  } else {
    const matched = await findScheduleForBuyerPhone(db, agentUid, contactPhone);
    if (matched) {
      scheduleRef = matched.ref;
      scheduleData = matched.data;
      scheduleId = matched.id;
    }
  }

  const tourKind = normalizeTourKind(scheduleData.tourKind || requestedTourKind);
  const listings = await parsePropertyUrls(urls, { tourKind, quick: source === 'portal' });
  const incoming = listings.map((row) => row.target);
  if (incoming.length === 0) {
    throw new Error('NO_VALID_URLS');
  }

  if (!scheduleRef) {
    scheduleRef = db.collection('buyerSchedules').doc();
    scheduleId = scheduleRef.id;
    scheduleData = {
      ownerUid: agentUid,
      teamId: teamId || null,
      agentName: agentName || 'Your agent',
      buyers: contactPhone
        ? [{ id: 'buyer-1', name: 'Buyer', phone: contactPhone, email: '', role: 'primary' }]
        : [],
      buyerName: 'Buyer',
      availability: { date: '', start: '', end: '' },
      targets: [],
      status: 'draft',
      source: 'sms_links',
      tourKind,
    };
    await scheduleRef.set({
      ...scheduleData,
      createdAt: getAdmin().firestore.FieldValue.serverTimestamp(),
      updatedAt: getAdmin().firestore.FieldValue.serverTimestamp(),
    });
  }

  const merged = mergeTargets(scheduleData.targets, incoming);
  const needsReview = targetsNeedReview(merged);
  const keepStatus = scheduleData.status === 'requests_sent' || scheduleData.status === 'route_ready'
    ? scheduleData.status
    : 'draft';

  await scheduleRef.set({
    ownerUid: scheduleData.ownerUid || agentUid,
    teamId: scheduleData.teamId || teamId || null,
    targets: merged,
    status: keepStatus,
    tourKind,
    needsReview,
    lastImportAt: getAdmin().firestore.FieldValue.serverTimestamp(),
    lastImportSource: source,
    updatedAt: getAdmin().firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  if (scheduleData.shareTokenId) {
    await db.collection('clientPlanTokens').doc(scheduleData.shareTokenId).set({
      publicListings: publicListingStops(merged),
      tourKind,
    }, { merge: true });
  }

  await notifyAgentOfImport(db, {
    agentUid: scheduleData.ownerUid || agentUid,
    scheduleId: scheduleRef.id,
    count: incoming.length,
    source,
    contactPhone,
    teamId: scheduleData.teamId || teamId || null,
    tourKind,
  });

  return {
    scheduleId: scheduleRef.id,
    listings,
    publicStops: publicListingStops(merged),
    needsReview,
    imported: incoming.length,
  };
}

async function enrichMissingListingContacts(targets, tourKind) {
  const rows = Array.isArray(targets) ? targets : [];
  const verifiedPhotos = await Promise.all(rows.map((target) => verifyPhotoUrl(target?.photoUrl)));
  const next = [];
  let changed = false;
  for (let index = 0; index < rows.length; index += 1) {
    const target = rows[index];
    const existingPhoto = verifiedPhotos[index] || '';
    if (existingPhoto && existingPhoto !== target.photoUrl) changed = true;
    if (!target?.sourceUrl) {
      next.push(existingPhoto ? { ...target, photoUrl: existingPhoto } : target);
      continue;
    }
    if (target.listingAgentPhone && existingPhoto) {
      next.push({ ...target, photoUrl: existingPhoto });
      continue;
    }
    try {
      const listings = await parsePropertyUrls([target.sourceUrl], {
        tourKind,
        quick: false,
      });
      const parsed = listings[0]?.target;
      if (!parsed) {
        next.push(existingPhoto ? { ...target, photoUrl: existingPhoto } : target);
        continue;
      }
      changed = true;
      next.push({
        ...target,
        listingAgentPhone: parsed.listingAgentPhone || target.listingAgentPhone || '',
        listingAgentName: parsed.listingAgentName || target.listingAgentName || '',
        listingAgentEmail: parsed.listingAgentEmail || target.listingAgentEmail || '',
        brokerage: parsed.brokerage || target.brokerage || '',
        dreNumber: parsed.dreNumber || target.dreNumber || '',
        mlsNumber: parsed.mlsNumber || target.mlsNumber || '',
        listingKind: parsed.listingKind || target.listingKind || '',
        contactRole: parsed.contactRole || target.contactRole || '',
        photoUrl: existingPhoto || parsed.photoUrl || '',
        parseStatus: parsed.parseStatus || target.parseStatus,
        phoneSource: parsed.phoneSource || target.phoneSource || '',
        note: target.note || parsed.note || '',
      });
    } catch (error) {
      console.warn('Listing contact enrich failed:', error.message);
      next.push(existingPhoto ? { ...target, photoUrl: existingPhoto } : target);
    }
  }
  return { targets: next, changed };
}

module.exports = {
  MAX_URLS,
  extractListingUrls,
  parseAllowedListingUrl,
  canonicalizeListingUrl,
  addressFromListingUrl,
  parsePropertyUrls,
  ingestListingUrls,
  enrichMissingListingContacts,
  mergeTargets,
  targetsNeedReview,
  publicListingStops,
  fillMissingListingPhotos,
  extractListingPhotoFromHtml,
  mergePublicListingPhotos,
  normalizePhotoUrl,
  normalizeTourKind,
  normalizeListingKind,
  normalizeContactRole,
};
