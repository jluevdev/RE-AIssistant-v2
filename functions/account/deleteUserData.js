const { FieldValue } = require('firebase-admin/firestore');

const BATCH_SIZE = 400;

async function batchDeleteQuery(querySnap) {
  if (querySnap.empty) return 0;
  const db = querySnap.docs[0].ref.firestore;
  let deleted = 0;
  for (let i = 0; i < querySnap.docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = querySnap.docs.slice(i, i + BATCH_SIZE);
    chunk.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

async function deleteWhere(db, collectionName, field, value) {
  const snap = await db.collection(collectionName).where(field, '==', value).get();
  return batchDeleteQuery(snap);
}

async function deleteOffersForUser(db, uid) {
  const snap = await db.collection('offers').where('ownerUid', '==', uid).get();
  let deleted = 0;
  for (const offerDoc of snap.docs) {
    const eventsSnap = await offerDoc.ref.collection('events').get();
    deleted += await batchDeleteQuery(eventsSnap);
    await offerDoc.ref.delete();
    deleted += 1;
  }
  return deleted;
}

async function deleteAgentClients(db, uid) {
  const clientsSnap = await db.collection('agents').doc(uid).collection('clients').get();
  const deleted = await batchDeleteQuery(clientsSnap);
  await db.collection('agents').doc(uid).delete().catch(() => {});
  return deleted;
}

async function deleteOpenHousesForUser(db, uid) {
  const [byOwner, byAgent] = await Promise.all([
    db.collection('openHouses').where('ownerUid', '==', uid).get(),
    db.collection('openHouses').where('agentId', '==', uid).get(),
  ]);

  const openHouseIds = new Set();
  [...byOwner.docs, ...byAgent.docs].forEach((docSnap) => openHouseIds.add(docSnap.id));

  let deleted = 0;
  const relatedCollections = [
    'openHouseVisitors',
    'openHouseFeedback',
    'openHouseReminders',
    'flyerRequests',
  ];

  for (const openHouseId of openHouseIds) {
    for (const collectionName of relatedCollections) {
      deleted += await deleteWhere(db, collectionName, 'openHouseId', openHouseId);
    }
    await db.collection('openHouses').doc(openHouseId).delete();
    deleted += 1;
  }

  return deleted;
}

async function removeFromTeamIfMember(db, uid, user) {
  if (!user?.teamId) return;
  if (user.teamRole === 'owner') {
    const err = new Error('Team owners must transfer ownership or delete the team before deleting their account.');
    err.code = 'TEAM_OWNER';
    throw err;
  }

  const teamRef = db.collection('teams').doc(user.teamId);
  const memberRef = teamRef.collection('members').doc(uid);

  await db.runTransaction(async (tx) => {
    const teamSnap = await tx.get(teamRef);
    if (!teamSnap.exists) return;
    const teamData = teamSnap.data() || {};
    const seatsUsed = Math.max(0, (teamData.seats?.used ?? teamData.memberCount ?? 1) - 1);
    tx.set(memberRef, { status: 'removed', removedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(teamRef, {
      memberCount: FieldValue.increment(-1),
      seats: {
        purchased: teamData.seats?.purchased ?? 1,
        used: seatsUsed,
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

/**
 * Delete Firestore data for a user. Caller must delete Auth user after this.
 */
async function purgeUserData(db, uid, email) {
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.exists ? userSnap.data() : null;

  if (user?.teamRole === 'owner') {
    const err = new Error('Team owners must transfer ownership or delete the team before deleting their account.');
    err.code = 'TEAM_OWNER';
    throw err;
  }

  await removeFromTeamIfMember(db, uid, user);

  const counts = {};
  counts.openHouses = await deleteOpenHousesForUser(db, uid);
  counts.offers = await deleteOffersForUser(db, uid);
  counts.agentClients = await deleteAgentClients(db, uid);

  const tasks = [
    ['messages', 'agentUid', uid],
    ['listings', 'ownerUid', uid],
    ['buyerSchedules', 'ownerUid', uid],
    ['contacts', 'userId', uid],
    ['smsListings', 'userId', uid],
    ['scheduledTasks', 'ownerUid', uid],
    ['notifications', 'ownerUid', uid],
    ['appointments', 'userId', uid],
  ];

  for (const [collection, field, value] of tasks) {
    counts[collection] = (counts[collection] || 0) + (await deleteWhere(db, collection, field, value));
  }

  if (email) {
    const inviteSnap = await db.collection('teamInvites').where('email', '==', email).get();
    counts.teamInvites = await batchDeleteQuery(inviteSnap);
  }

  await db.collection('automationSettings').doc(uid).delete().catch(() => {});
  await db.collection('users').doc(uid).delete().catch(() => {});

  return counts;
}

module.exports = { purgeUserData, batchDeleteQuery, deleteWhere };
