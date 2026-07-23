import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { Calendar, ExternalLink, MapPin } from 'lucide-react';
import { functions } from '../../config/firebase';

function formatAvailability(availability) {
  if (!availability?.date) return null;
  const start = availability.start || 'TBD';
  const end = availability.end || 'TBD';
  return `${availability.date} · ${start} – ${end}`;
}

export default function BuyerClientPortal() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('t');
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError('This link is missing a plan token.');
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const getBuyerPlan = httpsCallable(functions, 'getBuyerPlan');
        const { data } = await getBuyerPlan({ token });
        setPlan(data);
      } catch (err) {
        console.error(err);
        setError(err.message || 'Unable to load this showing plan.');
        setPlan(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <p className="text-sm text-slate-600">Loading your showing plan…</p>
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border border-slate-200 bg-white p-6 text-center">
          <h1 className="text-lg font-semibold text-slate-900 mb-2">Showing plan unavailable</h1>
          <p className="text-sm text-slate-600">{error || 'This link may be invalid or expired.'}</p>
        </div>
      </div>
    );
  }

  const availabilityLabel = formatAvailability(plan.availability);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-blue-600 font-semibold mb-2">Showing plan</p>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">
            Tour with {plan.buyerName || 'your agent'}
          </h1>
          <p className="text-sm text-slate-600 mb-6">
            Your agent prepared this route for today's property tour. No login required.
          </p>

          {availabilityLabel && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 mb-5 text-sm text-slate-700">
              <Calendar className="w-4 h-4 text-slate-500" />
              {availabilityLabel}
            </div>
          )}

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-4 h-4 text-blue-600" />
              <h2 className="font-semibold text-slate-900">
                {plan.stopCount || plan.orderedStops?.length || 0} confirmed stop{(plan.stopCount || plan.orderedStops?.length || 0) === 1 ? '' : 's'}
              </h2>
            </div>
            <ol className="space-y-3">
              {(plan.orderedStops || []).map((stop, index) => (
                <li key={`${stop}-${index}`} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-sm font-semibold">
                    {index + 1}
                  </span>
                  <div className="pt-0.5">
                    <p className="text-sm font-medium text-slate-900">{stop}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {plan.mapsLink ? (
            <a
              href={plan.mapsLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700"
            >
              <ExternalLink className="w-4 h-4" />
              Open route in Google Maps
            </a>
          ) : (
            <p className="text-sm text-slate-600">Route link is not available yet.</p>
          )}

          <p className="text-xs text-slate-500 mt-5">
            This link expires {plan.expiresAt ? new Date(plan.expiresAt).toLocaleString() : 'soon'}.
          </p>
        </div>
      </div>
    </div>
  );
}
