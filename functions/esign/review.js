function clean(value) {
  return String(value || '').trim();
}

function parseDate(value) {
  const text = clean(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

function reviewSignaturePacket(summary) {
  const blockers = [];
  const warnings = [];
  const address = clean(summary.address);
  const price = clean(summary.price);
  const parties = Array.isArray(summary.parties) ? summary.parties : [];
  const named = parties.filter((party) => clean(party.name));

  if (!address) blockers.push('Missing address.');
  if (!price) blockers.push('Missing price.');
  if (!named.length) blockers.push('Missing signer.');

  named.forEach((party) => {
    if (!clean(party.phone)) blockers.push(`${clean(party.name)} has no phone for the signature link.`);
    if (!clean(party.role)) warnings.push(`${clean(party.name)} has no role.`);
  });

  const closeMs = parseDate(summary.closeDate);
  if (clean(summary.closeDate) && closeMs === null) warnings.push('Close date could not be read.');
  if (closeMs !== null && closeMs < Date.now() - 24 * 60 * 60 * 1000) {
    warnings.push('Close date is in the past.');
  }
  if (!clean(summary.contingencies)) warnings.push('Contingencies are blank.');

  const names = named.map((party) => clean(party.name).toLowerCase());
  if (new Set(names).size !== names.length) warnings.push('Two parties share the same name.');

  const listingPrice = clean(summary.listingPrice);
  if (listingPrice && price && listingPrice.replace(/\D/g, '') !== price.replace(/\D/g, '')) {
    warnings.push('Price differs from the listing read.');
  }

  return { blockers, warnings };
}

function summaryFromOffer(offer, parties, listingPrice) {
  const meta = offer?.meta || {};
  return {
    offerId: offer?.id || null,
    address: clean(offer?.address || meta.address || offer?.hubSlug),
    price: clean(meta.price),
    financing: clean(meta.financing),
    concessions: clean(meta.concessions),
    closeDate: clean(meta.closeDate),
    contingencies: clean(meta.contingencies),
    listingPrice: clean(listingPrice),
    parties: (parties || []).map((party) => ({
      role: clean(party.role),
      name: clean(party.name),
      phone: clean(party.phone),
    })),
  };
}

module.exports = {
  reviewSignaturePacket,
  summaryFromOffer,
};
