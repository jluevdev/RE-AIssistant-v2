#!/usr/bin/env node
/**
 * Admin: delete a Firebase Auth user and their Firestore data by email.
 * Usage: node scripts/delete-user-by-email.cjs user@example.com
 *
 * Uses Firebase CLI login credentials (run `firebase login` first).
 */
const fs = require('fs');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');
const { Firestore } = require('@google-cloud/firestore');
const { purgeUserData } = require('../functions/account/deleteUserData');

const PROJECT_ID = 'realestatescheduler-fa876';
const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/delete-user-by-email.cjs user@example.com');
  process.exit(1);
}

function loadFirebaseCliTokens() {
  const candidates = [
    path.join(process.env.APPDATA || '', 'configstore', 'firebase-tools.json'),
    path.join(process.env.USERPROFILE || process.env.HOME || '', '.config', 'configstore', 'firebase-tools.json'),
  ].filter(Boolean);

  const configPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!configPath) {
    throw new Error('Firebase CLI config not found. Run `firebase login` first.');
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const tokens = config.tokens;
  if (!tokens?.access_token) {
    throw new Error('No Firebase CLI access token. Run `firebase login` first.');
  }
  return tokens;
}

async function getAccessToken() {
  const tokens = loadFirebaseCliTokens();
  if (tokens.expires_at > Date.now() + 60_000) {
    return tokens.access_token;
  }

  const oauth2 = new OAuth2Client(FIREBASE_CLI_CLIENT_ID);
  oauth2.setCredentials({ refresh_token: tokens.refresh_token });
  const refreshed = await oauth2.getAccessToken();
  if (!refreshed.token) {
    throw new Error('Firebase CLI session expired. Run `firebase login` again.');
  }
  return refreshed.token;
}

async function getAuthClient() {
  const token = await getAccessToken();
  const oauth2 = new OAuth2Client(FIREBASE_CLI_CLIENT_ID);
  oauth2.setCredentials({ access_token: token });
  return oauth2;
}

async function deleteAuthUser(accessToken, uid) {
  const url = `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:delete`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ localId: uid }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Auth delete failed (${response.status}): ${body}`);
  }
}

async function getAuthUserByEmail(accessToken, targetEmail) {
  const url = `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: [targetEmail] }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Auth lookup failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const user = data.users?.[0];
  if (!user) {
    const err = new Error(`No Auth user found for ${targetEmail}`);
    err.code = 'auth/user-not-found';
    throw err;
  }
  return user;
}

async function main() {
  const accessToken = await getAccessToken();
  const user = await getAuthUserByEmail(accessToken, email);
  const uid = user.localId;

  console.log(`Deleting ${email} (${uid})…`);

  const authClient = await getAuthClient();
  const db = new Firestore({
    projectId: PROJECT_ID,
    authClient,
  });

  const deletedCounts = await purgeUserData(db, uid, email);
  await deleteAuthUser(accessToken, uid);

  console.log('Done.', deletedCounts);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
