const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { admin } = require('../shared/admin');
const { getFrontendUrl } = require('../billing/stripe');
const { sendEmail } = require('../shared/email');
const {
  db,
  ROLES,
  normalizeEmail,
  generateToken,
  getUserDoc,
  getTeam,
  requireTeamRole,
  inviteExpiryDate,
  isInviteExpired,
} = require('./helpers');

const FieldValue = admin.firestore.FieldValue;

function assertRole(role) {
  if (!ROLES.includes(role) || role === 'owner') {
    throw new HttpsError('invalid-argument', 'Invalid invite role');
  }
}

exports.createTeam = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be authenticated');

  const uid = request.auth.uid;
  const { name, brokerage } = request.data || {};
  const teamName = String(name || '').trim();
  if (!teamName) throw new HttpsError('invalid-argument', 'Team name is required');

  const user = await getUserDoc(uid);
  if (user.teamId) {
    throw new HttpsError('failed-precondition', 'You are already on a team');
  }

  const teamRef = db.collection('teams').doc();
  const now = FieldValue.serverTimestamp();
  const displayName = user.fullName || request.auth.token.name || request.auth.token.email || 'Agent';

  await db.runTransaction(async (tx) => {
    tx.set(teamRef, {
      name: teamName,
      brokerage: String(brokerage || '').trim(),
      ownerUid: uid,
      createdAt: now,
      updatedAt: now,
      memberCount: 1,
      seats: { purchased: 1, used: 1 },
      billing: {
        plan: null,
        status: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
      },
      settings: {
        shareListingsByDefault: true,
        shareOffersByDefault: true,
      },
    });

    tx.set(teamRef.collection('members').doc(uid), {
      uid,
      email: normalizeEmail(request.auth.token.email),
      displayName,
      role: 'owner',
      status: 'active',
      joinedAt: now,
    });

    tx.set(db.collection('users').doc(uid), {
      teamId: teamRef.id,
      teamRole: 'owner',
      updatedAt: now,
    }, { merge: true });
  });

  return { success: true, teamId: teamRef.id, name: teamName };
});

exports.inviteMember = onCall({ secrets: ['FRONTEND_URL'] }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be authenticated');

  const uid = request.auth.uid;
  const { email, role = 'agent' } = request.data || {};
  const inviteEmail = normalizeEmail(email);
  if (!inviteEmail) throw new HttpsError('invalid-argument', 'Email is required');
  assertRole(role);

  const user = await getUserDoc(uid);
  if (!user.teamId) throw new HttpsError('failed-precondition', 'You are not on a team');
  await requireTeamRole(uid, user.teamId, ['owner', 'admin']);

  const team = await getTeam(user.teamId);
  const seatsUsed = team.seats?.used ?? team.memberCount ?? 0;
  const seatsPurchased = team.seats?.purchased ?? 1;

  const pendingSnap = await db.collection('teamInvites')
    .where('teamId', '==', user.teamId)
    .where('email', '==', inviteEmail)
    .where('status', '==', 'pending')
    .limit(1)
    .get();

  if (!pendingSnap.empty) {
    const existing = pendingSnap.docs[0];
    const data = existing.data();
    const frontendUrl = getFrontendUrl().replace(/\/$/, '');
    return {
      success: true,
      inviteId: existing.id,
      inviteUrl: `${frontendUrl}/join/${data.token}`,
      alreadyPending: true,
    };
  }

  if (seatsUsed >= seatsPurchased) {
    throw new HttpsError(
      'resource-exhausted',
      'No seats available. Add seats in billing before inviting more members.'
    );
  }

  const token = generateToken();
  const inviteRef = db.collection('teamInvites').doc();
  const now = FieldValue.serverTimestamp();
  const inviterName = user.fullName || request.auth.token.email || 'Your team admin';

  await inviteRef.set({
    teamId: user.teamId,
    teamName: team.name,
    email: inviteEmail,
    role,
    status: 'pending',
    token,
    invitedByUid: uid,
    invitedByName: inviterName,
    createdAt: now,
    expiresAt: inviteExpiryDate(),
  });

  const frontendUrl = getFrontendUrl().replace(/\/$/, '');
  const inviteUrl = `${frontendUrl}/join/${token}`;

  try {
    await sendEmail({
      to: inviteEmail,
      subject: `Join ${team.name} on RE AIssistant`,
      text: `${inviterName} invited you to join ${team.name} on RE AIssistant.\n\nAccept your invite: ${inviteUrl}\n\nThis link expires in 7 days.`,
    });
  } catch (emailError) {
    console.warn('inviteMember email not sent:', emailError.message);
  }

  return { success: true, inviteId: inviteRef.id, inviteUrl };
});

