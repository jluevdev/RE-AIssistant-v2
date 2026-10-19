import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { PUBLIC_APP_URL } from '../../config/site';
import { SUBSCRIPTION_PLANS } from '../../config/stripe';

const EXPO_PLAN = SUBSCRIPTION_PLANS.allInclusive;
const EXPO_TEAM_PLAN = SUBSCRIPTION_PLANS.premiumTeam;

const QUEUE_KEY = 'reai.expo.signupQueue';
const SOURCE = 'expo-oct-2026';

const EMPTY_FORM = { fullName: '', email: '', phone: '' };

function readQueue() {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

function randomPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function isNetworkError(error) {
  const message = String(error?.message || '');
  return !navigator.onLine
    || /network|failed to fetch|offline|timeout/i.test(message);
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

export default function ExpoSignupPage() {
  const { signup, resetPassword, logout } = useAuth();
  const authRef = useRef({ signup, resetPassword, logout });
  authRef.current = { signup, resetPassword, logout };
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(null);
  const [queued, setQueued] = useState(() => readQueue().length);

  const expoUrl = `${PUBLIC_APP_URL}/expo`;

  useEffect(() => {
    let cancelled = false;

    async function flush() {
      const pending = readQueue();
      if (!pending.length || cancelled) return;
      const remaining = [];
      for (const entry of pending) {
        if (cancelled) return;
        try {
          await authRef.current.signup(entry.email, entry.password, {
            fullName: entry.fullName,
            phone: entry.phone,
            role: 'agent',
            source: SOURCE,
          });
          try {
            await authRef.current.resetPassword(entry.email);
          } catch (error) {
            console.warn('Queued password reset failed:', error);
          }
          await authRef.current.logout();
        } catch (error) {
          const message = String(error?.message || '');
          if (/already exists/i.test(message)) {
            try {
              await authRef.current.resetPassword(entry.email);
            } catch (resetError) {
              console.warn('Queued reset for existing account failed:', resetError);
            }
            continue;
          }
          if (isNetworkError(error)) remaining.push(entry);
        }
      }
      if (!cancelled) {
        writeQueue(remaining);
        setQueued(remaining.length);
        if (pending.length > remaining.length) {
          toast.success('Saved signup queue synced');
        }
      }
    }

    flush();
    window.addEventListener('online', flush);
    return () => {
      cancelled = true;
      window.removeEventListener('online', flush);
    };
  }, []);

  function update(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function queueEntry(entry) {
    const next = [...readQueue().filter((row) => row.email !== entry.email), entry];
    writeQueue(next);
    setQueued(next.length);
  }

  async function finishSignup(entry) {
    await signup(entry.email, entry.password, {
      fullName: entry.fullName,
      phone: entry.phone,
      role: 'agent',
      source: SOURCE,
    });
    try {
      await resetPassword(entry.email);
    } catch (error) {
      console.warn('Password reset email failed:', error);
      toast.error('Account created. Password email did not send — use Forgot password on the sign-in page.');
    }
    await logout();
    writeQueue(readQueue().filter((row) => row.email !== entry.email));
    setQueued(readQueue().length);
    setDone({ fullName: entry.fullName, email: entry.email });
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const fullName = form.fullName.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();
    if (!fullName) {
      toast.error('Full name is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Enter a valid email');
      return;
    }
    if (digits(phone).length < 10) {
      toast.error('Enter a mobile number');
      return;
    }

    const entry = {
      id: `${Date.now()}`,
      fullName,
      email,
      phone,
      password: randomPassword(),
      createdAt: new Date().toISOString(),
    };

    if (!navigator.onLine) {
      queueEntry(entry);
      setDone({ fullName, email, queued: true });
      setForm(EMPTY_FORM);
      toast.success('Saved on this iPad. It will sync when the connection returns.');
      return;
    }

    setLoading(true);
    try {
      await finishSignup(entry);
      toast.success('Trial started. They will get an email to set a password.');
    } catch (error) {
      if (isNetworkError(error)) {
        queueEntry(entry);
        setDone({ fullName, email, queued: true });
        setForm(EMPTY_FORM);
        toast.success('Connection dropped. Saved on this iPad and will retry.');
      } else {
        toast.error(error.message || 'Sign up failed');
      }
    } finally {
      setLoading(false);
    }
  }

  function nextPerson() {
    setDone(null);
    setForm(EMPTY_FORM);
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-8">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[280px_1fr] lg:items-start">
        <aside className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Scan to sign up</p>
          <div className="mt-4 flex justify-center">
            <QRCodeSVG value={expoUrl} size={180} includeMargin />
          </div>
          <p className="mt-3 break-all text-xs text-slate-500">{expoUrl}</p>
          <p className="mt-4 text-sm text-slate-600">Free 7-day trial. No card.</p>
          <div className="mt-4 rounded-xl border border-accent-200 bg-accent-50 px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent-700">{EXPO_PLAN.promo.label}</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{EXPO_PLAN.name}</p>
            <p className="text-2xl font-bold text-slate-900">{EXPO_PLAN.promo.price}</p>
            <div className="mt-3 border-t border-accent-200 pt-3">
              <p className="text-lg font-bold text-slate-900">Teams</p>
              <p className="text-base font-semibold text-slate-900">{EXPO_TEAM_PLAN.promo.price}</p>
            </div>
            <p className="mt-2 text-xs text-slate-500">{EXPO_PLAN.promo.note}</p>
          </div>
          {queued > 0 && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {queued} signup{queued === 1 ? '' : 's'} waiting to sync
            </p>
          )}
        </aside>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          {done ? (
            <div className="text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Trial started</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">{done.fullName}</h1>
              <p className="mt-3 text-lg text-slate-600">
                {done.queued
                  ? 'Saved on this iPad. We will email them a password link when the connection returns.'
                  : `A password link is on its way to ${done.email}. Their 7-day trial is active.`}
              </p>
              <button
                type="button"
                onClick={nextPerson}
                className="mt-8 w-full rounded-2xl bg-brand-600 px-6 py-5 text-xl font-semibold text-white hover:bg-brand-700"
              >
                Sign up next person
              </button>
            </div>
          ) : (
            <>
              <img src="/brand/lockup.png" alt="RE AIssistant" className="mb-6 h-16 w-auto max-w-full object-contain" />
              <h1 className="text-3xl font-bold text-slate-900">Start your free 7-day trial</h1>
              <p className="mt-2 text-lg text-slate-600">No payment today. We email a link to set your password.</p>
              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                <input
                  type="text"
                  name="fullName"
                  placeholder="Full name"
                  value={form.fullName}
                  onChange={update}
                  autoComplete="name"
                  className="w-full rounded-xl border border-slate-300 px-4 py-4 text-lg"
                  required
                />
                <input
                  type="email"
                  name="email"
                  placeholder="Email"
                  value={form.email}
                  onChange={update}
                  autoComplete="email"
                  className="w-full rounded-xl border border-slate-300 px-4 py-4 text-lg"
                  required
                />
                <input
                  type="tel"
                  name="phone"
                  placeholder="Mobile number"
                  value={form.phone}
                  onChange={update}
                  autoComplete="tel"
                  className="w-full rounded-xl border border-slate-300 px-4 py-4 text-lg"
                  required
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-2xl bg-brand-600 px-6 py-5 text-xl font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {loading ? 'Starting trial…' : 'Start free trial'}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
