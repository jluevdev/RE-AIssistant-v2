export function normalizeTourKind(value) {
  return value === 'rental' ? 'rental' : 'sale';
}

export function isRentalTour(tourKind) {
  return normalizeTourKind(tourKind) === 'rental';
}

export function householdRoleOptions(tourKind) {
  if (isRentalTour(tourKind)) {
    return [
      { value: 'primary', label: 'Primary renter' },
      { value: 'co_borrower', label: 'Co-applicant' },
    ];
  }
  return [
    { value: 'primary', label: 'Primary buyer' },
    { value: 'co_borrower', label: 'Co-borrower' },
  ];
}

export function contactPhoneLabel(tourKind) {
  return isRentalTour(tourKind) ? 'Owner / PM phone' : 'Listing agent phone';
}

export function contactNameLabel(tourKind) {
  return isRentalTour(tourKind) ? 'Owner / PM name' : 'Listing agent name';
}

export function contactEmailLabel(tourKind) {
  return isRentalTour(tourKind) ? 'Owner / PM email' : 'Listing agent email';
}

export function tourKindLabel(tourKind) {
  return isRentalTour(tourKind) ? 'Rental' : 'Sale';
}

export function contactTypeFromTarget(tourKind, contactRole) {
  if (!isRentalTour(tourKind)) return 'listing_agent';
  if (contactRole === 'property_manager') return 'property_manager';
  return 'owner';
}

export function contactDisplayPrefix(tourKind, contactRole) {
  if (isRentalTour(tourKind)) {
    return contactRole === 'property_manager' ? 'Property manager' : 'Owner';
  }
  return 'Listing agent';
}
