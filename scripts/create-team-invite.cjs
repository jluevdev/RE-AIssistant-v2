#!/usr/bin/env node
/**
 * Create a team invite directly in Firestore (bypasses Cloud Function).
 * Usage: node scripts/create-team-invite.cjs partner@email.com [agent|admin]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { Firestore, FieldValue, Timestamp } = require('@google-cloud/firestore');

const PROJECT_ID = 'realestatescheduler-fa876';
const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FRONTEND_URL = 'https://reaiassistant-v2.web.app';

const email = process.argv[2];
const role = process.argv[3] === 'admin' ? 'admin' : 'agent';

if (!email) {
  console.error('Usage: node scripts/create-team-invite.cjs partner@email.com [agent|admin]');
  process.exit(1);
}

function loadFirebaseCliTokens() {
  const candidates = [
    path.join(process.env.APPDATA || '', 'configstore', 'firebase-tools.json'),
    path.join(process.env.USERPROFILE || process.env.HOME || '', '.config', 'configstore', 'firebase-tools.json'),
  ].filter(Boolean);
  const configPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!configPath) throw new Error('Run firebase login first.');
  return JSON.parse(fs.readFileSync(configPath, 'utf8')).tokens;
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
    throw new Error('Firebase CLI session expired. Run firebase login again.');
  }
  return refreshed.token;
}

async function getAuthClient() {
  const token = await getAccessToken();
  const oauth2 = new OAuth2Client(FIREBASE_CLI_CLIENT_ID);
  oauth2.setCredentials({ access_token: token });
  return oauth2;
}

async function main() {
  const authClient = await getAuthClient();
  const db = new Firestore({ projectId: PROJECT_ID, authClient });
  const inviteEmail = email.trim().toLowerCase();

  const teamsSnap = await db.collection('teams').limit(1).get();
  if (teamsSnap.empty) {
    console.error('No team found. Create a team in the app first.');
    process.exit(1);
  }

  const teamDoc = teamsSnap.docs[0];
  const team = teamDoc.data();
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  const inviteRef = db.collection('teamInvites').doc();
  await inviteRef.set({
    teamId: teamDoc.id,
    teamName: team.name,
    email: inviteEmail,
    role,
    status: 'pending',
    token,
    invitedByUid: team.ownerUid || null,
    invitedByName: 'Admin script',
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
  });

  const inviteUrl = `${FRONTEND_URL}/join/${token}`;
  console.log('Invite created for', inviteEmail);
  console.log('Team:', team.name, `(${teamDoc.id})`);
  console.log('Link:', inviteUrl);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
