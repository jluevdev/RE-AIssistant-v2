import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const OnboardingUiContext = createContext(null);

export function OnboardingUiProvider({ children }) {
  const [wizardForced, setWizardForced] = useState(false);

  const reopenWizard = useCallback(() => setWizardForced(true), []);
  const clearForcedWizard = useCallback(() => setWizardForced(false), []);

  const value = useMemo(
    () => ({ wizardForced, reopenWizard, clearForcedWizard }),
    [wizardForced, reopenWizard, clearForcedWizard]
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
