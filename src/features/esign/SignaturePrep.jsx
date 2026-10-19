import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { Button, Card, toast } from '../../components/ui';

const EMPTY_PARTY = { role: 'buyer', name: '', phone: '' };

export default function SignaturePrep({ offerId }) {
  const [parties, setParties] = useState([{ ...EMPTY_PARTY }, { role: 'seller', name: '', phone: '' }]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  function updateParty(index, field, value) {
    setParties((current) => current.map((party, i) => (i === index ? { ...party, [field]: value } : party)));
  }

  async function prep() {
    setLoading(true);
    try {
      const { data } = await httpsCallable(functions, 'prepSignaturePacket')({ offerId, parties });
      setResult(data);
    } catch (error) {
      toast.error(error.message || 'Could not prep the packet');
    } finally {
      setLoading(false);
    }
  }

  async function requestApproval() {
    if (!result?.packetId) return;
    setLoading(true);
    try {
      const { data } = await httpsCallable(functions, 'requestSignatureApproval')({ packetId: result.packetId });
      toast.success(data.warning || 'Waiting for your approval');
    } catch (error) {
      toast.error(error.message || 'Could not request signatures');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-900">Signature packet</h2>
      <p className="mt-1 text-sm text-slate-600">Grok checks the offer summary. Nothing is signed until you approve the exact packet.</p>
      <div className="mt-4 space-y-3">
        {parties.map((party, index) => (
          <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input value={party.role} onChange={(event) => updateParty(index, 'role', event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Role" />
            <input value={party.name} onChange={(event) => updateParty(index, 'name', event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Name" />
            <input value={party.phone} onChange={(event) => updateParty(index, 'phone', event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Phone" />
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <Button onClick={prep} disabled={loading}>Check packet</Button>
        <Button variant="outline" onClick={requestApproval} disabled={loading || !result || result.blockers?.length}>Request signatures</Button>
      </div>
      {result && (
        <div className="mt-4 space-y-2 text-sm">
          {(result.blockers || []).map((item) => <p key={item} className="text-red-700">{item}</p>)}
          {(result.warnings || []).map((item) => <p key={item} className="text-amber-800">{item}</p>)}
          {!result.blockers?.length && !result.warnings?.length && <p className="text-slate-600">No blockers or warnings.</p>}
        </div>
      )}
    </Card>
  );
}
