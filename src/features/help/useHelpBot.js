import { useCallback, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';

export default function useHelpBot() {
  const [loading, setLoading] = useState(false);

  const ask = useCallback(async (question) => {
    const trimmed = String(question || '').trim();
    if (!trimmed) return null;

    setLoading(true);
    try {
      const callable = httpsCallable(functions, 'askHelpBot');
      const { data } = await callable({ question: trimmed });
      return {
        answer: data?.answer || 'No answer returned.',
        links: Array.isArray(data?.links) ? data.links : [],
        source: data?.source || 'unknown',
      };
    } finally {
      setLoading(false);
    }
  }, []);

  return { ask, loading };
}
