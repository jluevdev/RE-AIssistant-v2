export const BUYER_ROLES = [
  { value: 'primary', label: 'Primary buyer' },
  { value: 'co_borrower', label: 'Co-borrower' },
];

export const EMPTY_BUYER = {
  name: '',
  phone: '',
  email: '',
  role: 'primary',
};

export function emptyBuyer(role = 'primary') {
  return { ...EMPTY_BUYER, role };
}

export function normalizeBuyers(buyers) {
  if (!Array.isArray(buyers)) return [];
  const normalized = buyers
    .map((buyer, index) => ({
      id: buyer?.id || `buyer-${index + 1}`,
      name: String(buyer?.name || '').trim(),
      phone: String(buyer?.phone || '').trim(),
      email: String(buyer?.email || '').trim().toLowerCase(),
      role: buyer?.role === 'co_borrower' ? 'co_borrower' : 'primary',
    }))
    .filter((buyer) => buyer.name);

  if (normalized.length === 0) return [];
  if (!normalized.some((buyer) => buyer.role === 'primary')) {
    normalized[0].role = 'primary';
  }
  return normalized;
}

export function formatHouseholdLabel(buyers, fallback = '') {
  const names = normalizeBuyers(buyers).map((buyer) => buyer.name).filter(Boolean);
  if (names.length === 0) return fallback;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

export function roleLabel(role) {
  return BUYER_ROLES.find((item) => item.value === role)?.label || 'Buyer';
}
