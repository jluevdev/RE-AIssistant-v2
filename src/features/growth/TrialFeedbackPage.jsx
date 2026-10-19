import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import toast from 'react-hot-toast';
import { functions } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';

const SCORES = Array.from({ length: 11 }, (_, score) => score);

export default function TrialFeedbackPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { currentUser } = useAuth();
  const [used, setUsed] = useState('');
  const [missing, setMissing] = useState('');
  const [wouldPay, setWouldPay] = useState('');
  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const billingHref = useMemo(
    () => (currentUser ? '/billing' : '/login?returnUrl=/billing'),
    [currentUser],
  );

  async function handleSubmit(event) {
    event.preventDefault();
    if (!token) {
      toast.error('Open the survey from the link in your email');
      return;
    }
    if (wouldPay !== 'yes' && wouldPay !== 'no') {
      toast.error('Let us know if you would continue');
      return;
    }
    if (score === null) {
      toast.error('Pick a score from 0 to 10');
      return;
    }

    setLoading(true);
    try {
      const submitTrialSurvey = httpsCallable(functions, 'submitTrialSurvey');
      await submitTrialSurvey({
        token,
        used,
        missing,
        wouldPay,
        score,
      });
      setDone(true);
    } catch (error) {
      toast.error(error.message || 'Could not send feedback');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Thanks for the feedback</h1>
          <p className="mt-3 text-slate-600">
            Your trial keeps running until day 7. If it is earning its keep, add billing info and stay on.
          </p>
          <Link
            to={billingHref}
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700"
          >
            Add billing info
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <form onSubmit={handleSubmit} className="mx-auto max-w-lg space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">How was the trial?</h1>
          <p className="mt-2 text-sm text-slate-600">Four questions. Then you can add billing info if you want to keep going.</p>
        </div>

        {!token && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This page needs the link from your day-5 email.
          </p>
        )}

        <label className="block text-sm font-medium text-slate-800">
          What did you use?
          <textarea
            value={used}
            onChange={(event) => setUsed(event.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
            placeholder="Tours, open houses, texts…"
          />
        </label>

        <label className="block text-sm font-medium text-slate-800">
          What was missing?
          <textarea
            value={missing}
            onChange={(event) => setMissing(event.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
          />
        </label>

        <fieldset>
          <legend className="text-sm font-medium text-slate-800">Would you keep using it?</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[
              ['yes', 'Yes, I would continue'],
              ['no', 'Not right now'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setWouldPay(value)}
                className={`rounded-lg border px-3 py-3 text-sm font-medium ${
                  wouldPay === value
                    ? 'border-brand-600 bg-brand-50 text-brand-800'
                    : 'border-slate-300 text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-slate-800">Score, 0 to 10</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {SCORES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setScore(value)}
                className={`h-10 w-10 rounded-lg border text-sm font-semibold ${
                  score === value
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-300 text-slate-700'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={loading || !token}
          className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? 'Sending…' : 'Send feedback'}
        </button>
      </form>
    </div>
  );
}
