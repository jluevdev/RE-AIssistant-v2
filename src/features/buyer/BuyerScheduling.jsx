import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Link as LinkIcon,
  MapPin,
  Plus,
  RefreshCw,
  Send,
  Users,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { db, functions } from '../../config/firebase';
import { Badge, Button, Card, Input, PageHeader, Select, toast } from '../../components/ui';
import {
  emptyBuyer,
  formatHouseholdLabel,
  normalizeBuyers,
} from './buyerHousehold';
import { saveBuyerTourOffline } from './buyerScheduleFallback';
import { formatAvailabilityLabel, formatTime12 } from './buyerTime';
import { showingStatus, showingStatusHint, showingStatusLabel, showingStatusTone } from './buyerListingStatus';
import ListingThumb from './ListingThumb';
import useTrialStatus, { blockTrialAction } from '../billing/useTrialStatus';
import TrialBanner from '../billing/TrialBanner';
import {
  contactEmailLabel,
  contactNameLabel,
  contactPhoneLabel,
  householdRoleOptions,
  isRentalTour,
  normalizeTourKind,
  tourKindLabel,
} from './tourKind';
import { friendlyCallableError, isCloudFunctionsUnavailable } from '../../utils/callableErrors';

const EMPTY_TARGET = {
  address: '',
  listingAgentPhone: '',
  listingAgentName: '',
  listingAgentEmail: '',
  brokerage: '',
  dreNumber: '',
  mlsNumber: '',
  sourceUrl: '',
  photoUrl: '',
  note: '',
  parseStatus: '',
  phoneSource: '',
  listingKind: '',
  contactRole: '',
  status: 'pending',
  clientNote: '',
  clientRank: null,
  clientInterest: 'interested',
};
const MAX_BUYERS = 8;
const MAX_IMPORT_URLS = 10;

function statusTone(status) {
  return showingStatusTone(status);
}

