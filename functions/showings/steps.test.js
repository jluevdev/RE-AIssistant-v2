const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { STEPS, runSmartShowingsScenario } = require('./lifecycle');
const { sha256 } = require('./sha256');

let report;

test.before(async () => {
  report = await runSmartShowingsScenario();
});

for (const step of STEPS) {
  test(step.id, () => {
    const row = report.rows.find((item) => item.id === step.id);
    assert.ok(row, `missing result for ${step.id}`);
    assert.equal(row.pass, true, row.detail);
  });
}

test('DOC', () => {
  const markdown = fs.readFileSync(path.join(__dirname, '../../docs/smartshowings-flow.md'), 'utf8');
  const missing = STEPS.filter((step) => !new RegExp(`\\b${step.id}\\b`).test(markdown)).map((step) => step.id);
  assert.deepEqual(missing, []);
});

test('sha256 matches node', () => {
  assert.equal(sha256('abc'), crypto.createHash('sha256').update('abc').digest('hex'));
});
