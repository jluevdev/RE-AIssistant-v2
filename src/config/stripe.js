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
  },
  premiumTeam: {
    key: 'premiumTeam',
    id: optionalEnv('VITE_STRIPE_PRICE_PREMIUM_TEAM'),
    name: 'Premium Team',
    price: 1999,
  },
};

export const stripeConfig = {
  publishableKey: optionalEnv('VITE_STRIPE_PUBLISHABLE_KEY'),
};

export function getConfiguredPlans() {
  return Object.values(SUBSCRIPTION_PLANS).filter((plan) => plan.id);
}
