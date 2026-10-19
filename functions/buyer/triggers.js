const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { admin } = require('../shared/admin');
const {
  enrichMissingListingContacts,
  targetsNeedReview,
  normalizeTourKind,
  publicListingStops,
} = require('./listingLinks');

function millis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return 0;
}

exports.enrichImportedListingContacts = onDocumentUpdated(
  {
    document: 'buyerSchedules/{scheduleId}',
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (event) => {
    const afterSnap = event.data?.after;
    if (!afterSnap?.exists) return;
    const after = afterSnap.data() || {};
    if (after.lastImportSource !== 'portal') return;

    const lastImportAt = millis(after.lastImportAt);
    const contactEnrichAt = millis(after.contactEnrichAt);
    if (contactEnrichAt && lastImportAt && contactEnrichAt >= lastImportAt) return;

    const { targets, changed } = await enrichMissingListingContacts(
      after.targets,
      normalizeTourKind(after.tourKind),
    );
    const nextTargets = changed ? targets : after.targets;
    await afterSnap.ref.set({
      targets: nextTargets,
      needsReview: targetsNeedReview(nextTargets),
      contactEnrichAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    if (changed && after.shareTokenId) {
      await admin.firestore().collection('clientPlanTokens').doc(after.shareTokenId).set({
        publicListings: publicListingStops(nextTargets),
      }, { merge: true });
    }
  },
);
