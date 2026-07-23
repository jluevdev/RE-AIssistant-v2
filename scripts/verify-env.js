/**
 * Quick local env check before signup/deploy.
 * Run: node scripts/verify-env.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');

if (!fs.existsSync(envPath)) {
  console.error('FAIL: .env missing. Copy .env.example to .env');
  process.exit(1);
}

const env = fs.readFileSync(envPath, 'utf8');
const get = (key) => {
  const m = env.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
};

const checks = [
  {
    name: 'Firebase API key',
    ok: get('VITE_FIREBASE_API_KEY').startsWith('AIza') && !get('VITE_FIREBASE_API_KEY').includes('placeholder'),
  },
  {
    name: 'Firebase project',
    ok: get('VITE_FIREBASE_PROJECT_ID') === 'realestatescheduler-fa876',
  },
  {
    name: 'Frontend URL',
    ok: Boolean(get('FRONTEND_URL')),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed++;
}

const optional = ['TWILIO_ACCOUNT_SID', 'VITE_STRIPE_PUBLISHABLE_KEY'];
console.log('\nOptional (needed later):');
for (const key of optional) {
  const val = get(key);
  console.log(`  ${val ? 'OK' : 'empty'}  ${key}`);
}

console.log(failed ? '\nFix FAIL items in RE-AIssistant-v2/.env then restart npm run dev' : '\nReady for local signup test at http://localhost:3000/signup');
process.exit(failed ? 1 : 0);