function StepHeader({ step, onSelect, canOpenStep, tourKind }) {
  const peopleLabel = isRentalTour(tourKind) ? 'Renters & time' : 'Buyers & time';
  const steps = [
    { id: 1, label: peopleLabel },
    { id: 2, label: 'Properties' },
    { id: 3, label: 'Route & Share' },
  ];

  return (
    <ol className="flex flex-wrap gap-3 mb-6">
      {steps.map((item) => {
        const active = step === item.id;
        const done = step > item.id;
        const open = canOpenStep(item.id);
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => open && onSelect(item.id)}
              disabled={!open}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${
                active
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : done
                    ? 'border-accent-200 bg-accent-50 text-accent-700'
                    : open
                      ? 'border-slate-200 bg-white text-slate-700 hover:border-brand-300'
                      : 'border-slate-200 bg-white text-slate-400 cursor-not-allowed'
              }`}
            >
              <span className="font-medium">{item.id}.</span>
              <span>{item.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export default function BuyerScheduling() {
  const { currentUser, userProfile } = useAuth();
  const trial = useTrialStatus();
  const navigate = useNavigate();
  const { scheduleId: routeScheduleId } = useParams();
  const [searchParams] = useSearchParams();
  const forceShareStep = searchParams.get('step') === '3' || searchParams.get('share') === '1';

  const [step, setStep] = useState(1);
  const [scheduleId, setScheduleId] = useState(routeScheduleId || '');
  const [tourKind, setTourKind] = useState('sale');
  const [availability, setAvailability] = useState({ date: '', start: '', end: '' });
  const [buyers, setBuyers] = useState([emptyBuyer('primary')]);
  const [targets, setTargets] = useState([{ ...EMPTY_TARGET }]);
  const [confirmations, setConfirmations] = useState([]);
  const [shareLink, setShareLink] = useState('');
  const [mapsLink, setMapsLink] = useState('');
  const [recentSchedules, setRecentSchedules] = useState([]);
  const [loadingSchedule, setLoadingSchedule] = useState(Boolean(routeScheduleId));
  const [sending, setSending] = useState(false);
  const [building, setBuilding] = useState(false);
  const [linkPaste, setLinkPaste] = useState('');
  const [importing, setImporting] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);

  const agentName = useMemo(
    () => userProfile?.fullName || userProfile?.displayName || currentUser?.displayName || null,
    [currentUser, userProfile]
  );
  const householdLabel = useMemo(() => formatHouseholdLabel(buyers), [buyers]);
  const rental = isRentalTour(tourKind);
  const roleOptions = householdRoleOptions(tourKind);
  const phoneLabel = contactPhoneLabel(tourKind);
  const tourLocked = Boolean(routeScheduleId);

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
        setTourKind(normalizeTourKind(data.tourKind));
        setAvailability(data.availability || { date: '', start: '', end: '' });
        setBuyers(
          data.buyers?.length
            ? data.buyers.map((buyer) => ({
                name: buyer.name || '',
                phone: buyer.phone || '',
                email: buyer.email || '',
                role: buyer.role === 'co_borrower' ? 'co_borrower' : 'primary',
              }))
            : [emptyBuyer('primary')]
        );
        setTargets(
          data.targets?.length
            ? data.targets.map((target) => ({
                id: target.id,
                address: target.address || '',
                listingAgentPhone: target.listingAgentPhone || '',
                listingAgentName: target.listingAgentName || '',
                listingAgentEmail: target.listingAgentEmail || '',
                brokerage: target.brokerage || '',
                dreNumber: target.dreNumber || '',
                mlsNumber: target.mlsNumber || '',
                sourceUrl: target.sourceUrl || '',
                photoUrl: target.photoUrl || '',
                note: target.note || '',
                parseStatus: target.parseStatus || '',
                phoneSource: target.phoneSource || '',
                listingKind: target.listingKind || '',
                contactRole: target.contactRole || '',
                status: showingStatus(target.status),
                clientNote: target.clientNote || '',
                clientRank: target.clientRank || null,
                clientInterest: target.clientInterest === 'passed' ? 'passed' : 'interested',
              }))
            : [{ ...EMPTY_TARGET }],
        );
        setShareLink(data.shareTokenId ? `${window.location.origin}/client/plan?t=${data.shareTokenId}` : '');
        setMapsLink(data.mapsLink || '');
        setConfirmations(
          (data.targets || []).map((target) => ({
            address: target.address,
            listingAgentPhone: target.listingAgentPhone,
            photoUrl: target.photoUrl || '',
            status: target.status || 'pending',
            confirmed: target.status === 'confirmed',
            lastInboundPreview: target.lastInboundPreview || null,
            clientNote: target.clientNote || '',
            clientRank: target.clientRank || null,
            clientInterest: target.clientInterest === 'passed' ? 'passed' : 'interested',
          }))
        );
        setStep(
          forceShareStep
          || data.status === 'route_ready'
          || data.status === 'requests_sent'
          || (data.shareTokenId && !data.needsReview)
            ? 3
            : 2,
        );
      } catch (error) {
        console.error(error);
        toast.error('Failed to load schedule');
      } finally {
        setLoadingSchedule(false);
      }
    };

    loadSchedule();
  }, [routeScheduleId, currentUser, navigate, forceShareStep]);

  const updateTarget = (index, field, value) => {
    setTargets((prev) => prev.map((target, idx) => (idx === index ? { ...target, [field]: value } : target)));
  };

  const addTarget = () => setTargets((prev) => [...prev, { ...EMPTY_TARGET }]);

  const removeTarget = (index) => {
    setTargets((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== index)));
  };

  const updateBuyer = (index, field, value) => {
    setBuyers((prev) => prev.map((buyer, idx) => (idx === index ? { ...buyer, [field]: value } : buyer)));
  };

  const addBuyer = () => {
    setBuyers((prev) => (prev.length >= MAX_BUYERS ? prev : [...prev, emptyBuyer(prev.length === 0 ? 'primary' : 'co_borrower')]));
  };

  const removeBuyer = (index) => {
    setBuyers((prev) => {
      if (prev.length === 1) return prev;
      const next = prev.filter((_, idx) => idx !== index);
      if (!next.some((buyer) => buyer.role === 'primary')) {
        next[0] = { ...next[0], role: 'primary' };
      }
      return next;
    });
  };

  const canContinueStep1 =
    availability.date && availability.start && availability.end && buyers.some((buyer) => buyer.name.trim());
  const canSend = targets.some((target) => target.address && target.listingAgentPhone);
  const hasProperty = targets.some((target) => target.address || target.listingAgentPhone || target.sourceUrl);

  const canOpenStep = (id) => {
    if (id === 1) return true;
    if (id === 2) return canContinueStep1 || hasProperty || Boolean(scheduleId) || step >= 2;
    if (id === 3) return Boolean(scheduleId || shareLink) || hasProperty || step === 3;
    return false;
  };

  const goToStep = (nextStep) => {
    if (!canOpenStep(nextStep)) {
      if (nextStep === 2) toast.error(rental ? 'Add renters and a date/time window first' : 'Add buyers and a date/time window first');
      if (nextStep === 3) toast.error('Add at least one property first');
      return;
    }
    setStep(nextStep);
  };
  const needsReview = targets.some((target) => (
    target.sourceUrl && (!target.listingAgentPhone || target.parseStatus === 'failed' || target.parseStatus === 'partial')
  ));

  const savePropertyDetails = async () => {
    if (!scheduleId) {
      toast.error('Send showing requests first so this tour is saved.');
      return;
    }
    setSavingDetails(true);
    try {
      const ref = doc(db, 'buyerSchedules', scheduleId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        toast.error('Schedule not found');
        return;
      }
      const existing = snap.data()?.targets || [];
      const nextTargets = existing.map((row) => {
        const match = targets.find((target) => (
          (row.id && target.id === row.id)
          || (target.address && row.address && target.address === row.address)
        ));
        if (!match) return row;
        return {
          ...row,
          address: match.address || row.address,
          listingAgentPhone: match.listingAgentPhone || row.listingAgentPhone,
          listingAgentName: match.listingAgentName || row.listingAgentName,
          listingAgentEmail: match.listingAgentEmail || row.listingAgentEmail,
          brokerage: match.brokerage || row.brokerage,
          dreNumber: match.dreNumber || row.dreNumber,
          mlsNumber: match.mlsNumber || row.mlsNumber,
          sourceUrl: match.sourceUrl || row.sourceUrl,
          photoUrl: String(match.photoUrl || '').trim(),
          note: match.note || row.note,
        };
      });
      await updateDoc(ref, {
        targets: nextTargets,
        updatedAt: serverTimestamp(),
      });
      setConfirmations((prev) => prev.map((item, index) => ({
        ...item,
        photoUrl: nextTargets[index]?.photoUrl || item.photoUrl || '',
      })));
      toast.success('Property details saved. Refresh the client portal to see photos.');
    } catch (error) {
      console.error(error);
      toast.error('Could not save property details.');
    } finally {
      setSavingDetails(false);
    }
  };

  const importListingLinks = async () => {
    const urls = linkPaste
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => /^https?:\/\//i.test(part));
    if (urls.length === 0) {
      toast.error('Paste Zillow, Redfin, or Realtor.com links (one per line)');
      return;
    }

    setImporting(true);
    try {
      const parsePropertyLinks = httpsCallable(functions, 'parsePropertyLinks');
      const { data } = await parsePropertyLinks({ urls: urls.slice(0, MAX_IMPORT_URLS), tourKind });
      const imported = (data?.listings || []).map((row) => ({
        address: row.target?.address || '',
        listingAgentPhone: row.target?.listingAgentPhone || '',
        listingAgentName: row.target?.listingAgentName || '',
        listingAgentEmail: row.target?.listingAgentEmail || '',
        brokerage: row.target?.brokerage || '',
        dreNumber: row.target?.dreNumber || '',
        mlsNumber: row.target?.mlsNumber || '',
        listingKind: row.target?.listingKind || '',
        contactRole: row.target?.contactRole || '',
        sourceUrl: row.target?.sourceUrl || row.url || '',
        photoUrl: row.target?.photoUrl || '',
        note: row.target?.note || '',
        parseStatus: row.target?.parseStatus || (row.ok ? 'ok' : 'failed'),
        phoneSource: row.target?.phoneSource || '',
        status: showingStatus(row.target?.status),
      }));
      if (imported.length === 0) {
        toast.error('No supported listing links found');
        return;
      }

      setTargets((prev) => {
        const leftover = prev.filter((row) => row.address || row.listingAgentPhone || row.sourceUrl);
        const merged = [...leftover];
        imported.forEach((target) => {
          const idx = merged.findIndex((row) => row.sourceUrl && row.sourceUrl === target.sourceUrl);
          if (idx >= 0) {
            merged[idx] = {
              ...merged[idx],
              ...target,
              clientNote: merged[idx].clientNote || '',
              clientRank: merged[idx].clientRank ?? null,
              clientInterest: merged[idx].clientInterest === 'passed' ? 'passed' : 'interested',
              status: showingStatus(merged[idx].status) === 'confirmed' || showingStatus(merged[idx].status) === 'declined'
                ? merged[idx].status
                : target.status,
            };
          } else merged.push(target);
        });
        return merged.length ? merged : [{ ...EMPTY_TARGET }];
      });
      setLinkPaste('');
      const missing = imported.filter((row) => !row.listingAgentPhone).length;
      if (missing > 0) {
        toast(
          `Imported ${imported.length} listing${imported.length === 1 ? '' : 's'}. Fill in ${missing} missing ${phoneLabel.toLowerCase()}${missing === 1 ? '' : 's'} before sending.`,
          { icon: 'ℹ️', duration: 6000 },
        );
      } else {
        toast.success(`Imported ${imported.length} listing${imported.length === 1 ? '' : 's'}. Review, then send showing requests.`);
      }
    } catch (error) {
      console.error(error);
      toast.error(friendlyCallableError(
        error,
        'Could not import listing links',
        'Listing import needs Cloud Functions (Google Cloud billing). Paste addresses and phones manually for now.',
      ));
    } finally {
      setImporting(false);
    }
  };

  const sendRequests = async () => {
    if (blockTrialAction(trial, 'Your free trial has ended. Add billing info to send showing requests.')) {
      return;
    }
    if (!canSend) {
      toast.error(`Add at least one property with address and ${phoneLabel.toLowerCase()}`);
      return;
    }

    const household = normalizeBuyers(buyers);
    if (household.length === 0) {
      toast.error(rental ? 'Add at least one renter name' : 'Add at least one buyer name');
      setStep(1);
      return;
    }

    setSending(true);
    try {
      const sendBuyerShowingRequests = httpsCallable(functions, 'sendBuyerShowingRequests');
      const { data } = await sendBuyerShowingRequests({
        scheduleId: scheduleId || null,
        availability,
        targets,
        buyers: household,
        agentName,
        tourKind,
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
          photoUrl: target.photoUrl || '',
          status: 'pending',
          confirmed: false,
          lastInboundPreview: null,
          clientNote: target.clientNote || '',
          clientRank: target.clientRank || null,
          clientInterest: target.clientInterest === 'passed' ? 'passed' : 'interested',
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
      if (isCloudFunctionsUnavailable(error)) {
        try {
          const result = await saveBuyerTourOffline({
            scheduleId: scheduleId || null,
            availability,
            targets,
            buyers: household,
            agentName,
            ownerUid: currentUser.uid,
            teamId: userProfile?.teamId || null,
            tourKind,
          });
          setScheduleId(result.scheduleId);
          setShareLink(result.shareLink);
          setMapsLink(result.mapsLink || '');
          setConfirmations(result.confirmations || []);
          setStep(3);
          toast(
            `Cloud Functions are unavailable, so ${rental ? 'owner/PM' : 'listing-agent'} SMS was not sent. Your tour is saved and the ${rental ? 'renter' : 'buyer'} portal link is ready — share it with your ${rental ? 'renters' : 'buyers'}.`,
            { icon: 'ℹ️', duration: 6000 },
          );
          navigate(`/buyer/schedule/${result.scheduleId}`, { replace: true });
          return;
        } catch (fallbackError) {
          console.error(fallbackError);
          toast.error('Could not save tour. Check your connection and try again.');
          return;
        }
      }
      toast.error(friendlyCallableError(
        error,
        'Failed to send showing requests',
        'Could not send showing requests — Google Cloud billing may be off. Enable billing or try again.',
      ));
    } finally {
      setSending(false);
    }
  };

  const buildRoute = async () => {
    if (blockTrialAction(trial, 'Your free trial has ended. Add billing info to build a tour route.')) {
      return;
    }
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
        toast('No confirmations yet. Ask them to reply YES, then refresh.', { icon: 'ℹ️' });
      }
    } catch (error) {
      console.error(error);
      toast.error(friendlyCallableError(
        error,
        'Failed to build route',
        'Could not build route — Google Cloud billing may be off. Share the client link from step 3 if you already have one.',
      ));
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
          title="Tours"
          subtitle={rental
            ? 'Name the renters on this tour, request rental showings, and share one route with the household.'
            : 'Name the buyers on this tour, request showings, and share one route with the household.'}
        />
        <p className="text-sm text-slate-600">Loading schedule…</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        icon={CalendarClock}
        title="Tours"
        subtitle={rental
          ? 'Name the renters on this tour, request rental showings, and share one route with the household.'
          : 'Name the buyers on this tour, request showings, and share one route with the household.'}
        backTo="/dashboard"
        backLabel="Dashboard"
      />
      <TrialBanner trial={trial} className="mb-4" />

      {recentSchedules.length === 0 && step === 1 && (
        <Card className="mb-6 border-brand-200 bg-brand-50/50">
          <p className="text-sm text-slate-700">
            <span className="font-medium text-slate-900">{rental ? 'First rental tour?' : 'First buyer tour?'}</span>{' '}
            Paste Zillow links or add {phoneLabel.toLowerCase()}s, then send showing requests.
          </p>
        </Card>
      )}

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
                      {formatHouseholdLabel(schedule.buyers, schedule.buyerName) || schedule.availability?.date || 'Tour'}
                      <span className="ml-2 rounded-full border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {tourKindLabel(schedule.tourKind)}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {schedule.availability?.date || 'No date'} · {(schedule.targets || []).length} propert
                      {(schedule.targets || []).length === 1 ? 'y' : 'ies'}
                      {(() => {
                        const rows = schedule.targets || [];
                        const confirmed = rows.filter((row) => showingStatus(row.status) === 'confirmed').length;
                        const pending = rows.filter((row) => showingStatus(row.status) === 'pending').length;
                        if (!rows.length) return schedule.needsReview ? ' · review phones' : '';
                        return ` · ${pending} pending showings · ${confirmed} confirmed showings`;
                      })()}
                      {schedule.needsReview ? ' · review phones' : ''}
                    </p>
                  </div>
                  <span className="text-xs text-brand-600">Open</span>
                </Link>
              ))}
            </div>
          </div>
        </Card>
      )}

      <StepHeader step={step} onSelect={goToStep} canOpenStep={canOpenStep} tourKind={tourKind} />

      {step === 1 && (
        <Card>
          <div className="mb-5">
            <p className="text-sm font-medium text-slate-800 mb-2">Tour type</p>
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5">
              {[
                { id: 'sale', label: 'Sale tour' },
                { id: 'rental', label: 'Rental tour' },
              ].map((option) => {
                const active = tourKind === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={tourLocked}
                    onClick={() => setTourKind(option.id)}
                    className={`rounded-full px-3 py-1 text-sm font-medium ${
                      active
                        ? 'bg-white text-brand-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-800'
                    } ${tourLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {tourLocked && (
              <p className="mt-1 text-xs text-slate-500">Tour type is set for this schedule.</p>
            )}
          </div>
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-brand-600" />
            <h2 className="font-semibold text-slate-900">Who is touring?</h2>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            {rental
              ? 'Add every renter on this tour. They share one showing plan — no renter login needed.'
              : 'Add every borrower on this transaction. They share one showing plan — no buyer login needed.'}
          </p>
          <div className="space-y-4 mb-6">
            {buyers.map((buyer, index) => (
              <div key={`buyer-${index}`} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-slate-800">
                    {rental ? `Renter ${index + 1}` : `Buyer ${index + 1}`}
                  </p>
                  {buyers.length > 1 && (
                    <button
                      type="button"
                      className="text-sm text-rose-600 hover:underline"
                      onClick={() => removeBuyer(index)}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    label="Full name"
                    placeholder={rental ? 'Alex Renter' : 'Jane Buyer'}
                    value={buyer.name}
                    onChange={(event) => updateBuyer(index, 'name', event.target.value)}
                    containerClassName="md:col-span-2"
                  />
                  <Select
                    label="Role"
                    value={buyer.role}
                    onChange={(event) => updateBuyer(index, 'role', event.target.value)}
                  >
                    {roleOptions.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </Select>
                  <Input
                    label="Mobile phone (optional)"
                    placeholder="(555) 555-0100"
                    value={buyer.phone}
                    onChange={(event) => updateBuyer(index, 'phone', event.target.value)}
                  />
                  <Input
                    label="Email (optional)"
                    type="email"
                    placeholder="jane@email.com"
                    value={buyer.email}
                    onChange={(event) => updateBuyer(index, 'email', event.target.value)}
                    containerClassName="md:col-span-2"
                  />
                </div>
              </div>
            ))}
          </div>
          {buyers.length < MAX_BUYERS && (
            <Button variant="outline" onClick={addBuyer} className="mb-6">
              <Plus className="w-4 h-4" /> {rental ? 'Add co-applicant' : 'Add co-borrower'}
            </Button>
          )}

          <div className="flex items-center gap-2 mb-4 pt-2 border-t border-slate-100">
            <Calendar className="w-5 h-5 text-brand-600" />
            <h2 className="font-semibold text-slate-900">When are they available?</h2>
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
              hint={availability.start ? formatTime12(availability.start) : '12-hour time'}
            />
            <Input
              label="End"
              type="time"
              value={availability.end}
              onChange={(event) => setAvailability((prev) => ({ ...prev, end: event.target.value }))}
              hint={availability.end ? formatTime12(availability.end) : '12-hour time'}
            />
          </div>
          <div className="mt-5 flex justify-end">
            <Button
              disabled={!canContinueStep1}
              onClick={() => {
                if (!buyers.some((buyer) => buyer.name.trim())) {
                  toast.error(rental ? 'Add at least one renter name' : 'Add at least one buyer name');
                  return;
                }
                setStep(2);
              }}
            >
              Next: Add properties
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          {shareLink && (
            <div className="rounded-lg border border-accent-200 bg-accent-50 p-4 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-accent-700" />
                <p className="text-sm font-medium text-accent-800">Client portal link ready</p>
              </div>
              <p className="text-xs text-accent-700 mb-3">
                Share this with {householdLabel || (rental ? 'your renters' : 'your buyers')} — same link for every {rental ? 'co-applicant' : 'co-borrower'}.
              </p>
              <div className="flex items-center gap-2">
                <Input readOnly value={shareLink} containerClassName="flex-1" className="bg-white" />
                <Button variant="accent" size="sm" onClick={copyShareLink}>
                  <Copy className="w-4 h-4" /> Copy
                </Button>
              </div>
              <button
                type="button"
                className="mt-3 text-sm text-brand-700 underline"
                onClick={() => setStep(3)}
              >
                Go to route & share (step 3)
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-5 h-5 text-brand-600" />
            <h2 className="font-semibold text-slate-900">Target properties</h2>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            Paste Zillow, Redfin, or Realtor.com links to fill address{rental ? '' : ', MLS#,'} and {phoneLabel.toLowerCase()}. We do not text anyone until you tap Send.
          </p>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 mb-6">
            <label htmlFor="listing-links" className="block text-xs font-medium text-slate-600 mb-1">
              Paste listing links
            </label>
            <textarea
              id="listing-links"
              rows={4}
              value={linkPaste}
              onChange={(event) => setLinkPaste(event.target.value)}
              placeholder="https://www.zillow.com/homedetails/...\nhttps://www.redfin.com/..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" loading={importing} disabled={importing || !linkPaste.trim()} onClick={importListingLinks}>
                <LinkIcon className="w-4 h-4" />
                {importing ? 'Importing…' : 'Import links'}
              </Button>
              <p className="text-xs text-slate-500">Up to {MAX_IMPORT_URLS} links. Review phones before sending.</p>
            </div>
          </div>
          {needsReview && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 mb-6 text-sm text-amber-900">
              Some listings are missing a {phoneLabel.toLowerCase()} or only partially parsed. Fill those in, then send showing requests.
            </div>
          )}
          <div className="space-y-4">
            {targets.map((target, index) => (
              <div
                key={`target-${index}`}
                className={`rounded-lg border p-4 ${
                  target.clientInterest === 'passed'
                    ? 'border-slate-200 bg-slate-50 opacity-60 grayscale'
                    : 'border-slate-200'
                }`}
              >
                {(target.address || target.sourceUrl) && (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <ListingThumb src={target.photoUrl} alt={target.address || 'Listing photo'} />
                      <Badge tone={statusTone(target.status)}>{showingStatusLabel(target.status)}</Badge>
                    </div>
                    <p className="text-xs text-slate-500">{showingStatusHint(target.status, 'en', tourKind)}</p>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    containerClassName="md:col-span-2"
                    label="Property address"
                    placeholder="123 Main St, City, ST"
                    value={target.address}
                    onChange={(event) => updateTarget(index, 'address', event.target.value)}
                  />
                  <Input
                    containerClassName="md:col-span-2"
                    label="Listing photo URL"
                    placeholder="https://photos.zillowstatic.com/..."
                    hint="Paste a direct https photo link (Zillow, Redfin, or Realtor). Optional."
                    value={target.photoUrl || ''}
                    onChange={(event) => updateTarget(index, 'photoUrl', event.target.value)}
                  />
                  <Input
                    label={phoneLabel}
                    placeholder="(555) 555-0100"
                    value={target.listingAgentPhone}
                    onChange={(event) => updateTarget(index, 'listingAgentPhone', event.target.value)}
                    error={target.sourceUrl && !target.listingAgentPhone ? 'Required before sending' : undefined}
                  />
                  <Input
                    label="MLS #"
                    placeholder="Optional"
                    value={target.mlsNumber || ''}
                    onChange={(event) => updateTarget(index, 'mlsNumber', event.target.value)}
                  />
                  <Input
                    label={contactNameLabel(tourKind)}
                    placeholder="Optional"
                    value={target.listingAgentName || ''}
                    onChange={(event) => updateTarget(index, 'listingAgentName', event.target.value)}
                  />
                  <Input
                    label="Brokerage"
                    placeholder="Optional"
                    value={target.brokerage || ''}
                    onChange={(event) => updateTarget(index, 'brokerage', event.target.value)}
                  />
                  <Input
                    label={contactEmailLabel(tourKind)}
                    placeholder="Optional"
                    value={target.listingAgentEmail || ''}
                    onChange={(event) => updateTarget(index, 'listingAgentEmail', event.target.value)}
                  />
                  <Input
                    label="DRE #"
                    placeholder="Optional"
                    value={target.dreNumber || ''}
                    onChange={(event) => updateTarget(index, 'dreNumber', event.target.value)}
                  />
                  <Input
                    label="Optional note"
                    placeholder="Gate code, timing preference, etc."
                    value={target.note}
                    onChange={(event) => updateTarget(index, 'note', event.target.value)}
                    containerClassName="md:col-span-2"
                  />
                </div>
                {target.clientNote && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-medium text-slate-600">{rental ? 'Renter showing notes' : 'Buyer showing notes'}</p>
                    <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{target.clientNote}</p>
                  </div>
                )}
                {target.status === 'confirmed' && target.clientRank && target.clientInterest !== 'passed' && (
                  <p className="mt-2 text-xs font-medium text-brand-700">{rental ? 'Renter' : 'Buyer'} favorite #{target.clientRank}</p>
                )}
                {target.clientInterest === 'passed' && (
                  <p className="mt-2 text-xs text-slate-500">{rental ? 'Renters' : 'Buyers'} marked this as no longer interested.</p>
                )}
                {target.sourceUrl && (
                  <a
                    href={target.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open original listing
                  </a>
                )}
                {target.phoneSource === 'web_search' && (
                  <p className="mt-1 text-xs text-amber-700">
                    Found via web search — confirm before sending
                  </p>
                )}
                {target.parseStatus && target.parseStatus !== 'ok' && target.phoneSource !== 'web_search' && (
                  <p className="mt-1 text-xs text-amber-700">
                    {target.parseStatus === 'failed'
                      ? 'Could not auto-fill this listing — enter address and phone.'
                      : `Address came from the link. Add the ${phoneLabel.toLowerCase()} before sending.`}
                  </p>
                )}
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
            {scheduleId && (
              <Button variant="outline" loading={savingDetails} disabled={savingDetails} onClick={savePropertyDetails}>
                {savingDetails ? 'Saving…' : 'Save property details'}
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button variant="accent" loading={sending} disabled={sending || !canSend} onClick={sendRequests}>
              <Send className="w-4 h-4" />
              {sending ? 'Sending…' : 'Review & send showing requests'}
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-900">Build route & share with {rental ? 'renters' : 'buyers'}</h2>
              <p className="text-sm text-slate-600 mt-1">
                {rental ? 'Owners or property managers' : 'Listing agents'} reply YES/NO by SMS. Refresh to collate confirmations and generate a Google Maps route
                {householdLabel ? ` for ${householdLabel}` : ''}.
              </p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <div className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {formatAvailabilityLabel(availability) || `${availability.date} · ${formatTime12(availability.start)} – ${formatTime12(availability.end)}`}
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
            <Button variant="outline" onClick={() => setStep(1)}>
              Edit {rental ? 'renters' : 'buyers'}
            </Button>
          </div>

          {confirmations.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-2">{rental ? 'Owner / PM responses' : 'Listing agent responses'}</h3>
              <ul className="space-y-2">
                {confirmations.map((item, index) => (
                  <li
                    key={`${item.address}-${index}`}
                    className={`rounded-lg border px-3 py-2 ${
                      item.clientInterest === 'passed' ? 'border-slate-200 bg-slate-50 opacity-60 grayscale' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-3">
                        <ListingThumb src={item.photoUrl} alt={item.address || 'Listing photo'} />
                        <div>
                        <p className={`text-sm font-medium ${item.clientInterest === 'passed' ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                          {item.address || 'Unknown address'}
                        </p>
                        {item.clientRank && item.clientInterest !== 'passed' && showingStatus(item.status) === 'confirmed' && (
                          <p className="text-xs font-medium text-brand-700 mt-1">{rental ? 'Renter' : 'Buyer'} favorite #{item.clientRank}</p>
                        )}
                        {item.clientNote && (
                          <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{item.clientNote}</p>
                        )}
                        {item.lastInboundPreview && (
                          <p className="text-xs text-slate-500 mt-1">"{item.lastInboundPreview}"</p>
                        )}
                        {!item.lastInboundPreview && showingStatus(item.status) === 'pending' && (
                          <p className="text-xs text-slate-500 mt-1">{showingStatusHint(item.status, 'en', tourKind)}</p>
                        )}
                        </div>
                      </div>
                      <Badge tone={statusTone(item.status)}>{showingStatusLabel(item.status)}</Badge>
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
              <p className="text-xs text-accent-700 mb-3">
                Share this read-only link with {householdLabel || (rental ? 'your renters' : 'your buyers')}. Same link for every {rental ? 'co-applicant' : 'co-borrower'}. Expires in 48 hours.
              </p>
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
