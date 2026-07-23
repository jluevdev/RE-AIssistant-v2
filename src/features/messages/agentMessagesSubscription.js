import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

const MESSAGE_LIMIT = 300;

function mapSnapshot(snapshot) {
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

function sortAndLimit(messages) {
  return messages
    .slice()
    .sort((a, b) => {
      const aMs = a.createdAt?.toMillis?.() ?? 0;
      const bMs = b.createdAt?.toMillis?.() ?? 0;
      return bMs - aMs;
    })
    .slice(0, MESSAGE_LIMIT);
}

function mergeById(...lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const message of list) {
      byId.set(message.id, message);
    }
  }
  return Array.from(byId.values());
}

function isIndexError(error) {
  const code = error?.code || '';
  const message = String(error?.message || '');
  return code === 'failed-precondition' && message.toLowerCase().includes('index');
}

function subscribeQuery(db, field, value, { onData, onError, onIndexPending }) {
  let unsubscribe = () => {};
  let usingFallback = false;

  const indexedQuery = query(
    collection(db, 'messages'),
    where(field, '==', value),
    orderBy('createdAt', 'desc'),
    limit(MESSAGE_LIMIT)
  );

  const startFallback = () => {
    usingFallback = true;
    onIndexPending?.(true);

    const fallbackQuery = query(collection(db, 'messages'), where(field, '==', value));

    unsubscribe = onSnapshot(
      fallbackQuery,
      (snapshot) => onData(sortAndLimit(mapSnapshot(snapshot))),
      (error) => {
        console.error(`Messages ${field} fallback error:`, error);
        onError?.(error);
      }
    );
  };

  unsubscribe = onSnapshot(
    indexedQuery,
    (snapshot) => {
      onIndexPending?.(false);
      onData(mapSnapshot(snapshot));
    },
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
 * Real-time subscription to an agent's messages (by uid + email), merged and de-duped.
 */
export function subscribeToAgentMessages(
  db,
  { agentUid, agentEmail },
  { onData, onError, onIndexPending }
) {
  if (!agentUid && !agentEmail) {
    onData([]);
    return () => {};
  }

  const parts = {
    uid: [],
    email: [],
  };
  let indexPending = false;
  const unsubs = [];

  const emit = () => {
    onData(sortAndLimit(mergeById(parts.uid, parts.email)));
    onIndexPending?.(indexPending);
  };

  const trackIndex = (pending) => {
    if (pending) indexPending = true;
    onIndexPending?.(indexPending);
  };

  if (agentUid) {
    unsubs.push(
      subscribeQuery(db, 'agentUid', agentUid, {
        onData: (messages) => {
          parts.uid = messages;
          emit();
        },
        onError,
        onIndexPending: trackIndex,
      })
    );
  }

  if (agentEmail) {
    unsubs.push(
      subscribeQuery(db, 'agentEmail', agentEmail, {
        onData: (messages) => {
          parts.email = messages;
          emit();
        },
        onError,
        onIndexPending: trackIndex,
      })
    );
  }

  return () => unsubs.forEach((unsub) => unsub());
}
