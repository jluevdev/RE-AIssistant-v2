import { useEffect, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';

const ROW_LIMIT = 500;

function mapSnapshot(snapshot) {
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

function isIndexError(error) {
  const code = error?.code || '';
  const message = String(error?.message || '');
  return code === 'failed-precondition' && message.toLowerCase().includes('index');
}

function subscribeCollection(collectionName, field, uid, orderField) {
  return ({ onData, onError }) => {
    if (!uid) {
      onData([]);
      return () => {};
    }

    let unsubscribe = () => {};
    let usingFallback = false;

    const indexedQuery = query(
      collection(db, collectionName),
      where(field, '==', uid),
      orderBy(orderField, 'desc'),
      limit(ROW_LIMIT)
    );

    const startFallback = () => {
      usingFallback = true;
      const fallbackQuery = query(collection(db, collectionName), where(field, '==', uid));
      unsubscribe = onSnapshot(
        fallbackQuery,
        (snapshot) => onData(mapSnapshot(snapshot)),
        (error) => {
          console.error(`Dashboard ${collectionName} fallback error:`, error);
          onError?.(error);
        }
      );
    };

    unsubscribe = onSnapshot(
      indexedQuery,
      (snapshot) => onData(mapSnapshot(snapshot)),
      (error) => {
        if (!usingFallback && isIndexError(error)) {
          unsubscribe();
          startFallback();
          return;
        }
        console.error(`Dashboard ${collectionName} subscription error:`, error);
        onError?.(error);
      }
    );

    return unsubscribe;
  };
}

const SUBSCRIPTIONS = [
  { key: 'visitors', collection: 'openHouseVisitors', field: 'agentId', orderField: 'checkInTime' },
  { key: 'offers', collection: 'offers', field: 'ownerUid', orderField: 'createdAt' },
  { key: 'schedules', collection: 'buyerSchedules', field: 'ownerUid', orderField: 'createdAt' },
  { key: 'messages', collection: 'messages', field: 'agentUid', orderField: 'createdAt' },
  { key: 'contacts', collection: 'contacts', field: 'userId', orderField: 'updatedAt' },
  { key: 'openHouses', collection: 'openHouses', field: 'agentId', orderField: 'date' },
];

/**
 * Real-time owner-scoped dashboard source data (read-only).
 */
export default function useDashboardData() {
  const { currentUser } = useAuth();
  const [data, setData] = useState({
    visitors: [],
    offers: [],
    schedules: [],
    messages: [],
    contacts: [],
    openHouses: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const uid = currentUser?.uid;
    if (!uid) {
      setData({
        visitors: [],
        offers: [],
        schedules: [],
        messages: [],
        contacts: [],
        openHouses: [],
      });
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError(null);

    const parts = {
      visitors: [],
      offers: [],
      schedules: [],
      messages: [],
      contacts: [],
      openHouses: [],
    };

    const ready = new Set();
    const total = SUBSCRIPTIONS.length;

    const emit = () => {
      if (ready.size < total) return;
      setData({ ...parts });
      setLoading(false);
    };

    const unsubs = SUBSCRIPTIONS.map(({ key, collection: name, field, orderField }) =>
      subscribeCollection(name, field, uid, orderField)({
        onData: (rows) => {
          parts[key] = rows;
          ready.add(key);
          emit();
        },
        onError: (err) => {
          setError(err);
          ready.add(key);
          emit();
        },
      })
    );

    return () => unsubs.forEach((unsub) => unsub());
  }, [currentUser?.uid]);

  return { data, loading, error };
}
