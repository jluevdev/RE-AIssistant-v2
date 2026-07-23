import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import useDashboardData from '../dashboard/useDashboardData';
import { getDefaultAutomationSettings, mergeSettings } from '../automations/automationsUtils';
import {
  computeStepStatus,
  countCompleted,
  defaultOnboarding,
  isFullyComplete,
  mergeOnboarding,
  shouldShowChecklist,
  shouldShowWizard,
} from './onboardingUtils';

export default function useOnboarding() {
  const { currentUser, userProfile, updateUserProfile } = useAuth();
  const { data: dashboardData, loading: dashboardLoading } = useDashboardData();
  const [automationSettings, setAutomationSettings] = useState(null);
  const [automationLoading, setAutomationLoading] = useState(true);
  const lastPersistedComplete = useRef(false);

  const uid = currentUser?.uid;
  const onboarding = useMemo(() => mergeOnboarding(userProfile?.onboarding), [userProfile?.onboarding]);

  useEffect(() => {
    if (!uid) {
      setAutomationSettings(null);
      setAutomationLoading(false);
      return undefined;
    }

    let cancelled = false;
    setAutomationLoading(true);

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'automationSettings', uid));
        const merged = mergeSettings(
          snap.exists() ? snap.data() : null,
          uid
        );
        if (!cancelled) setAutomationSettings(merged);
      } catch (error) {
        console.warn('Onboarding automation settings read failed:', error.message);
        if (!cancelled) setAutomationSettings(getDefaultAutomationSettings(uid));
      } finally {
        if (!cancelled) setAutomationLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid]);

  const stepStatus = useMemo(
    () =>
      computeStepStatus({
        userProfile,
        dashboardData,
        automationSettings,
        manualSteps: onboarding.steps,
      }),
    [userProfile, dashboardData, automationSettings, onboarding.steps]
  );

  const progress = useMemo(() => countCompleted(stepStatus), [stepStatus]);
  const fullyComplete = useMemo(() => isFullyComplete(stepStatus), [stepStatus]);

  const persistOnboarding = useCallback(
    async (patch) => {
      if (!uid) return;
      const next = mergeOnboarding({
        ...onboarding,
        ...patch,
        steps: { ...onboarding.steps, ...(patch.steps || {}) },
      });
      await updateUserProfile(uid, { onboarding: next });
    },
    [uid, onboarding, updateUserProfile]
  );

  useEffect(() => {
    if (!uid || dashboardLoading || automationLoading) return;
    if (fullyComplete && !onboarding.completedAt && !lastPersistedComplete.current) {
      lastPersistedComplete.current = true;
      persistOnboarding({ completedAt: new Date().toISOString() }).catch(() => {
        lastPersistedComplete.current = false;
      });
    }
  }, [uid, fullyComplete, onboarding.completedAt, dashboardLoading, automationLoading, persistOnboarding]);

  const dismissWizard = useCallback(
    () => persistOnboarding({ dismissedWizard: true }),
    [persistOnboarding]
  );

  const dismissChecklist = useCallback(
    () => persistOnboarding({ dismissedChecklist: true }),
    [persistOnboarding]
  );

  const markStepDone = useCallback(
    (stepId) =>
      persistOnboarding({
        steps: { [stepId]: true },
      }),
    [persistOnboarding]
  );

  const startOnboarding = useCallback(
    () =>
      persistOnboarding({
        startedAt: onboarding.startedAt || new Date().toISOString(),
        dismissedWizard: false,
        wizardStep: 0,
      }),
    [onboarding.startedAt, persistOnboarding]
  );

  const saveWizardStep = useCallback(
    (wizardStep) => persistOnboarding({ wizardStep }),
    [persistOnboarding]
  );

  const finishWizard = useCallback(
    () =>
      persistOnboarding({
        startedAt: onboarding.startedAt || new Date().toISOString(),
        dismissedWizard: true,
        wizardStep: 0,
      }),
    [onboarding.startedAt, persistOnboarding]
  );

  return {
    onboarding,
    stepStatus,
    progress,
    fullyComplete,
    loading: dashboardLoading || automationLoading,
    showWizard: shouldShowWizard(userProfile),
    showChecklist: shouldShowChecklist(userProfile, stepStatus),
    dismissWizard,
    dismissChecklist,
    markStepDone,
    startOnboarding,
    saveWizardStep,
    finishWizard,
    persistOnboarding,
    defaultOnboardingShape: defaultOnboarding(),
  };
}
