import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { smartShowingsEnabled } from '../../config/features';
import { Badge, Button, Card, PageHeader, toast } from '../../components/ui';

export default function ShowingsPage() {
  const [home, setHome] = useState(null);
  const [loading, setLoading] = useState(false);
  const [address, setAddress] = useState('');
  const [noticeHours, setNoticeHours] = useState('24');
  const [cardName, setCardName] = useState('');

  async function refresh() {
    setLoading(true);
    try {
      const { data } = await httpsCallable(functions, 'getSmartShowingsHome')();
      setHome(data);
    } catch (error) {
      toast.error(error.message || 'Could not load SmartShowings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (smartShowingsEnabled) refresh();
  }, []);

  async function saveProfile(event) {
    event.preventDefault();
    try {
      await httpsCallable(functions, 'saveShowingProfile')({
        address,
        noticeHours: Number(noticeHours) || 24,
        showingType: 'appointment',
      });
      toast.success('Showing profile saved');
      setAddress('');
      await refresh();
    } catch (error) {
      toast.error(error.message || 'Could not save the profile');
    }
  }

  async function decide(approvalId, approved) {
    try {
      const { data } = await httpsCallable(functions, 'decideShowingApproval')({ approvalId, approved });
      if (data?.allowed === false) {
        toast.error(data.reason || 'Blocked');
      } else {
        toast.success(approved ? 'Recorded' : 'Declined');
      }
      await refresh();
    } catch (error) {
      toast.error(error.message || 'Could not update the approval');
    }
  }

  async function onCard(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = String(reader.result || '').split(',')[1] || '';
      try {
        const { data } = await httpsCallable(functions, 'extractShowingCard')({ imageBase64: base64 });
        setCardName(data?.extraction?.name || '');
        toast.success(`${data.level}: ${data.reason}`);
        await refresh();
      } catch (error) {
        toast.error(error.message || 'Could not read the card');
      }
    };
    reader.readAsDataURL(file);
  }

  async function attest(id) {
    try {
      const { data } = await httpsCallable(functions, 'attestCounterparty')({ verificationId: id });
      toast.success(data.reason || 'Updated');
      if (data.access?.reason) toast(data.access.reason);
      await refresh();
    } catch (error) {
      toast.error(error.message || 'Could not confirm');
    }
  }

  if (!smartShowingsEnabled) {
    return (
      <div className="max-w-2xl space-y-4">
        <PageHeader
          icon={CalendarClock}
          title="SmartShowings"
          subtitle="AI showing coordination is turned off."
          backTo="/dashboard"
        />
        <Card>
          <p className="text-sm text-slate-700">
            This build set VITE_SMART_SHOWINGS_ENABLED to false. Remove that, or set it to true, and rebuild. SMS stays mock until SMART_SHOWINGS_SMS_MODE=live.
          </p>
        </Card>
      </div>
    );
  }

  const approvals = home?.approvals || [];
  const pending = approvals.filter((row) => row.status === 'pending' || row.status === 'held');

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        icon={CalendarClock}
        title="SmartShowings"
        subtitle="Text-first showing coordination. Nothing goes out until you approve it."
        backTo="/dashboard"
        actions={<Badge tone={home?.smsMode === 'live' ? 'warning' : 'neutral'}>{home?.smsMode === 'live' ? 'SMS live' : 'SMS mock'}</Badge>}
      />

      <Card>
        <p className="text-sm text-slate-600">
          Buyer-side and listing-side assistants draft 1:1 texts. The first line says it is an AI assistant. Quiet hours are 8:00 a.m. to 8:00 p.m. Pacific. STOP is honored. Lockbox and access details stay with a person — this version will not send them.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          DRE checks use a stub until there is an official API. A card photo can be read with the platform xAI key. Partial results need you to confirm the agent. {cardName ? `Last card name: ${cardName}.` : ''}
        </p>
        {import.meta.env.DEV && (
          <p className="mt-3 text-sm">
            <Link to="/showings/simulator" className="text-brand-700 underline">Open the dev simulator</Link>
            <span className="text-slate-500"> — local steps only, no SMS.</span>
          </p>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900">Approval queue</h2>
        {loading && <p className="mt-2 text-sm text-slate-500">Loading…</p>}
        <ul className="mt-3 space-y-3">
          {pending.map((row) => (
            <li key={row.id} className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">{row.type} · {row.status}</p>
              <p className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">{row.body}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => decide(row.id, true)}>Approve</Button>
                <Button size="sm" variant="outline" onClick={() => decide(row.id, false)}>Decline</Button>
              </div>
            </li>
          ))}
          {!loading && pending.length === 0 && (
            <li className="text-sm text-slate-500">Nothing is waiting. Queue a request from a tour, or receive one on a listing.</li>
          )}
        </ul>
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900">Listing showing profile</h2>
        <p className="mt-1 text-sm text-slate-600">Appointment requests ask you before anyone is confirmed. The assistant does not text occupants in this version.</p>
        <form onSubmit={saveProfile} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm text-slate-700">
            Address
            <input value={address} onChange={(event) => setAddress(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2" required />
          </label>
          <label className="text-sm text-slate-700">
            Notice (hours)
            <input value={noticeHours} onChange={(event) => setNoticeHours(event.target.value)} className="mt-1 block w-24 rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <Button type="submit">Save profile</Button>
        </form>
        <ul className="mt-3 space-y-1 text-sm text-slate-600">
          {(home?.profiles || []).map((row) => (
            <li key={row.id}>{row.address} · {row.noticeHours || 24}h notice · ask every time</li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900">Counterparty card</h2>
        <p className="mt-1 text-sm text-slate-600">Text or upload a business card. Extraction uses the server xAI key. Verification is Partial until you confirm the person.</p>
        <input type="file" accept="image/*" onChange={onCard} className="mt-3 text-sm" />
        <ul className="mt-3 space-y-2">
          {(home?.verifications || []).map((row) => (
            <li key={row.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <p className="font-medium">{row.level} · {row.extraction?.name || 'Unknown'}</p>
              <p className="text-slate-600">{row.reason}</p>
              {row.level === 'Partial' && (
                <Button className="mt-2" size="sm" variant="outline" onClick={() => attest(row.id)}>
                  I know this agent — mark Verified
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
