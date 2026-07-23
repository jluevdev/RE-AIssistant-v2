const { onCall, HttpsError } = require('firebase-functions/v2/https');
const sendgrid = require('@sendgrid/mail');
const { admin } = require('../shared/admin');
const { getUserTeamIdOrNull } = require('../shared/team');

function assertOwner(offer, uid) {
  if (offer.ownerUid && offer.ownerUid !== uid) {
    throw new HttpsError('permission-denied', 'Not allowed');
  }
}

exports.getOfferAttachments = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }
    const { offerId } = request.data || {};
    if (!offerId) {
      throw new HttpsError('invalid-argument', 'offerId required');
    }

    const docSnap = await admin.firestore().collection('offers').doc(offerId).get();
    if (!docSnap.exists) {
      throw new HttpsError('not-found', 'Offer not found');
    }
    const offer = docSnap.data();
    assertOwner(offer, request.auth.uid);

    const bucket = admin.storage().bucket();
    const prefix = `offers/${offerId}/`;
    const [files] = await bucket.getFiles({ prefix });
    const attachments = [];

    for (const file of files) {
      if (file.name.endsWith('/')) continue;
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000,
      });
      const [meta] = await file.getMetadata();
      attachments.push({
        name: file.name.substring(prefix.length),
        url,
        contentType: meta.contentType || null,
        size: Number(meta.size || 0),
      });
    }

    return { success: true, attachments };
  } catch (error) {
    console.error('getOfferAttachments error:', error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Failed to get attachments');
  }
});

exports.setOfferStatus = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }
    const { offerId, status, note } = request.data || {};
    if (!offerId || !status) {
      throw new HttpsError('invalid-argument', 'offerId and status are required');
    }

    const db = admin.firestore();
    const offerRef = db.collection('offers').doc(offerId);
    const snap = await offerRef.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Offer not found');
    }
    assertOwner(snap.data(), request.auth.uid);

    const now = admin.firestore.FieldValue.serverTimestamp();
    await offerRef.collection('events').doc().set({
      status,
      note: note || null,
      actorUid: request.auth.uid,
      actorEmail: request.auth.token.email || null,
      createdAt: now,
    });
    await offerRef.update({ status, updatedAt: now });

    return { success: true };
  } catch (error) {
    console.error('setOfferStatus error:', error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Failed to update status');
  }
});

exports.getOfferTimeline = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }
    const { offerId } = request.data || {};
    if (!offerId) {
      throw new HttpsError('invalid-argument', 'offerId required');
    }

    const offerRef = admin.firestore().collection('offers').doc(offerId);
    const snap = await offerRef.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Offer not found');
    }
    assertOwner(snap.data(), request.auth.uid);

    const eventsSnap = await offerRef.collection('events').orderBy('createdAt', 'asc').get();
    const events = [];
    eventsSnap.forEach((d) => events.push({ id: d.id, ...d.data() }));
    return { success: true, events };
  } catch (error) {
    console.error('getOfferTimeline error:', error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Failed to get timeline');
  }
});

exports.addOfferNote = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }
    const { offerId, note } = request.data || {};
    if (!offerId || !note) {
      throw new HttpsError('invalid-argument', 'offerId and note are required');
    }

    const offerRef = admin.firestore().collection('offers').doc(offerId);
    const snap = await offerRef.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Offer not found');
    }
    assertOwner(snap.data(), request.auth.uid);

    await offerRef.collection('events').add({
      type: 'note',
      note,
      actorUid: request.auth.uid,
      actorEmail: request.auth.token.email || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true };
  } catch (error) {
    console.error('addOfferNote error:', error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Failed to add note');
  }
});

