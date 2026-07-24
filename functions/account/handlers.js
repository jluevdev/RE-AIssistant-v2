const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { admin } = require('../shared/admin');
const { purgeUserData } = require('./deleteUserData');

exports.deleteMyAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in');
  }

  const uid = request.auth.uid;
  const email = request.auth.token.email || null;
  const db = admin.firestore();

  try {
    const deletedCounts = await purgeUserData(db, uid, email);
    await admin.auth().deleteUser(uid);
    return { success: true, deletedCounts };
  } catch (error) {
    if (error.code === 'TEAM_OWNER') {
      throw new HttpsError(
        'failed-precondition',
        error.message || 'Team owners cannot delete their account while they own a team.',
      );
    }
    console.error('deleteMyAccount error:', error);
    throw new HttpsError('internal', 'Failed to delete account. Try again or contact support.');
  }
});
