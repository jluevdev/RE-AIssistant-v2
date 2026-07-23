const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { admin } = require('../shared/admin');

const db = admin.firestore();
const ROLES = ['owner', 'admin', 'agent'];
const INVITE_TTL_DAYS = 7;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function getUserDoc(uid) {
  if (!uid) throw new HttpsError('invalid-argument', 'User id required');
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'User profile not found');
  return { uid, ...snap.data() };
}

async function getTeam(teamId) {
  const ref = db.collection('teams').doc(teamId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Team not found');
  return { ref, id: teamId, ...snap.data() };
}

async function requireTeamRole(uid, teamId, allowedRoles) {
  const user = await getUserDoc(uid);
  if (user.teamId !== teamId || !allowedRoles.includes(user.teamRole)) {
    throw new HttpsError('permission-denied', 'Insufficient team permissions');
  }
  return user;
}

function inviteExpiryDate() {
  return admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
  );
}

function isInviteExpired(invite) {
  const expiresAt = invite.expiresAt?.toDate?.() || invite.expiresAt;
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

module.exports = {
  db,
  ROLES,
  INVITE_TTL_DAYS,
  normalizeEmail,
  generateToken,
  getUserDoc,
  getTeam,
  requireTeamRole,
  inviteExpiryDate,
  isInviteExpired,
};