exports.submitOfferInit = onCall(async (request) => {
  try {
    const { hubSlug, meta, filenames = [] } = request.data || {};
    if (!hubSlug) {
      throw new HttpsError('invalid-argument', 'hubSlug required');
    }

    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    let listingId = null;
    let ownerUid = null;
    let agentPhone = null;
    let agentEmail = null;

    try {
      const listingSnap = await db.collection('listings').where('hubSlug', '==', hubSlug).limit(1).get();
      if (!listingSnap.empty) {
        const listingDoc = listingSnap.docs[0];
        listingId = listingDoc.id;
        const data = listingDoc.data();
        ownerUid = data.ownerUid || null;
        agentPhone = data.agentPhone || null;
        agentEmail = data.agentEmail || null;
      }
    } catch (lookupError) {
      console.warn('lookup listing by hubSlug failed (continuing):', lookupError?.message);
    }

    const ownerTeamId = await getUserTeamIdOrNull(ownerUid);
    const offerRef = await db.collection('offers').add({
      hubSlug,
      meta: meta || {},
      status: 'received',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      files: [],
      finalized: false,
      listingId,
      ownerUid,
      teamId: ownerTeamId || null,
      agentPhone,
      agentEmail,
    });

    const uploadUrls = [];
    for (let i = 0; i < filenames.length; i++) {
      const fileMeta = filenames[i];
      const key = `offers/${offerRef.id}/${encodeURIComponent(fileMeta.name || `file-${i}`)}`;
      const [url] = await bucket.file(key).getSignedUrl({
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000,
        contentType: fileMeta.type || 'application/octet-stream',
      });
      uploadUrls.push(url);
    }

    return { success: true, offerId: offerRef.id, uploadUrls };
  } catch (error) {
    console.error('submitOfferInit error:', error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Failed to init offer');
  }
});

exports.submitOfferFinalize = onCall(async (request) => {
  try {
    const { offerId } = request.data || {};
    if (!offerId) {
      throw new HttpsError('invalid-argument', 'offerId required');
    }

    const db = admin.firestore();
    const docRef = db.collection('offers').doc(offerId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      throw new HttpsError('not-found', 'offer not found');
    }

    const offer = docSnap.data();
    await docRef.update({
      finalized: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const m = offer.meta || {};
    const summary = `Offer received for ${offer.hubSlug}\nPrice: ${m.price || 'N/A'}\nFinancing: ${m.financing || 'N/A'}\nConcessions: ${m.concessions || 'N/A'}\nClose: ${m.closeDate || 'N/A'}\nContingencies: ${m.contingencies || 'N/A'}\nAgent: ${m.buyerAgentName || ''} ${m.buyerAgentPhone || ''}`;

    try {
      await db.collection('notifications').add({
        type: 'offer_received',
        offerId,
        hubSlug: offer.hubSlug,
        ownerUid: offer.ownerUid || null,
        message: summary,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
      });
    } catch (notificationError) {
      console.warn('notification insert failed (continuing):', notificationError?.message);
    }

    try {
      const { getTwilioClient, getTwilioFromNumber } = require('../shared/twilio');
      const to = offer.agentPhone || null;
      if (to) {
        await getTwilioClient().messages.create({
          body: `RE AIssistant: ${summary}`,
          from: getTwilioFromNumber(),
          to,
        });
      }
    } catch (smsError) {
      console.warn('offer finalize SMS failed (continuing):', smsError?.message);
    }

    try {
      if (offer.agentEmail && process.env.SENDGRID_API_KEY) {
        sendgrid.setApiKey(process.env.SENDGRID_API_KEY);
        const fromEmail = process.env.SEND_FROM_EMAIL || 'no-reply@reaissistant.com';
        const frontendUrl = process.env.FRONTEND_URL || 'https://reaiassistant-27241.web.app';
        await sendgrid.send({
          to: offer.agentEmail,
          from: { email: fromEmail, name: 'RE AIssistant' },
          subject: `Offer Received — ${offer.hubSlug}`,
          text: summary,
          html: `<p>New offer received for <strong>${offer.hubSlug}</strong>.</p><p><a href="${frontendUrl}/offers/${offerId}">View offer</a></p>`,
        });
      }
    } catch (emailError) {
      console.warn('offer finalize email failed (continuing):', emailError?.message);
    }

    return { success: true };
  } catch (error) {
    console.error('submitOfferFinalize error:', error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Failed to finalize offer');
  }
});
