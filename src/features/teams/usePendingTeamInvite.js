import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Pending team invite for the signed-in user's email (for banner + quick accept).
 */
export default function usePendingTeamInvite() {
  const { currentUser } = useAuth();
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const email = normalizeEmail(currentUser?.email);
    if (!email) {
      setInvite(null);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    let unsub = () => {};
    let usingFallback = false;

    const indexedQuery = query(
      collection(db, 'teamInvites'),
      where('email', '==', email),
      where('status', '==', 'pending'),
      limit(5)
    );

    const startFallback = () => {
      usingFallback = true;
      unsub = onSnapshot(
        query(collection(db, 'teamInvites'), where('email', '==', email)),
        (snap) => {
          const pending = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .find((row) => row.status === 'pending');
          setInvite(pending || null);
          setLoading(false);
        },
        () => {
          setInvite(null);
          setLoading(false);
        }
      );
    };

    unsub = onSnapshot(
      indexedQuery,
      (snap) => {
        const row = snap.docs[0];
        setInvite(row ? { id: row.id, ...row.data() } : null);
        setLoading(false);
      },
      (err) => {
        const isIndex =
          err?.code === 'failed-precondition' &&
          String(err?.message || '').toLowerCase().includes('index');
        if (!usingFallback && isIndex) {
          unsub();
          startFallback();
          return;
        }
        setInvite(null);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [currentUser?.email]);

  return { invite, loading };
}
