import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { resolvePlanStatus } from './planStatus';

const checking = resolvePlanStatus(null, { pending: true });

function fallbackRecord(subscription) {
  if (!subscription) return null;
  const plan = subscription.plan || 'trial';
  return {
    plan,
    planName: subscription.planName || (plan === 'trial' ? 'Free trial' : plan),
    status: subscription.status || (plan === 'trial' ? 'trialing' : 'active'),
    source: subscription.source || (plan !== 'trial' ? 'stripe' : 'trial'),
    endDate: subscription.endDate || null,
  };
}

export default function usePlanStatus() {
  const { currentUser, userProfile } = useAuth();
  const [plan, setPlan] = useState(checking);

  useEffect(() => {
    if (!currentUser) {
      setPlan(checking);
      return undefined;
    }
    let ensured = false;
    const unsub = onSnapshot(
      doc(db, 'subscriptions', currentUser.uid),
      (snap) => {
        if (snap.exists()) {
          setPlan(resolvePlanStatus(snap.data()));
          return;
        }
        setPlan(checking);
        if (ensured) return;
        ensured = true;
        httpsCallable(functions, 'ensurePlanRecord')()
          .then(({ data }) => {
            if (data?.plan) setPlan(resolvePlanStatus(data));
          })
          .catch(() => {
            const fallback = fallbackRecord(userProfile?.subscription);
            setPlan(fallback ? resolvePlanStatus(fallback) : checking);
          });
      },
      () => {
        const fallback = fallbackRecord(userProfile?.subscription);
        setPlan(fallback ? resolvePlanStatus(fallback) : checking);
      },
    );
    return unsub;
  }, [currentUser?.uid, userProfile]);

  return plan;
}
