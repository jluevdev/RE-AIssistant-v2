import { useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';

const DAY_MS = 24 * 60 * 60 * 1000;
const BLOCKED_STATUSES = new Set(['canceled', 'unpaid', 'incomplete_expired']);

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getTrialStatus(userProfile, teamPaid = false) {
  const sub = userProfile?.subscription || {};
  const status = sub.status || '';
  const plan = sub.plan || 'trial';
  const paidByStripe = Boolean(sub.stripeSubscriptionId) && !BLOCKED_STATUSES.has(status);
  const paidByPlan = plan !== 'trial' && !BLOCKED_STATUSES.has(status);
  if (teamPaid || paidByStripe || paidByPlan) {
    return {
      isTrial: false,
      expired: false,
      daysLeft: null,
      paid: true,
      pending: false,
      endDate: toDate(sub.endDate),
    };
  }

  const end = toDate(sub.endDate);
  if (!end) {
    return {
      isTrial: true,
      expired: false,
      daysLeft: 7,
      paid: false,
      pending: true,
      endDate: null,
    };
  }

  const msLeft = end.getTime() - Date.now();
  const expired = msLeft <= 0;
  return {
    isTrial: true,
    expired,
    daysLeft: expired ? 0 : Math.max(1, Math.ceil(msLeft / DAY_MS)),
    paid: false,
    pending: false,
    endDate: end,
  };
}

export default function useTrialStatus() {
  const { currentUser, userProfile, refreshUserProfile } = useAuth();
  const [teamPaid, setTeamPaid] = useState(false);
  const refreshedMissingTrial = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const teamId = userProfile?.teamId;
    if (!teamId) {
      setTeamPaid(false);
      return undefined;
    }
    getDoc(doc(db, 'teams', teamId))
      .then((snap) => {
        if (cancelled) return;
        const status = snap.data()?.billing?.status;
        setTeamPaid(status === 'active' || status === 'trialing');
      })
      .catch(() => {
        if (!cancelled) setTeamPaid(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userProfile?.teamId]);

  useEffect(() => {
    if (!currentUser) {
      refreshedMissingTrial.current = false;
      return undefined;
    }
    if (userProfile?.subscription?.endDate || refreshedMissingTrial.current) return undefined;
    const timer = setTimeout(() => {
      refreshedMissingTrial.current = true;
      refreshUserProfile?.();
    }, 2000);
    return () => clearTimeout(timer);
  }, [currentUser, refreshUserProfile, userProfile?.subscription?.endDate]);

  return getTrialStatus(userProfile, teamPaid);
}

export function blockTrialAction(trial, message) {
  if (!trial?.expired) return false;
  toast.error(message || 'Your free trial has ended. Add billing info to continue.');
  return true;
}
