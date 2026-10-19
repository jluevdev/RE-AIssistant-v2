#!/usr/bin/env node
/**
 * Parse Zillow/Redfin/Realtor URLs locally (no Cloud Functions).
 * Usage:
 *   $env:GOOGLEAI_KEY="..."
 *   node scripts/parse-property-links.cjs "https://www.zillow.com/homedetails/..."
 */
const { parsePropertyUrls, extractListingUrls } = require('../functions/buyer/listingLinks');

const raw = process.argv.slice(2).join(' ');
const urls = extractListingUrls(raw);
if (urls.length === 0) {
  console.error('Usage: node scripts/parse-property-links.cjs <zillow-or-redfin-or-realtor-urls>');
  process.exit(1);
}

if (!process.env.GOOGLEAI_KEY) {
  console.error('Set GOOGLEAI_KEY, then re-run. Example URLs found:');
  urls.forEach((url) => console.log(url));
  process.exit(1);
}

parsePropertyUrls(urls)
  .then((listings) => {
    console.log(JSON.stringify(listings, null, 2));
  })
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
