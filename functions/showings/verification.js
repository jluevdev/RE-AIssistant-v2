/**
 * California DRE publishes a website lookup and no official API.
 * TODO: ask DRE before any automated lookup. Do not scrape pplinfo.asp.
 * This adapter always returns unknown so Verified cannot be reached without
 * a human attestation (or a future adapter that is explicitly allowed).
 */
async function stubDreLookup() {
  return {
    status: 'unknown',
    source: 'stub',
    licensed: null,
    nameMatch: null,
    reason: 'TODO: no official DRE API. Manual confirmation is required. Do not scrape the public lookup.',
  };
}

function normalizeExtraction(raw) {
  const source = raw || {};
  return {
    name: String(source.name || '').trim(),
    dreNumber: String(source.dreNumber || source.dre || source.license || '').replace(/[^\d]/g, ''),
    brokerage: String(source.brokerage || source.company || '').trim(),
    phone: String(source.phone || '').trim(),
    email: String(source.email || '').trim(),
  };
}

function classifyVerification({
  extraction,
  dreResult,
  independentConfirmed = false,
  attested = false,
}) {
  const fields = normalizeExtraction(extraction);
  const dre = dreResult || { status: 'unknown', source: 'stub' };
  if (!fields.name && !fields.dreNumber) {
    return {
      level: 'Failed',
      accessEligible: false,
      method: null,
      reason: 'No name or DRE number on the card.',
      extraction: fields,
    };
  }
  if (dre.status === 'not_licensed' || dre.nameMatch === false) {
    return {
      level: 'Failed',
      accessEligible: false,
      method: null,
      reason: dre.reason || 'DRE check did not match a licensed agent.',
      extraction: fields,
    };
  }
  const dreOk = dre.status === 'licensed' && dre.nameMatch !== false;
  if (dreOk && (independentConfirmed || attested)) {
    return {
      level: 'Verified',
      accessEligible: true,
      method: attested ? 'listing-agent attested' : 'dre-plus-independent',
      reason: attested
        ? 'Verified — listing-agent attested'
        : 'DRE licensed and an independent source confirmed the contact.',
      extraction: fields,
    };
  }
  if (attested && dre.status === 'unknown') {
    return {
      level: 'Verified',
      accessEligible: true,
      method: 'listing-agent attested',
      reason: 'Verified — listing-agent attested. DRE lookup is still a stub.',
      extraction: fields,
    };
  }
  return {
    level: 'Partial',
    accessEligible: false,
    method: null,
    reason: dre.status === 'unknown'
      ? 'DRE lookup is unavailable (no official API). A person must confirm before this is Verified. No access info.'
      : 'License matched, but the phone or email is not confirmed by an independent source. No access info.',
    extraction: fields,
  };
}

function assertAccessReleaseAllowed() {
  return {
    allowed: false,
    reason: 'Access info is human-only in this MVP. The assistant will not send lockbox, gate, alarm, or entry details.',
  };
}

module.exports = {
  stubDreLookup,
  normalizeExtraction,
  classifyVerification,
  assertAccessReleaseAllowed,
};
