/**
 * Walk the SmartShowings flow and print a PASS/FAIL table.
 * Run: npm run test:smartshowings
 * Uses the in-process scenario (mocked Twilio and xAI). No emulator, no network.
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { STEPS, runSmartShowingsScenario } = require(path.join(root, 'functions/showings/lifecycle.js'));
const { smsMode, emailMode } = require(path.join(root, 'functions/showings/flag.js'));

function pad(value, width) {
  const text = String(value);
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

const report = await runSmartShowingsScenario();
const markdown = fs.readFileSync(path.join(root, 'docs/smartshowings-flow.md'), 'utf8');
const missing = STEPS.filter((step) => !new RegExp(`\\b${step.id}\\b`).test(markdown));
const rows = report.rows.slice();
rows.push({
  id: 'DOC',
  pass: missing.length === 0,
  detail: missing.length
    ? `Flow chart is missing ${missing.map((step) => step.id).join(', ')}`
    : 'docs/smartshowings-flow.md names every step',
});

console.log('SmartShowings scenario');
console.log(`SMS mode: ${smsMode()} (switch with SMART_SHOWINGS_SMS_MODE=live after A2P 10DLC)`);
console.log(`Email mode: ${emailMode()} (switch with SMART_SHOWINGS_EMAIL_MODE=live)`);
console.log('xAI: mocked    Twilio: not called    Stripe: not called');
console.log('');
console.log(`${pad('ID', 6)} ${pad('RESULT', 8)} STEP`);
for (const row of rows) {
  const title = STEPS.find((step) => step.id === row.id)?.title || row.detail;
  console.log(`${pad(row.id, 6)} ${pad(row.pass ? 'PASS' : 'FAIL', 8)} ${title}`);
  if (!row.pass) console.log(`       ${row.detail}`);
}
const failed = rows.filter((row) => !row.pass);
console.log('');
console.log(`${rows.length - failed.length} passed, ${failed.length} failed`);
if (report.network.twilio || report.network.xai || report.network.email) {
  console.error('Provider counters were not zero.');
  process.exit(1);
}
process.exit(failed.length ? 1 : 0);
