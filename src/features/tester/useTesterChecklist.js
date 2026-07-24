import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TESTER_MODE_KEY,
  TESTER_STEP_ORDER,
  countTesterProgress,
  testerProgressKey,
} from './testerChecklistContent';

function readJson(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export default function useTesterChecklist(uid) {
  const progressKey = testerProgressKey(uid);

  const [testerMode, setTesterMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(TESTER_MODE_KEY) === '1';
  });

  const [overlayOpen, setOverlayOpen] = useState(false);
  const [completed, setCompleted] = useState(() => readJson(progressKey, {}));
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setCompleted(readJson(progressKey, {}));
  }, [progressKey]);

  const enableTesterMode = useCallback((openOverlay = true) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TESTER_MODE_KEY, '1');
    }
    setTesterMode(true);
    setDismissed(false);
    if (openOverlay) setOverlayOpen(true);
  }, []);

  const disableTesterMode = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(TESTER_MODE_KEY);
    }
    setTesterMode(false);
    setOverlayOpen(false);
  }, []);

  const markStepDone = useCallback(
    (stepId) => {
      setCompleted((prev) => {
        const next = { ...prev, [stepId]: true };
        writeJson(progressKey, next);
        return next;
      });
    },
    [progressKey],
  );

  const resetProgress = useCallback(() => {
    const empty = {};
    writeJson(progressKey, empty);
    setCompleted(empty);
    setDismissed(false);
  }, [progressKey]);

  const progress = useMemo(() => countTesterProgress(completed), [completed]);

  const allRequiredDone = progress.doneRequired >= progress.requiredTotal;

  return {
    testerMode,
    overlayOpen,
    setOverlayOpen,
    enableTesterMode,
    disableTesterMode,
    completed,
    markStepDone,
    resetProgress,
    progress,
    allRequiredDone,
    dismissed,
    dismissPanel: () => setDismissed(true),
    showPanel: testerMode && !dismissed,
    stepOrder: TESTER_STEP_ORDER,
  };
}
