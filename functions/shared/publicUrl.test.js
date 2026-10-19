const test = require('node:test');
const assert = require('node:assert/strict');
const { getPublicAppUrl, CANONICAL_APP_URL } = require('./publicUrl');

test('message links use reaissistant.com instead of the Firebase host', () => {
  assert.equal(getPublicAppUrl({}), CANONICAL_APP_URL);
  assert.equal(getPublicAppUrl({ FRONTEND_URL: 'https://reaiassistant-v2.web.app' }), CANONICAL_APP_URL);
  assert.equal(getPublicAppUrl({ FRONTEND_URL: 'https://reaiassistant.com' }), CANONICAL_APP_URL);
  assert.equal(getPublicAppUrl({ FRONTEND_URL: 'http://localhost:5173' }), 'http://localhost:5173');
});
