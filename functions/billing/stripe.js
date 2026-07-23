const Stripe = require('stripe');
const { requireEnv } = require('../env');

let stripeClient = null;

function getStripe() {
  if (!stripeClient) {
    stripeClient = new Stripe(requireEnv('STRIPE_SECRET_KEY'));
  }
  return stripeClient;
}

function getAllowedPriceIds() {
  return [
    process.env.STRIPE_PRICE_SINGLE_AGENT,
    process.env.STRIPE_PRICE_ALL_INCLUSIVE,
    process.env.STRIPE_PRICE_PREMIUM_TEAM,
  ].filter(Boolean);
}

function assertAllowedPriceId(priceId) {
  const allowed = getAllowedPriceIds();
  if (allowed.length > 0 && !allowed.includes(priceId)) {
    throw new Error('Invalid price ID for checkout');
  }
}

function getFrontendUrl() {
  return process.env.FRONTEND_URL || 'https://reaiassistant-v2.web.app';
}

module.exports = {
  getStripe,
  getAllowedPriceIds,
  assertAllowedPriceId,
  getFrontendUrl,
};
