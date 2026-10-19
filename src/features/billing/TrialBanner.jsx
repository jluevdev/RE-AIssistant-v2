import { Link } from 'react-router-dom';

export default function TrialBanner({ trial, className = '' }) {
  if (!trial || trial.pending || trial.paid || !trial.isTrial) return null;

  if (trial.expired) {
    return (
      <div className={`rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 ${className}`}>
        Your free 7-day trial has ended. You can still review your data.
        {' '}
        <Link to="/billing" className="font-semibold underline">
          Add billing info to keep sending and creating.
        </Link>
      </div>
    );
  }

  const dayLabel = trial.daysLeft === 1 ? 'day' : 'days';
  return (
    <div className={`rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 ${className}`}>
      Free trial — {trial.pending ? '7 days' : `${trial.daysLeft} ${dayLabel}`} left.
      {' '}
      <Link to="/billing" className="font-semibold underline">
        Add billing info
      </Link>
      {' '}
      whenever you want to continue.
    </div>
  );
}