exports.acceptInvite = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be authenticated');

  const uid = request.auth.uid;
  const { token } = request.data || {};
  if (!token) throw new HttpsError('invalid-argument', 'Invite token is required');

  const user = await getUserDoc(uid);
  if (user.teamId) {
    throw new HttpsError('failed-precondition', 'You are already on a team');
  }

  const inviteSnap = await db.collection('teamInvites')
    .where('token', '==', String(token))
    .limit(1)
    .get();

  if (inviteSnap.empty) throw new HttpsError('not-found', 'Invite not found');

  const inviteDoc = inviteSnap.docs[0];
  const invite = inviteDoc.data();

  if (invite.status === 'accepted') {
    if (user.teamId === invite.teamId) {
      return { success: true, teamId: invite.teamId, teamName: invite.teamName, alreadyMember: true };
    }
    throw new HttpsError('failed-precondition', 'This invite was already used');
  }

  if (invite.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'This invite is no longer valid');
  }

  if (isInviteExpired(invite)) {
    await inviteDoc.ref.set({ status: 'expired', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    throw new HttpsError('deadline-exceeded', 'This invite has expired');
  }

  const userEmail = normalizeEmail(request.auth.token.email);
  if (invite.email && userEmail && invite.email !== userEmail) {
    throw new HttpsError(
      'permission-denied',
      'This invite was sent to a different email address. Sign in with the invited email.'
    );
  }

  const teamRef = db.collection('teams').doc(invite.teamId);
  const now = FieldValue.serverTimestamp();
  const displayName = user.fullName || request.auth.token.name || userEmail || 'Agent';

  await db.runTransaction(async (tx) => {
    const teamSnap = await tx.get(teamRef);
    if (!teamSnap.exists) throw new HttpsError('not-found', 'Team not found');

    const teamData = teamSnap.data();
    const seatsUsed = teamData.seats?.used ?? teamData.memberCount ?? 0;
    const seatsPurchased = teamData.seats?.purchased ?? 1;
    if (seatsUsed >= seatsPurchased) {
      throw new HttpsError('resource-exhausted', 'Team has no available seats');
    }

    const memberRef = teamRef.collection('members').doc(uid);
    const memberSnap = await tx.get(memberRef);
    if (memberSnap.exists && memberSnap.data().status === 'active') {
      return;
    }

    tx.set(memberRef, {
      uid,
      email: userEmail,
      displayName,
      role: invite.role || 'agent',
      status: 'active',
      joinedAt: now,
    });

    tx.set(db.collection('users').doc(uid), {
      teamId: invite.teamId,
      teamRole: invite.role || 'agent',
      updatedAt: now,
    }, { merge: true });

    tx.set(teamRef, {
      memberCount: FieldValue.increment(1),
      seats: { purchased: seatsPurchased, used: seatsUsed + 1 },
      updatedAt: now,
    }, { merge: true });

    tx.set(inviteDoc.ref, {
      status: 'accepted',
      acceptedByUid: uid,
      acceptedAt: now,
      updatedAt: now,
    }, { merge: true });
  });

  return {
    success: true,
    teamId: invite.teamId,
    teamName: invite.teamName,
    teamRole: invite.role || 'agent',
  };
});

exports.revokeInvite = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be authenticated');

  const { inviteId } = request.data || {};
  if (!inviteId) throw new HttpsError('invalid-argument', 'inviteId is required');

  const uid = request.auth.uid;
  const user = await getUserDoc(uid);
  if (!user.teamId) throw new HttpsError('failed-precondition', 'You are not on a team');
  await requireTeamRole(uid, user.teamId, ['owner', 'admin']);

  const inviteRef = db.collection('teamInvites').doc(inviteId);
  const inviteSnap = await inviteRef.get();
  if (!inviteSnap.exists) throw new HttpsError('not-found', 'Invite not found');
  if (inviteSnap.data().teamId !== user.teamId) {
    throw new HttpsError('permission-denied', 'Invite belongs to another team');
  }

  await inviteRef.set({
    status: 'revoked',
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { success: true };
});

