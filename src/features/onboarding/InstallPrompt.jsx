import { useEffect, useRef, useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { Button } from '../../components/ui';

const DISMISS_KEY = 'reai.pwa.install.dismissed';

function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  });
  const [showIosHint, setShowIosHint] = useState(false);
  const deferredRef = useRef(null);

  useEffect(() => {
    if (dismissed || isStandalone()) return undefined;

    if (isIos()) {
      setShowIosHint(true);
      return undefined;
    }

    const handler = (event) => {
      event.preventDefault();
      deferredRef.current = event;
      setDeferred(event);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [dismissed]);

  function dismiss() {
    setDismissed(true);
    setShowIosHint(false);
    setDeferred(null);
    window.localStorage.setItem(DISMISS_KEY, '1');
  }

  async function handleInstall() {
    const promptEvent = deferredRef.current;
    if (!promptEvent) return;
    promptEvent.prompt();
    await promptEvent.userChoice;
    deferredRef.current = null;
    setDeferred(null);
    dismiss();
  }

  if (dismissed || isStandalone()) return null;

  if (showIosHint) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-start gap-3 min-w-0">
          <Share className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-slate-900">Install on iPhone</p>
            <p className="text-xs text-slate-600 mt-0.5">
              Tap Share, then &quot;Add to Home Screen&quot; for quick access.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
          aria-label="Dismiss install hint"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (!deferred) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
      <div className="flex items-start gap-3 min-w-0">
        <Smartphone className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-brand-900">Install RE AIssistant</p>
          <p className="text-xs text-brand-800/80 mt-0.5">
            Add to your home screen for faster check-ins and inbox replies on the go.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button type="button" size="sm" onClick={handleInstall}>
          <Download className="w-4 h-4" />
          Install
        </Button>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg p-1 text-brand-700 hover:bg-brand-100"
          aria-label="Dismiss install prompt"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
