function optionalEnv(name) {
  const value = import.meta.env[name];
  return value && String(value).trim() !== '' ? value : null;
}

export const SUBSCRIPTION_PLANS = {
  singleAgent: {
    key: 'singleAgent',
    id: optionalEnv('VITE_STRIPE_PRICE_SINGLE_AGENT'),
    name: 'Single Agent',
    price: 299,
  },
  allInclusive: {
    key: 'allInclusive',
    id: optionalEnv('VITE_STRIPE_PRICE_ALL_INCLUSIVE'),
    name: 'All-Inclusive Agent',
    price: 499,
    popular: true,
    promo: {
      label: 'CAR Expo special',
      price: '$999 for the year',
      note: 'Not affiliated with CAR Expo.',
    },
    yearly: {
      key: 'allInclusiveYearly',
      id: optionalEnv('VITE_STRIPE_PRICE_ALL_INCLUSIVE_YEARLY'),
      name: 'All-Inclusive Agent',
      priceLabel: 'CAR Expo special — $999/year',
    },
  },
  premiumTeam: {
    key: 'premiumTeam',
    id: optionalEnv('VITE_STRIPE_PRICE_PREMIUM_TEAM'),
    name: 'Premium Team',
    priceLabel: 'Call for pricing',
    promo: {
      label: 'CAR Expo special',
      price: 'Call for team Expo pricing',
      note: 'Not affiliated with CAR Expo.',
    },
  },
};

export const stripeConfig = {
  publishableKey: optionalEnv('VITE_STRIPE_PUBLISHABLE_KEY'),
};

export function getConfiguredPlans() {
  return Object.values(SUBSCRIPTION_PLANS).filter((plan) => plan.id);
}
