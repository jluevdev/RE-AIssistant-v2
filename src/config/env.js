const PLACEHOLDER_PATTERNS = [
  /^build-placeholder/i,
  /^your[_-]?/i,
  /^replace[_-]?me/i,
  /^changeme/i,
  /^xxx+$/i,
];

const FIREBASE_ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

function readEnv(name) {
  const value = import.meta.env[name];
  return value && String(value).trim() !== '' ? String(value).trim() : '';
}

function isPlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

export function getFirebaseEnvIssues() {
  const issues = [];
  for (const name of FIREBASE_ENV_KEYS) {
    const value = readEnv(name);
    if (!value) {
      issues.push(`Missing ${name} in .env`);
    } else if (name === 'VITE_FIREBASE_API_KEY' && isPlaceholder(value)) {
      issues.push(`${name} is still a placeholder (${value})`);
    }
  }
  return issues;
}

export function requireEnv(name) {
  const value = readEnv(name);
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and set this value.`
    );
  }
  return value;
}

export function getFirebaseConfig() {
  if (getFirebaseEnvIssues().length > 0) return null;
  return {
    apiKey: requireEnv('VITE_FIREBASE_API_KEY'),
    authDomain: requireEnv('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: requireEnv('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: requireEnv('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: requireEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: requireEnv('VITE_FIREBASE_APP_ID'),
  };
}
