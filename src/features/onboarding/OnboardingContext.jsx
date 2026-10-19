import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const OnboardingUiContext = createContext(null);

export function OnboardingUiProvider({ children }) {
  const [wizardForced, setWizardForced] = useState(false);
  const [guide, setGuide] = useState(null);
  const [advanceNonce, setAdvanceNonce] = useState(0);

  const reopenWizard = useCallback(() => setWizardForced(true), []);
  const clearForcedWizard = useCallback(() => setWizardForced(false), []);
  const startBotGuide = useCallback((name) => {
    setGuide({ name, step: 0 });
    setWizardForced(true);
  }, []);
  const setGuideStep = useCallback((step) => {
    setGuide((current) => (current ? { ...current, step } : current));
  }, []);
  const advanceBotGuide = useCallback(() => setAdvanceNonce((current) => current + 1), []);
  const stopBotGuide = useCallback(() => setGuide(null), []);

  const value = useMemo(
    () => ({
      wizardForced,
      reopenWizard,
      clearForcedWizard,
      guide,
      advanceNonce,
      startBotGuide,
      setGuideStep,
      advanceBotGuide,
      stopBotGuide,
    }),
    [wizardForced, reopenWizard, clearForcedWizard, guide, advanceNonce, startBotGuide, setGuideStep, advanceBotGuide, stopBotGuide]
  );

  return (
    <OnboardingUiContext.Provider value={value}>{children}</OnboardingUiContext.Provider>
  );
}

export function useOnboardingUi() {
  const ctx = useContext(OnboardingUiContext);
  if (!ctx) {
    throw new Error('useOnboardingUi must be used within OnboardingUiProvider');
  }
  return ctx;
}
