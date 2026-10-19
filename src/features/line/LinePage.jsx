import { useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Button, Card, PageHeader, toast } from '../../components/ui';

const LEVELS = [
  ['observe', 'Observe'],
  ['draft', 'Draft'],
  ['assist', 'Assist'],
  ['routine', 'Routine'],
];

export default function LinePage() {
  const { userProfile } = useAuth();
  const [home, setHome] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [areaCode, setAreaCode] = useState('');

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const { data } = await httpsCallable(functions, 'getLineHome')();
      setHome(data);
    } catch (loadError) {
      const message = loadError.message || 'Could not load your line';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function claim() {
    setLoading(true);
    try {
      await httpsCallable(functions, 'claimAgentLine')({ areaCode });
      toast.success('Your number is ready');
      await refresh();
    } catch (error) {
      toast.error(error.message || 'Could not claim a number');
      setLoading(false);
    }
  }

  async function release() {
    setLoading(true);
    try {
      await httpsCallable(functions, 'releaseAgentLine')();
      toast.success('Number released');
      await refresh();
    } catch (error) {
      toast.error(error.message || 'Could not release the number');
      setLoading(false);
    }
  }

  async function setLevel(level) {
    try {
      await httpsCallable(functions, 'setGuardrailLevel')({ level });
      await refresh();
    } catch (error) {
      toast.error(error.message || 'Could not change the level');
    }
  }

  async function setCeiling(level) {
    try {
      await httpsCallable(functions, 'setGuardrailCeiling')({ level });
      await refresh();
    } catch (error) {
      toast.error(error.message || 'Could not change the ceiling');
    }
  }

  async function decide(approved) {
    setLoading(true);
    try {
      const name = approved ? 'approvePendingAction' : 'rejectPendingAction';
      await httpsCallable(functions, name)({ actionId: home?.pending?.id });
      toast.success(approved ? 'Approved' : 'Cancelled');
      await refresh();
    } catch (error) {
      toast.error(error.message || 'Could not update the approval');
      setLoading(false);
    }
  }

  const loaded = Boolean(home);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Phone}
        title="Your line"
        subtitle={userProfile?.fullName || 'Your assistant number, guardrails, and texts waiting for a yes.'}
      />

      <Card>
        <p className="text-sm text-slate-700">
          This page loads the number texts are sent from, plus anything waiting for your approval. It calls the getLineHome function when you open it.
        </p>
        {loading && <p className="mt-2 text-sm text-slate-500">Loading your line…</p>}
        {error && (
          <p className="mt-2 text-sm text-amber-800">
            {error} If Cloud Functions are off, enable Google Cloud billing (Blaze) and confirm getLineHome is deployed, then retry.
          </p>
        )}
        {(error || !loaded) && !loading && (
          <div className="mt-3">
            <Button onClick={refresh}>Retry</Button>
          </div>
        )}
      </Card>

      {loaded && (
        <>
          <Card>
            <p className="text-sm text-slate-500">Your assistant number</p>
            {home.line?.e164 ? (
              <>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{home.line.e164}</p>
                <p className="mt-2 text-sm text-slate-600">
                  Texts from {home.line.ownerMobile || 'the cell on your profile'} are commands. Other texts are saved for you.
                </p>
                <div className="mt-4">
                  <Button variant="outline" onClick={release} disabled={loading}>Release number</Button>
                </div>
              </>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-slate-600">Claim one number while your trial or plan is active. It is released if the trial ends unpaid.</p>
                <input
                  value={areaCode}
                  onChange={(event) => setAreaCode(event.target.value)}
                  placeholder="Area code, optional"
                  className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <div>
                  <Button onClick={claim} disabled={loading}>{loading ? 'Claiming…' : 'Claim my number'}</Button>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <p className="text-sm font-medium text-slate-800">Guardrail level</p>
            <p className="mt-1 text-sm text-slate-500">Effective level: {home.level}. Ceiling: {home.ceiling}.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {LEVELS.map(([id, label]) => (
                <Button key={id} variant={home.level === id ? 'primary' : 'outline'} onClick={() => setLevel(id)}>
                  {label}
                </Button>
              ))}
            </div>
            {home.canSetCeiling && (
              <div className="mt-4">
                <p className="text-sm font-medium text-slate-800">Brokerage ceiling</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {LEVELS.map(([id, label]) => (
                    <Button key={id} variant={home.ceiling === id ? 'primary' : 'outline'} onClick={() => setCeiling(id)}>
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card>
            <p className="text-sm font-medium text-slate-800">Waiting for approval</p>
            {home.pending ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-slate-800">{home.pending.warning}</p>
                <div className="flex gap-2">
                  <Button onClick={() => decide(true)} disabled={loading}>Approve</Button>
                  <Button variant="outline" onClick={() => decide(false)} disabled={loading}>Cancel</Button>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Nothing is waiting. Reply YES by text only applies to the latest warning.</p>
            )}
          </Card>

          <Card>
            <p className="text-sm font-medium text-slate-800">Recent actions</p>
            <ul className="mt-3 space-y-2">
              {(home.recent || []).map((row) => (
                <li key={row.id} className="text-sm text-slate-700">
                  <span className="font-medium">{row.type}</span>
                  {row.kind ? ` · ${row.kind}` : ''}
                  {row.warning ? ` — ${row.warning}` : ''}
                </li>
              ))}
              {!home.recent?.length && <li className="text-sm text-slate-500">No actions yet.</li>}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
