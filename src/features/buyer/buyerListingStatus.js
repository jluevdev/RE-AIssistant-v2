export function showingStatus(value) {
  if (value === 'confirmed' || value === 'declined') return value;
  return 'pending';
}

export function showingStatusTone(status) {
  if (status === 'confirmed') return 'success';
  if (status === 'declined') return 'danger';
  return 'warning';
}

export function showingStatusLabel(status, lang = 'en') {
  const key = showingStatus(status);
  if (lang === 'es') {
    if (key === 'confirmed') return 'Visitas confirmadas';
    if (key === 'declined') return 'Visitas rechazadas';
    return 'Visitas pendientes';
  }
  if (key === 'confirmed') return 'Confirmed Showings';
  if (key === 'declined') return 'Declined';
  return 'Pending Showings';
}

export function showingStatusHint(status, lang = 'en', tourKind = 'sale') {
  const key = showingStatus(status);
  const rental = tourKind === 'rental';
  if (lang === 'es') {
    if (key === 'confirmed') {
      return rental
        ? 'El propietario o administrador confirmó esta visita.'
        : 'El agente de listado confirmó esta visita.';
    }
    if (key === 'declined') {
      return rental
        ? 'El propietario o administrador rechazó esta visita.'
        : 'El agente de listado rechazó esta visita.';
    }
    return 'En espera de confirmación';
  }
  if (key === 'confirmed') {
    return rental
      ? 'Owner or property manager confirmed this showing.'
      : 'Listing agent confirmed this showing.';
  }
  if (key === 'declined') {
    return rental
      ? 'Owner or property manager declined this showing.'
      : 'Listing agent declined this showing.';
  }
  return 'Awaiting confirmation';
}

export function isPassedShowing(listing) {
  return listing?.clientInterest === 'passed';
}

export function splitListingStops(listings = [], orderedStops = []) {
  const rows = Array.isArray(listings) && listings.length
    ? listings
    : (orderedStops || []).map((address) => ({ address, status: 'confirmed', sourceUrl: '', photoUrl: '' }));
  return {
    confirmed: rows.filter((row) => showingStatus(row.status) === 'confirmed'),
    pending: rows.filter((row) => showingStatus(row.status) === 'pending'),
    declined: rows.filter((row) => showingStatus(row.status) === 'declined'),
  };
}

export function sortConfirmedForShowingDay(listings = []) {
  const confirmed = listings.filter((row) => showingStatus(row.status) === 'confirmed');
  const interested = confirmed
    .filter((row) => !isPassedShowing(row))
    .slice()
    .sort((a, b) => (Number(a.clientRank) || 999) - (Number(b.clientRank) || 999));
  const passed = confirmed.filter((row) => isPassedShowing(row));
  return { interested, passed };
}
