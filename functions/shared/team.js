const { admin } = require('./admin');

async function getUserTeamIdOrNull(userUid) {
  try {
    if (!userUid) return null;
    const snap = await admin.firestore().collection('users').doc(userUid).get();
    return snap.exists ? (snap.data().teamId || null) : null;
  } catch {
    return null;
  }
}

module.exports = { getUserTeamIdOrNull };
