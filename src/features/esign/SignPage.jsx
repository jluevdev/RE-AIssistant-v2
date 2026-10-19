import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import toast from 'react-hot-toast';
import { functions } from '../../config/firebase';

export default function SignPage() {
  const { token } = useParams();
  const [packet, setPacket] = useState(null);
  const [name, setName] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    load();
  }, [token]);

  async function load() {
    setLoading(true);
    try {
      const { data } = await httpsCallable(functions, 'getSignatureInvite')({ token });
      setPacket(data);
      setName(data.signerName || '');
      if (data.alreadySigned) setDone(true);
    } catch (error) {
      toast.error(error.message || 'This signature link is invalid');
    } finally {
      setLoading(false);
    }
  }

  async function sign(event) {
    event.preventDefault();
    setLoading(true);
    try {
      await httpsCallable(functions, 'submitSignature')({ token, signatureName: name });
      setDone(true);
    } catch (error) {
      toast.error(error.message || 'Could not save the signature');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Signature saved</h1>
          <p className="mt-3 text-slate-600">The agent is notified when every required party has signed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-bold text-slate-900">Review and sign</h1>
        {!packet && <button type="button" className="rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Open packet'}</button>}
        {packet && (
          <form onSubmit={sign} className="space-y-3 text-sm text-slate-800">
            <p>{packet.address}</p>
            <p>Price: {packet.price || '—'}</p>
            <p>Financing: {packet.financing || '—'}</p>
            <p>Concessions: {packet.concessions || '—'}</p>
            <p>Close: {packet.closeDate || '—'}</p>
            <p>Contingencies: {packet.contingencies || '—'}</p>
            {(packet.warnings || []).map((warning) => (
              <p key={warning} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">{warning}</p>
            ))}
            <label className="block font-medium">
              Type your name to sign
              <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white disabled:opacity-50">
              {loading ? 'Saving…' : 'Sign'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
