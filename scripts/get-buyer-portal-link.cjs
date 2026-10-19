#!/usr/bin/env node
/** Print latest buyer tour portal link for an agent email. */
const fs = require('fs');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');
const { Firestore } = require('@google-cloud/firestore');

const PROJECT_ID = 'realestatescheduler-fa876';
const FRONTEND_URL = 'https://reaiassistant-v2.web.app';
const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const emailArg = (process.argv[2] || 'josephluevanos8@gmail.com').trim().toLowerCase();

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

async function findUidByEmail(email) {
  const tmp = path.join(__dirname, '_buyer-link-auth.json');
  require('child_process').execSync(
    `firebase auth:export "${tmp}" --project ${PROJECT_ID}`,
    { stdio: 'pipe', cwd: path.join(__dirname, '..') },
  );
  const auth = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  fs.unlinkSync(tmp);
  const user = auth.users.find((u) => (u.email || '').toLowerCase() === email);
  if (!user) throw new Error(`No auth user for ${email}`);
  return user.localId;
}

async function main() {
  const authClient = await getAuthClient();
  const db = new Firestore({ projectId: PROJECT_ID, authClient });
  const uid = await findUidByEmail(emailArg);

  const snap = await db.collection('buyerSchedules')
    .where('ownerUid', '==', uid)
    .limit(10)
    .get();

  if (snap.empty) {
    console.log('No buyer tours found.');
    return;
  }

  const tours = snap.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .sort((a, b) => {
      const aTime = a.updatedAt?.toDate?.()?.getTime() || 0;
      const bTime = b.updatedAt?.toDate?.()?.getTime() || 0;
      return bTime - aTime;
    });

  const latest = tours[0];
  const buyers = (latest.buyers || []).map((b) => b.name).filter(Boolean).join(' & ') || latest.buyerName || 'Tour';
  const link = latest.shareTokenId
    ? `${FRONTEND_URL}/client/plan?t=${latest.shareTokenId}`
    : '(no portal link yet)';

  console.log(`Latest tour: ${buyers}`);
  console.log(`Schedule ID: ${latest.id}`);
  console.log(`Portal link: ${link}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
