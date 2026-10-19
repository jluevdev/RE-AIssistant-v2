#!/usr/bin/env node
/**
 * Accept a team invite directly in Firestore (bypasses Cloud Function).
 * Usage: node scripts/accept-team-invite.cjs octavioluevanosrealty@gmail.com
 */
const fs = require('fs');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');
const { Firestore, FieldValue } = require('@google-cloud/firestore');

const PROJECT_ID = 'realestatescheduler-fa876';
const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';

const emailArg = process.argv[2]?.trim().toLowerCase();
if (!emailArg) {
  console.error('Usage: node scripts/accept-team-invite.cjs user@email.com');
  process.exit(1);
}

function loadFirebaseCliTokens() {
  const candidates = [
    path.join(process.env.APPDATA || '', 'configstore', 'firebase-tools.json'),
    path.join(process.env.USERPROFILE || process.env.HOME || '', '.config', 'configstore', 'firebase-tools.json'),
  ].filter(Boolean);
  const configPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!configPath) throw new Error('Run firebase login first.');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return config.tokens;
}

async function getAccessToken() {
  const tokens = loadFirebaseCliTokens();
  if (tokens.expires_at > Date.now() + 60_000) return tokens.access_token;
  const oauth2 = new OAuth2Client(FIREBASE_CLI_CLIENT_ID);
  oauth2.setCredentials({ refresh_token: tokens.refresh_token });
  const refreshed = await oauth2.getAccessToken();
  if (!refreshed.token) throw new Error('Firebase CLI session expired. Run firebase login again.');
  return refreshed.token;
}

async function getAuthClient() {
  const token = await getAccessToken();
  const oauth2 = new OAuth2Client(FIREBASE_CLI_CLIENT_ID);
  oauth2.setCredentials({ access_token: token });
  return oauth2;
}

async function findAuthUidByEmail(email) {
  const tmp = path.join(__dirname, '_accept-invite-auth.json');
  const { execSync } = require('child_process');
  execSync(
    `firebase auth:export "${tmp}" --project ${PROJECT_ID}`,
    { stdio: 'pipe', cwd: path.join(__dirname, '..') },
  );
  const auth = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  fs.unlinkSync(tmp);
  const user = auth.users.find((u) => (u.email || '').toLowerCase() === email);
  if (!user) throw new Error(`No Auth user for ${email}`);
  return user.localId;
}

async function main() {
  const authClient = await getAuthClient();
  const db = new Firestore({ projectId: PROJECT_ID, authClient });
  const uid = await findAuthUidByEmail(emailArg);

  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) throw new Error(`No Firestore profile for ${emailArg}`);
  const user = userSnap.data();
  if (user.teamId) {
    console.log('Already on team:', user.teamId, 'role:', user.teamRole);
    return;
  }

  const inviteSnap = await db.collection('teamInvites')
    .where('email', '==', emailArg)
    .where('status', '==', 'pending')
    .limit(5)
    .get();

  if (inviteSnap.empty) throw new Error('No pending invite found for this email');

  const inviteDoc = inviteSnap.docs[0];
  const invite = inviteDoc.data();
  const teamRef = db.collection('teams').doc(invite.teamId);
  const memberRef = teamRef.collection('members').doc(uid);
  const displayName = user.fullName || emailArg;

  await db.runTransaction(async (tx) => {
    const teamSnap = await tx.get(teamRef);
    if (!teamSnap.exists) throw new Error('Team not found');

    const teamData = teamSnap.data();
    const seatsUsed = teamData.seats?.used ?? teamData.memberCount ?? 0;
    const seatsPurchased = teamData.seats?.purchased ?? 1;
    if (seatsUsed >= seatsPurchased) throw new Error('Team has no available seats');

    const memberSnap = await tx.get(memberRef);
    if (!memberSnap.exists || memberSnap.data().status !== 'active') {
      tx.set(memberRef, {
        uid,
        email: emailArg,
        displayName,
        role: invite.role || 'agent',
        status: 'active',
        joinedAt: FieldValue.serverTimestamp(),
      });

      tx.set(db.collection('users').doc(uid), {
        teamId: invite.teamId,
        teamRole: invite.role || 'agent',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      tx.set(teamRef, {
        memberCount: FieldValue.increment(1),
        seats: { purchased: seatsPurchased, used: seatsUsed + 1 },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    tx.set(inviteDoc.ref, {
      status: 'accepted',
      acceptedByUid: uid,
      acceptedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  console.log(`Added ${emailArg} to ${invite.teamName} (${invite.teamId}) as ${invite.role || 'agent'}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
