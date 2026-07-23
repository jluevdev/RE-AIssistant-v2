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

function subscribeByTeamId(collectionName, teamId, orderField, onData, onError) {
  if (!teamId) {
    onData([]);
    return () => {};
  }

  let unsubscribe = () => {};
  let usingFallback = false;

  const indexedQuery = query(
    collection(db, collectionName),
    where('teamId', '==', teamId),
    orderBy(orderField, 'desc'),
    limit(ROW_LIMIT)
  );

  const startFallback = () => {
    usingFallback = true;
    unsubscribe = onSnapshot(
      query(collection(db, collectionName), where('teamId', '==', teamId)),
      (snapshot) => onData(mapSnapshot(snapshot)),
      (error) => onError?.(error)
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
      onError?.(error);
    }
  );

  return unsubscribe;
}

/**
 * Team-scoped dashboard data (shared offers, open houses, messages, visitors).
 */
export default function useTeamDashboardData(teamId) {
  const [data, setData] = useState({
    visitors: [],
    offers: [],
    schedules: [],
    messages: [],
    contacts: [],
    openHouses: [],
  });
  const [loading, setLoading] = useState(Boolean(teamId));
  const [error, setError] = useState(null);
  const [indexPending, setIndexPending] = useState(false);

  useEffect(() => {
    if (!teamId) {
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
    setIndexPending(false);

    const parts = {
      offers: [],
      messages: [],
      openHouses: [],
      visitors: [],
    };
    const ready = new Set();
    const cleanups = [];

    const maybeEmit = () => {
      if (!ready.has('offers') || !ready.has('messages') || !ready.has('openHouses')) return;
      setData({
        offers: parts.offers,
        messages: parts.messages,
        openHouses: parts.openHouses,
        visitors: parts.visitors,
        schedules: [],
        contacts: [],
      });
      setLoading(false);
    };

    cleanups.push(
      subscribeByTeamId(
        'offers',
        teamId,
        'createdAt',
        (rows) => {
          parts.offers = rows;
          ready.add('offers');
          maybeEmit();
        },
        (err) => {
          setError(err);
          setIndexPending(true);
          ready.add('offers');
          maybeEmit();
        }
      )
    );

    cleanups.push(
      subscribeByTeamId(
        'messages',
        teamId,
        'createdAt',
        (rows) => {
          parts.messages = rows;
          ready.add('messages');
          maybeEmit();
        },
        (err) => {
          setError(err);
          setIndexPending(true);
          ready.add('messages');
          maybeEmit();
        }
      )
    );

    cleanups.push(
      subscribeByTeamId(
        'openHouses',
        teamId,
        'date',
        (rows) => {
          parts.openHouses = rows;
          ready.add('openHouses');

          const openHouseIds = rows.map((r) => r.id);
          if (!openHouseIds.length) {
            parts.visitors = [];
            maybeEmit();
            return;
          }

          const visitorParts = {};
          let visitorReady = 0;
          const emitVisitors = () => {
            if (visitorReady < openHouseIds.length) return;
            parts.visitors = Object.values(visitorParts).flat();
            maybeEmit();
          };

          for (const openHouseId of openHouseIds.slice(0, 15)) {
            const visitorQuery = query(
              collection(db, 'openHouseVisitors'),
              where('openHouseId', '==', openHouseId),
              orderBy('checkInTime', 'desc'),
              limit(100)
            );

            cleanups.push(
              onSnapshot(
                visitorQuery,
                (snap) => {
                  visitorParts[openHouseId] = mapSnapshot(snap);
                  visitorReady = Object.keys(visitorParts).length;
                  emitVisitors();
                },
                (err) => {
                  if (isIndexError(err)) {
                    cleanups.push(
                      onSnapshot(
                        query(
                          collection(db, 'openHouseVisitors'),
                          where('openHouseId', '==', openHouseId)
                        ),
                        (snap) => {
                          visitorParts[openHouseId] = mapSnapshot(snap);
                          visitorReady = Object.keys(visitorParts).length;
                          emitVisitors();
                        },
                        (e) => setError(e)
                      )
                    );
                    return;
                  }
                  setError(err);
                }
              )
            );
          }

          maybeEmit();
        },
        (err) => {
          setError(err);
          setIndexPending(true);
          ready.add('openHouses');
          maybeEmit();
        }
      )
    );

    return () => cleanups.forEach((unsub) => unsub && unsub());
  }, [teamId]);

  return { data, loading, error, indexPending };
}
