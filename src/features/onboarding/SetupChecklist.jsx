import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, PartyPopper, X } from 'lucide-react';
import { Badge, Button, Card } from '../../components/ui';
import { STEP_META, STEP_ORDER } from './onboardingUtils';
import useOnboarding from './useOnboarding';

export default function SetupChecklist() {
  const {
    stepStatus,
    progress,
    fullyComplete,
    showChecklist,
    onboarding,
    loading,
    dismissChecklist,
    markStepDone,
  } = useOnboarding();

  if (loading || onboarding.dismissedChecklist) return null;

  if (fullyComplete) {
      return (
        <Card className="mb-6 border-accent-200 bg-accent-50/60">
          <div className="flex items-start gap-3">
            <PartyPopper className="w-5 h-5 text-accent-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900">Setup complete</p>
              <p className="text-sm text-slate-600 mt-0.5">
                You finished all six steps — you are fully activated.
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => dismissChecklist()}>
              Dismiss
            </Button>
          </div>
        </Card>
      );
  }

  if (!showChecklist) return null;

  return (
    <Card className="mb-6 border-brand-200 bg-brand-50/40">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-slate-900">Getting started</h2>
            <Badge tone="brand">
              {progress.done} of {progress.total}
            </Badge>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Finish these steps in order — each one makes the next more valuable.
          </p>
        </div>
        <button
          type="button"
          onClick={() => dismissChecklist()}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label="Dismiss checklist"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <ol className="space-y-2">
        {STEP_ORDER.map((id, index) => {
          const meta = STEP_META[id];
          const status = stepStatus[id];
          const done = status?.done;

          return (
            <li
              key={id}
              className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 ${
                done ? 'border-accent-200 bg-white/70' : 'border-slate-200 bg-white'
              }`}
            >
              <span className="flex items-center gap-2 min-w-[1.5rem]">
                {done ? (
                  <CheckCircle2 className="w-5 h-5 text-accent-600" aria-hidden="true" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-300" aria-hidden="true" />
                )}
                <span className="text-xs font-medium text-slate-400 w-4">{index + 1}</span>
              </span>
              <div className="flex-1 min-w-[180px]">
                <p className={`text-sm font-medium ${done ? 'text-slate-600 line-through' : 'text-slate-900'}`}>
                  {meta.title}
                </p>
                <p className="text-xs text-slate-500">{meta.description}</p>
              </div>
              {!done && (
                <div className="flex items-center gap-2 ml-auto">
                  <Link to={meta.to}>
                    <Button type="button" size="sm" variant="outline">
                      {meta.actionLabel}
                    </Button>
                  </Link>
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:text-slate-700 underline"
                    onClick={() => markStepDone(id)}
                  >
                    Skip
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
