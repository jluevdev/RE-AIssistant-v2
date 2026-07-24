import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, ClipboardList, Mail, PartyPopper, X } from 'lucide-react';
import { Badge, Button, Card } from '../../components/ui';
import { TESTER_REPORT_EMAIL, TESTER_STEPS } from './testerChecklistContent';
import { requestOpenHelp, useTesterChecklistUi } from './TesterChecklistContext';

export default function TesterChecklistOverlay() {
  const {
    testerMode,
    overlayOpen,
    setOverlayOpen,
    completed,
    markStepDone,
    resetProgress,
    progress,
    allRequiredDone,
    dismissPanel,
    showPanel,
    stepOrder,
    disableTesterMode,
  } = useTesterChecklistUi();

  if (!testerMode) return null;

  const minimized = !overlayOpen || !showPanel;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => {
          setOverlayOpen(true);
        }}
        className="fixed bottom-20 left-4 z-40 flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 shadow-md hover:bg-amber-100 md:bottom-6"
        aria-label="Open tester checklist"
      >
        <ClipboardList className="h-4 w-4" />
        Tester checklist
        <Badge tone="warning" className="ml-0.5">
          {progress.doneRequired}/{progress.requiredTotal}
        </Badge>
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-20 left-4 z-40 w-[min(100vw-2rem,380px)] md:bottom-6"
      role="dialog"
      aria-label="Tester checklist"
    >
      <Card className="max-h-[min(70vh,520px)] flex flex-col overflow-hidden border-amber-200 bg-amber-50/90 shadow-xl">
        <div className="flex items-start justify-between gap-2 border-b border-amber-200/80 px-4 py-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-slate-900">Tester mode</h2>
              <Badge tone="warning">
                {progress.doneRequired} of {progress.requiredTotal} required
              </Badge>
            </div>
            <p className="mt-1 text-xs text-slate-600">Guided smoke path for beta testers (~15 min)</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setOverlayOpen(false)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-white/80"
              aria-label="Minimize checklist"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {allRequiredDone && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-accent-200 bg-accent-50 px-3 py-2 text-sm text-accent-900">
            <PartyPopper className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Required steps done. Optional steps and feedback still welcome.</span>
          </div>
        )}

        <ol className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {stepOrder.map((id, index) => {
            const step = TESTER_STEPS[id];
            const done = completed[id];

            return (
              <li
                key={id}
                className={`rounded-lg border px-3 py-2.5 ${
                  done ? 'border-accent-200 bg-white/80' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start gap-2">
                  {done ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent-600" />
                  ) : (
                    <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`text-sm font-medium ${done ? 'text-slate-600 line-through' : 'text-slate-900'}`}>
                        {index + 1}. {step.title}
                      </p>
                      {step.optional && (
                        <span className="text-[10px] font-semibold uppercase text-slate-400">Optional</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-600">{step.description}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      <span className="font-medium text-slate-600">Good:</span> {step.goodLooksLike}
                    </p>
                    {step.smsWarning && (
                      <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                        {step.smsWarning}
                      </p>
                    )}
                  </div>
                </div>

                {!done && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
                    {id === 'helpBot' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          requestOpenHelp();
                          markStepDone(id);
                        }}
                      >
                        {step.actionLabel}
                      </Button>
                    ) : step.to ? (
                      <Link to={step.to} onClick={() => markStepDone(id)}>
                        <Button type="button" size="sm" variant="outline">
                          {step.actionLabel}
                        </Button>
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className="text-xs text-slate-500 underline hover:text-slate-700"
                      onClick={() => markStepDone(id)}
                    >
                      Mark done
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <div className="space-y-2 border-t border-amber-200/80 px-4 py-3">
          <a
            href={`mailto:${TESTER_REPORT_EMAIL}?subject=RE%20AIssistant%20tester%20feedback`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:underline"
          >
            <Mail className="h-3.5 w-3.5" />
            Report issues via email
          </a>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={resetProgress}>
              Reset progress
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={dismissPanel}>
              Hide for now
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={disableTesterMode}>
              Turn off tester mode
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