exports.removeMember = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be authenticated');

  const { uid: targetUid } = request.data || {};
  if (!targetUid) throw new HttpsError('invalid-argument', 'Member uid is required');

  const uid = request.auth.uid;
  const user = await getUserDoc(uid);
  if (!user.teamId) throw new HttpsError('failed-precondition', 'You are not on a team');
  await requireTeamRole(uid, user.teamId, ['owner', 'admin']);

  if (targetUid === uid) {
    throw new HttpsError('invalid-argument', 'Use leaveTeam to remove yourself');
  }

  const teamRef = db.collection('teams').doc(user.teamId);
  const memberRef = teamRef.collection('members').doc(targetUid);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) throw new HttpsError('not-found', 'Member not found');

  const member = memberSnap.data();
  if (member.role === 'owner') {
    throw new HttpsError('permission-denied', 'Cannot remove the team owner');
  }

  await db.runTransaction(async (tx) => {
    const teamSnap = await tx.get(teamRef);
    const teamData = teamSnap.data() || {};
    const seatsUsed = Math.max(0, (teamData.seats?.used ?? teamData.memberCount ?? 1) - 1);

    tx.set(memberRef, { status: 'removed', removedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(db.collection('users').doc(targetUid), {
      teamId: null,
      teamRole: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(teamRef, {
      memberCount: FieldValue.increment(-1),
      seats: {
        purchased: teamData.seats?.purchased ?? 1,
        used: seatsUsed,
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return { success: true };
});

exports.changeMemberRole = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be authenticated');

  const { uid: targetUid, role } = request.data || {};
  if (!targetUid || !role) throw new HttpsError('invalid-argument', 'uid and role are required');
  if (!ROLES.includes(role) || role === 'owner') {
    throw new HttpsError('invalid-argument', 'Invalid role');
  }

  const uid = request.auth.uid;
  const user = await getUserDoc(uid);
  if (!user.teamId) throw new HttpsError('failed-precondition', 'You are not on a team');
  await requireTeamRole(uid, user.teamId, ['owner', 'admin']);

  const teamRef = db.collection('teams').doc(user.teamId);
  const memberRef = teamRef.collection('members').doc(targetUid);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists || memberSnap.data().status !== 'active') {
    throw new HttpsError('not-found', 'Active member not found');
  }
  if (memberSnap.data().role === 'owner') {
    throw new HttpsError('permission-denied', 'Cannot change the owner role');
  }

  await memberRef.set({ role, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await db.collection('users').doc(targetUid).set({
    teamRole: role,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { success: true };
});

exports.leaveTeam = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be authenticated');

  const uid = request.auth.uid;
  const user = await getUserDoc(uid);
  if (!user.teamId) throw new HttpsError('failed-precondition', 'You are not on a team');
  if (user.teamRole === 'owner') {
    throw new HttpsError('failed-precondition', 'Owners cannot leave. Transfer ownership or delete the team first.');
  }

  const teamRef = db.collection('teams').doc(user.teamId);
  const memberRef = teamRef.collection('members').doc(uid);

  await db.runTransaction(async (tx) => {
    const teamSnap = await tx.get(teamRef);
    const teamData = teamSnap.data() || {};
    const seatsUsed = Math.max(0, (teamData.seats?.used ?? teamData.memberCount ?? 1) - 1);

    tx.set(memberRef, { status: 'removed', removedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(db.collection('users').doc(uid), {
      teamId: null,
      teamRole: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(teamRef, {
      memberCount: FieldValue.increment(-1),
      seats: {
        purchased: teamData.seats?.purchased ?? 1,
        used: seatsUsed,
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return { success: true };
});

exports.createTeamCheckoutSession = onCall(
  { secrets: ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_PREMIUM_TEAM', 'FRONTEND_URL'] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be authenticated');

    const uid = request.auth.uid;
    const { seats: rawSeats, teamId } = request.data || {};
    const seats = Math.max(1, Math.min(100, Number(rawSeats) || 1));

    const user = await getUserDoc(uid);
    const resolvedTeamId = teamId || user.teamId;
    if (!resolvedTeamId) throw new HttpsError('failed-precondition', 'Team id required');
    await requireTeamRole(uid, resolvedTeamId, ['owner']);

    const team = await getTeam(resolvedTeamId);
    const priceId = process.env.STRIPE_PRICE_PREMIUM_TEAM;
    if (!priceId) {
      throw new HttpsError('failed-precondition', 'Team billing is not configured (STRIPE_PRICE_PREMIUM_TEAM)');
    }

    const userEmail = request.auth.token.email;
    if (!userEmail) throw new HttpsError('failed-precondition', 'Signed-in user must have an email');

    const { getStripe } = require('../billing/stripe');
    const stripe = getStripe();
    const frontendUrl = getFrontendUrl();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: seats }],
      mode: 'subscription',
      success_url: `${frontendUrl}/team?checkout=success`,
      cancel_url: `${frontendUrl}/team`,
      customer_email: userEmail,
      client_reference_id: uid,
      metadata: {
        userId: uid,
        teamId: resolvedTeamId,
        kind: 'team',
        seats: String(seats),
        planName: 'Premium Team',
        planKey: 'premiumTeam',
      },
      subscription_data: {
        metadata: {
          userId: uid,
          teamId: resolvedTeamId,
          kind: 'team',
          seats: String(seats),
          planName: 'Premium Team',
          planKey: 'premiumTeam',
        },
        trial_period_days: 7,
      },
    });

    return { success: true, url: session.url, sessionId: session.id };
  }
);
