import { createContext, useContext, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import useTesterChecklist from './useTesterChecklist';

const TesterChecklistContext = createContext(null);

export function TesterChecklistProvider({ children }) {
  const { currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const checklist = useTesterChecklist(currentUser?.uid);
  const { enableTesterMode } = checklist;

  useEffect(() => {
    if (searchParams.get('tester') !== '1') return;
    enableTesterMode(true);
    const next = new URLSearchParams(searchParams);
    next.delete('tester');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, enableTesterMode]);

  return (
    <TesterChecklistContext.Provider value={checklist}>{children}</TesterChecklistContext.Provider>
  );
}

export function useTesterChecklistUi() {
  const ctx = useContext(TesterChecklistContext);
  if (!ctx) {
    throw new Error('useTesterChecklistUi must be used within TesterChecklistProvider');
  }
  return ctx;
}

/** Dispatched by checklist to open the floating help widget. */
export const OPEN_HELP_EVENT = 'reai:open-help';

export function requestOpenHelp() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPEN_HELP_EVENT));
  }
}
