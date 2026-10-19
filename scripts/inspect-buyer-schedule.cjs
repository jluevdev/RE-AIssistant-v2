#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');
const { Firestore } = require('@google-cloud/firestore');

const PROJECT_ID = 'realestatescheduler-fa876';
const scheduleId = process.argv[2];
const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';

function loadFirebaseCliTokens() {
  const configPath = [
    path.join(process.env.APPDATA || '', 'configstore', 'firebase-tools.json'),
    path.join(process.env.USERPROFILE || '', '.config', 'configstore', 'firebase-tools.json'),
  ].find((p) => fs.existsSync(p));
  if (!configPath) throw new Error('Run firebase login first.');
  return JSON.parse(fs.readFileSync(configPath, 'utf8')).tokens;
}

async function getAuthClient() {
  const tokens = loadFirebaseCliTokens();
  const oauth2 = new OAuth2Client(FIREBASE_CLI_CLIENT_ID);
  if (tokens.expires_at > Date.now() + 60_000) {
    oauth2.setCredentials({ access_token: tokens.access_token });
  } else {
    oauth2.setCredentials({ refresh_token: tokens.refresh_token });
    const refreshed = await oauth2.getAccessToken();
    oauth2.setCredentials({ access_token: refreshed.token });
  }
  return oauth2;
}

async function main() {
  const authClient = await getAuthClient();
  const db = new Firestore({ projectId: PROJECT_ID, authClient });

  if (scheduleId) {
    const snap = await db.collection('buyerSchedules').doc(scheduleId).get();
    console.log(JSON.stringify({ id: snap.id, exists: snap.exists, ...snap.data() }, null, 2));
    return;
  }

  const snap = await db.collection('buyerSchedules').limit(20).get();
  snap.docs.forEach((docSnap) => {
    const d = docSnap.data();
    console.log(docSnap.id, d.buyerName || d.buyers?.map((b) => b.name).join(' & '), 'shareTokenId:', d.shareTokenId || 'MISSING', 'status:', d.status);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
