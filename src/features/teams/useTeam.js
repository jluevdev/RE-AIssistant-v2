import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';

function isIndexError(error) {
  const code = error?.code || '';
  const message = String(error?.message || '');
  return code === 'failed-precondition' && message.toLowerCase().includes('index');
}

/**
 * Live team doc + members for the signed-in user's team.
 */
export default function useTeam() {
  const { userProfile } = useAuth();
  const teamId = userProfile?.teamId || null;
  const teamRole = userProfile?.teamRole || null;
  const [team, setTeam] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(Boolean(teamId));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!teamId) {
      setTeam(null);
      setMembers([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError(null);

    const teamRef = doc(db, 'teams', teamId);
    const unsubTeam = onSnapshot(
      teamRef,
      (snap) => {
        setTeam(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      (err) => {
        console.error('Team subscription error:', err);
        setError(err);
        setLoading(false);
      }
    );

    let unsubMembers = () => {};
    const membersQuery = query(
      collection(db, 'teams', teamId, 'members'),
      where('status', '==', 'active'),
      orderBy('joinedAt', 'desc')
    );

    const startMembersFallback = () => {
      unsubMembers = onSnapshot(
        query(collection(db, 'teams', teamId, 'members'), where('status', '==', 'active')),
        (snap) => {
          setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        (err) => {
          console.error('Team members fallback error:', err);
          setError(err);
        }
      );
    };

    unsubMembers = onSnapshot(
      membersQuery,
      (snap) => {
        setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        if (isIndexError(err)) {
          unsubMembers();
          startMembersFallback();
          return;
        }
        console.error('Team members subscription error:', err);
        setError(err);
      }
    );

    return () => {
      unsubTeam();
      unsubMembers();
    };
  }, [teamId]);

  const roleMeta = useMemo(
    () => ({
      teamId,
      teamRole,
      isOwner: teamRole === 'owner',
      isAdmin: teamRole === 'owner' || teamRole === 'admin',
      isMember: Boolean(teamId),
    }),
    [teamId, teamRole]
  );

  return {
    team,
    members,
    loading,
    error,
    ...roleMeta,
  };
}
