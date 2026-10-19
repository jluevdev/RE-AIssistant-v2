import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { formatHouseholdLabel, normalizeBuyers } from './buyerHousehold';

function buildMapsDirectionsUrl(stops) {
  const encoded = stops.map((stop) => encodeURIComponent(stop)).filter(Boolean);
  if (encoded.length === 0) return null;
  if (encoded.length === 1) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encoded[0]}`;
  }
  const origin = encoded[0];
  const destination = encoded[encoded.length - 1];
  const waypoints = encoded.slice(1, -1).join('|');
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${waypoints}` : ''}`;
}

export async function saveBuyerTourOffline({
  scheduleId,
  availability,
  targets,
  buyers,
  agentName,
  ownerUid,
  teamId,
  tourKind = 'sale',
}) {
  const household = normalizeBuyers(buyers);
  const householdLabel = formatHouseholdLabel(household);
      const normalizedTargets = (targets || [])
    .map((target, index) => ({
      id: target?.id || `target-${index + 1}`,
      address: String(target?.address || '').trim(),
      listingAgentPhone: String(target?.listingAgentPhone || '').trim(),
      listingAgentName: String(target?.listingAgentName || '').trim(),
      listingAgentEmail: String(target?.listingAgentEmail || '').trim(),
      brokerage: String(target?.brokerage || '').trim(),
      dreNumber: String(target?.dreNumber || '').trim(),
      mlsNumber: String(target?.mlsNumber || '').trim(),
      sourceUrl: String(target?.sourceUrl || '').trim(),
      photoUrl: String(target?.photoUrl || '').trim(),
      note: String(target?.note || '').trim(),
      parseStatus: target?.parseStatus || null,
      phoneSource: target?.phoneSource === 'web_search' ? 'web_search' : '',
      listingKind: target?.listingKind === 'rental' ? 'rental' : (target?.listingKind === 'sale' ? 'sale' : ''),
      contactRole: ['owner', 'property_manager', 'listing_agent'].includes(target?.contactRole)
        ? target.contactRole
        : '',
      status: 'pending',
      confirmed: false,
      lastInboundPreview: null,
      clientNote: String(target?.clientNote || '').trim(),
      clientRank: Number.isFinite(Number(target?.clientRank)) ? Number(target.clientRank) : null,
      clientInterest: target?.clientInterest === 'passed' ? 'passed' : 'interested',
    }))
    .filter((target) => target.address || target.listingAgentPhone);

  const orderedStops = normalizedTargets.map((target) => target.address).filter(Boolean);
  const mapsLink = buildMapsDirectionsUrl(orderedStops);
  const scheduleRef = scheduleId
    ? doc(db, 'buyerSchedules', scheduleId)
    : doc(collection(db, 'buyerSchedules'));

  const now = serverTimestamp();
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 48 * 60 * 60 * 1000));
  const publicBuyers = household.map((buyer) => ({
    name: buyer.name,
    role: buyer.role === 'co_borrower' ? 'co_borrower' : 'primary',
  }));

  await setDoc(scheduleRef, {
    ownerUid,
    teamId: teamId || null,
    agentName,
    buyers: household,
    buyerName: householdLabel,
    availability,
    targets: normalizedTargets,
    orderedStops,
    mapsLink,
    tourKind: tourKind === 'rental' ? 'rental' : 'sale',
    status: 'requests_sent',
    updatedAt: now,
    createdAt: now,
  }, { merge: true });

  const tokenRef = doc(collection(db, 'clientPlanTokens'));
  await setDoc(tokenRef, {
    scheduleId: scheduleRef.id,
    ownerUid,
    expiresAt,
    createdAt: now,
    publicPlan: {
      buyerName: householdLabel,
      agentName,
      buyers: publicBuyers,
      tourKind: tourKind === 'rental' ? 'rental' : 'sale',
      availability,
      orderedStops,
      mapsLink,
      stopCount: orderedStops.length,
      expiresAt: expiresAt.toDate().toISOString(),
    },
  });

  await setDoc(scheduleRef, { shareTokenId: tokenRef.id }, { merge: true });

  return {
    scheduleId: scheduleRef.id,
    shareLink: `${window.location.origin}/client/plan?t=${tokenRef.id}`,
    mapsLink,
    confirmations: normalizedTargets.map((target) => ({
      address: target.address,
      listingAgentPhone: target.listingAgentPhone,
      status: target.status,
      confirmed: false,
      lastInboundPreview: null,
    })),
  };
}
