import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import {
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  MapPin,
  Plus,
  RefreshCw,
  Send,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { db, functions } from '../../config/firebase';
import { Badge, Button, Card, Input, PageHeader, toast } from '../../components/ui';

const EMPTY_TARGET = { address: '', listingAgentPhone: '', note: '' };

function statusTone(status) {
  if (status === 'confirmed') return 'success';
  if (status === 'declined') return 'danger';
  return 'warning';
}

function StepHeader({ step }) {
  const steps = [
    { id: 1, label: 'Availability' },
    { id: 2, label: 'Properties' },
    { id: 3, label: 'Route & Share' },
  ];

  return (
    <ol className="flex flex-wrap gap-3 mb-6">
      {steps.map((item) => {
        const active = step === item.id;
        const done = step > item.id;
        return (
          <li
            key={item.id}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${
              active
                ? 'border-brand-600 bg-brand-50 text-brand-700'
                : done
                  ? 'border-accent-200 bg-accent-50 text-accent-700'
                  : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            <span className="font-medium">{item.id}.</span>
            <span>{item.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function BuyerScheduling() {
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const { scheduleId: routeScheduleId } = useParams();

  const [step, setStep] = useState(1);
  const [scheduleId, setScheduleId] = useState(routeScheduleId || '');
  const [availability, setAvailability] = useState({ date: '', start: '', end: '' });
  const [targets, setTargets] = useState([{ ...EMPTY_TARGET }]);
  const [confirmations, setConfirmations] = useState([]);
  const [shareLink, setShareLink] = useState('');
  const [mapsLink, setMapsLink] = useState('');
  const [recentSchedules, setRecentSchedules] = useState([]);
  const [loadingSchedule, setLoadingSchedule] = useState(Boolean(routeScheduleId));
  const [sending, setSending] = useState(false);
  const [building, setBuilding] = useState(false);

  const buyerName = useMemo(
    () => userProfile?.displayName || userProfile?.name || currentUser?.displayName || null,
    [currentUser, userProfile]
  );

  useEffect(() => {
    if (!currentUser) return;

    const loadRecent = async () => {
      try {
        const q = query(
          collection(db, 'buyerSchedules'),
          where('ownerUid', '==', currentUser.uid),
          orderBy('createdAt', 'desc'),
          limit(5)
        );
        const snap = await getDocs(q);
        setRecentSchedules(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      } catch (error) {
        console.warn('Failed to load recent buyer schedules', error);
      }
    };

    loadRecent();
  }, [currentUser]);

  useEffect(() => {
    if (!routeScheduleId) return;

    const loadSchedule = async () => {
      setLoadingSchedule(true);
      try {
        const snap = await getDoc(doc(db, 'buyerSchedules', routeScheduleId));
        if (!snap.exists()) {
          toast.error('Schedule not found');
          navigate('/buyer/schedule', { replace: true });
          return;
        }

        const data = snap.data();
        if (data.ownerUid !== currentUser?.uid) {
          toast.error('You do not have access to this schedule');
          navigate('/buyer/schedule', { replace: true });
          return;
        }

        setScheduleId(routeScheduleId);
        setAvailability(data.availability || { date: '', start: '', end: '' });
        setTargets(data.targets?.length ? data.targets : [{ ...EMPTY_TARGET }]);
        setShareLink(data.shareTokenId ? `${window.location.origin}/client/plan?t=${data.shareTokenId}` : '');
        setMapsLink(data.mapsLink || '');
        setConfirmations(
          (data.targets || []).map((target) => ({
            address: target.address,
            listingAgentPhone: target.listingAgentPhone,
            status: target.status || 'pending',
            confirmed: target.status === 'confirmed',
            lastInboundPreview: target.lastInboundPreview || null,
          }))
        );
        setStep(data.status === 'route_ready' || data.status === 'requests_sent' ? 3 : 2);
      } catch (error) {
        console.error(error);
        toast.error('Failed to load schedule');
      } finally {
        setLoadingSchedule(false);
      }
    };

    loadSchedule();
  }, [routeScheduleId, currentUser, navigate]);

  const updateTarget = (index, field, value) => {
    setTargets((prev) => prev.map((target, idx) => (idx === index ? { ...target, [field]: value } : target)));
  };

  const addTarget = () => setTargets((prev) => [...prev, { ...EMPTY_TARGET }]);

  const removeTarget = (index) => {
    setTargets((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== index)));
  };

  const canContinueStep1 = availability.date && availability.start && availability.end;
  const canSend = targets.some((target) => target.address && target.listingAgentPhone);

  const sendRequests = async () => {
    if (!canSend) {
      toast.error('Add at least one property with address and listing agent phone');
      return;
    }

    setSending(true);
    try {
      const sendBuyerShowingRequests = httpsCallable(functions, 'sendBuyerShowingRequests');
      const { data } = await sendBuyerShowingRequests({
        scheduleId: scheduleId || null,
        availability,
        targets,
        buyerName,
      });

      const nextScheduleId = data.scheduleId;
      setScheduleId(nextScheduleId);
      setStep(3);
      setShareLink('');
      setMapsLink('');
      setConfirmations(
        targets.map((target) => ({
          address: target.address,
          listingAgentPhone: target.listingAgentPhone,
          status: 'pending',
          confirmed: false,
          lastInboundPreview: null,
        }))
      );

      if (data.sentCount > 0) {
        toast.success(`Sent ${data.sentCount} showing request${data.sentCount === 1 ? '' : 's'}`);
      } else {
        toast.error('No requests were sent. Check phone numbers and DNC status.');
      }

      if (data.skippedCount > 0) {
        toast.error(`${data.skippedCount} recipient(s) are opted out`);
      }

      navigate(`/buyer/schedule/${nextScheduleId}`, { replace: true });
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Failed to send showing requests');
    } finally {
      setSending(false);
    }
  };

  const buildRoute = async () => {
    if (!scheduleId) {
      toast.error('Save and send requests before building a route');
      return;
    }

    setBuilding(true);
    try {
      const buildBuyerRoute = httpsCallable(functions, 'buildBuyerRoute');
      const { data } = await buildBuyerRoute({ scheduleId });
      setConfirmations(data.confirmations || []);
      setShareLink(data.shareLink || '');
      setMapsLink(data.mapsLink || '');

      if (data.confirmedCount > 0) {
        toast.success(`Route ready with ${data.confirmedCount} confirmed stop${data.confirmedCount === 1 ? '' : 's'}`);
      } else {
        toast('No confirmations yet. Ask listing agents to reply YES, then refresh.', { icon: 'ℹ️' });
      }
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Failed to build route');
    } finally {
      setBuilding(false);
    }
  };

  const copyShareLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      toast.success('Client link copied');
    } catch {
      toast.error('Could not copy link');
    }
  };

  if (loadingSchedule) {
    return (
      <div>
        <PageHeader
          icon={CalendarClock}
          title="Buyer Tour Scheduling"
          subtitle="Request showings, collect confirmations, and share a route."
        />
        <p className="text-sm text-slate-600">Loading schedule…</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        icon={CalendarClock}
        title="Buyer Tour Scheduling"
        subtitle="Request showings, collect confirmations, and share a route with your buyer."
        backTo="/dashboard"
        backLabel="Dashboard"
      />

      {recentSchedules.length > 0 && !routeScheduleId && step === 1 && (
        <Card className="mb-6" padded={false}>
          <div className="p-4">
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Recent tours</h2>
            <div className="space-y-2">
              {recentSchedules.map((schedule) => (
                <Link
                  key={schedule.id}
                  to={`/buyer/schedule/${schedule.id}`}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {schedule.availability?.date || 'Tour'} · {(schedule.targets || []).length} propert{(schedule.targets || []).length === 1 ? 'y' : 'ies'}
                    </p>
                    <p className="text-xs text-slate-500 capitalize">{schedule.status?.replace('_', ' ') || 'draft'}</p>
                  </div>
                  <span className="text-xs text-brand-600">Open</span>
                </Link>
              ))}
            </div>
          </div>
        </Card>
      )}

      <StepHeader step={step} />

      {step === 1 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-brand-600" />
            <h2 className="font-semibold text-slate-900">When is your buyer available?</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Date"
              type="date"
              value={availability.date}
              onChange={(event) => setAvailability((prev) => ({ ...prev, date: event.target.value }))}
            />
            <Input
              label="Start"
              type="time"
              value={availability.start}
              onChange={(event) => setAvailability((prev) => ({ ...prev, start: event.target.value }))}
            />
            <Input
              label="End"
              type="time"
              value={availability.end}
              onChange={(event) => setAvailability((prev) => ({ ...prev, end: event.target.value }))}
            />
          </div>
          <div className="mt-5 flex justify-end">
            <Button disabled={!canContinueStep1} onClick={() => setStep(2)}>
              Next: Add properties
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-5 h-5 text-brand-600" />
            <h2 className="font-semibold text-slate-900">Target properties</h2>
          </div>
          <div className="space-y-4">
            {targets.map((target, index) => (
              <div key={`target-${index}`} className="rounded-lg border border-slate-200 p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    containerClassName="md:col-span-2"
                    label="Property address"
                    placeholder="123 Main St, City, ST"
                    value={target.address}
                    onChange={(event) => updateTarget(index, 'address', event.target.value)}
                  />
                  <Input
                    label="Listing agent phone"
                    placeholder="(555) 555-0100"
                    value={target.listingAgentPhone}
                    onChange={(event) => updateTarget(index, 'listingAgentPhone', event.target.value)}
                  />
                  <Input
                    label="Optional note"
                    placeholder="Gate code, timing preference, etc."
                    value={target.note}
                    onChange={(event) => updateTarget(index, 'note', event.target.value)}
                  />
                </div>
                {targets.length > 1 && (
                  <button
                    type="button"
                    className="mt-3 text-sm text-rose-600 hover:underline"
                    onClick={() => removeTarget(index)}
                  >
                    Remove property
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={addTarget}>
              <Plus className="w-4 h-4" /> Add property
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button variant="accent" loading={sending} disabled={sending || !canSend} onClick={sendRequests}>
              <Send className="w-4 h-4" />
              {sending ? 'Sending…' : 'Send showing requests'}
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-900">Build route & share with buyer</h2>
              <p className="text-sm text-slate-600 mt-1">
                Listing agents reply YES/NO by SMS. Refresh to collate confirmations and generate a Google Maps route.
              </p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <div className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {availability.date} · {availability.start}-{availability.end}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button loading={building} disabled={building} onClick={buildRoute}>
              <RefreshCw className={`w-4 h-4 ${building ? 'animate-spin' : ''}`} />
              {building ? 'Refreshing…' : 'Refresh confirmations & build route'}
            </Button>
            <Button variant="outline" onClick={() => setStep(2)}>
              Edit properties
            </Button>
          </div>

          {confirmations.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Listing agent responses</h3>
              <ul className="space-y-2">
                {confirmations.map((item, index) => (
                  <li key={`${item.address}-${index}`} className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{item.address || 'Unknown address'}</p>
                        {item.lastInboundPreview && (
                          <p className="text-xs text-slate-500 mt-1">"{item.lastInboundPreview}"</p>
                        )}
                      </div>
                      <Badge tone={statusTone(item.status)}>{item.status || 'pending'}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {mapsLink && (
            <Button as="a" href={mapsLink} target="_blank" rel="noreferrer" variant="outline">
              <ExternalLink className="w-4 h-4" />
              Open route in Google Maps
            </Button>
          )}

          {shareLink ? (
            <div className="rounded-lg border border-accent-200 bg-accent-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-accent-700" />
                <p className="text-sm font-medium text-accent-800">Client portal link ready</p>
              </div>
              <p className="text-xs text-accent-700 mb-3">Share this read-only link with your buyer. Expires in 48 hours.</p>
              <div className="flex items-center gap-2">
                <Input readOnly value={shareLink} containerClassName="flex-1" className="bg-white" />
                <Button variant="accent" size="sm" onClick={copyShareLink}>
                  <Copy className="w-4 h-4" /> Copy
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              At least one confirmed showing is required before a client link can be generated.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
