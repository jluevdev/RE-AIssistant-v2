import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { deriveContactsFromSources, mergeContacts } from './contactUtils';

/** One-time fetch of auto-population sources for the signed-in agent. */
export async function fetchContactSources(uid) {
  const [
    visitorsSnap,
    offersSnap,
    schedulesSnap,
    messagesSnap,
    openHousesSnap,
  ] = await Promise.all([
    getDocs(query(collection(db, 'openHouseVisitors'), where('agentId', '==', uid))),
    getDocs(query(collection(db, 'offers'), where('ownerUid', '==', uid))),
    getDocs(query(collection(db, 'buyerSchedules'), where('ownerUid', '==', uid))),
    getDocs(query(collection(db, 'messages'), where('agentUid', '==', uid))),
    getDocs(query(collection(db, 'openHouses'), where('agentId', '==', uid))),
  ]);

  const visitors = visitorsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const offers = offersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const schedules = schedulesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const messages = messagesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const embeddedVisitors = [];
  for (const ohDoc of openHousesSnap.docs) {
    const data = ohDoc.data();
    for (const visitor of data.visitors || []) {
      embeddedVisitors.push({
        ...visitor,
        openHouseId: ohDoc.id,
        agentId: data.agentId || uid,
      });
    }
  }

  return { visitors, embeddedVisitors, offers, schedules, messages };
}

export function planContactSync(existingContacts, sources) {
  const derived = deriveContactsFromSources(sources);
  return mergeContacts(existingContacts, derived);
}
