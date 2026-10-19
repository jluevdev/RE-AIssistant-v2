import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Calendar, ChevronDown, ChevronUp, Clock, ExternalLink, Link as LinkIcon, MapPin } from 'lucide-react';
import { db, functions } from '../../config/firebase';
import { isCloudFunctionsUnavailable } from '../../utils/callableErrors';
import { formatAvailabilityLabel } from './buyerTime';
import ListingThumb from './ListingThumb';
import { listingPreviewsFromPaste } from './listingUrl';
import {
  showingStatusHint,
  showingStatusLabel,
  sortConfirmedForShowingDay,
  splitListingStops,
} from './buyerListingStatus';

const COPY = {
  es: {
    loading: 'Cargando su plan de visitas…',
    unavailableTitle: 'Plan no disponible',
    unavailableBody: 'Este enlace puede ser inválido o haber vencido.',
    missingToken: 'A este enlace le falta el código del plan.',
    functionsDown: 'No se pudo cargar el plan. Pida a su agente que reenvíe el enlace.',
    kicker: 'Plan de visitas',
    tourFor: 'Recorrido para',
    tourWith: 'Recorrido con',
    yourAgent: 'su agente',
    prepared: (name) =>
      name
        ? `${name} preparó esta ruta para el recorrido de hoy. No necesita iniciar sesión.`
        : 'Su agente preparó esta ruta para el recorrido de hoy. No necesita iniciar sesión.',
    primary: 'Comprador principal',
    coBorrower: 'Co-prestatario',
    pendingTitle: 'Visitas pendientes',
    pendingHelp: 'En espera de confirmación. Pase a Visitas confirmadas cuando el agente de listado responda que sí.',
    noPending: 'Aún no hay visitas pendientes.',
    confirmedTitle: 'Visitas confirmadas',
    showingDayHelp: 'Día de visitas: anote lo que vio y ordene de favorita a menos favorita.',
    noConfirmed: 'Aún no hay visitas confirmadas.',
    passedTitle: 'Ya no les interesa',
    openListing: 'Abrir anuncio',
    showingNotes: 'Notas de la visita',
    notesPlaceholder: '¿Qué les gustó o no? Tamaño, luz, patio, vecindario…',
    moreFavorite: 'Más favorita',
    lessFavorite: 'Menos favorita',
    favoriteRank: (n) => (n ? `#${n} favorita` : 'Sin ranking'),
    notInterested: 'Ya no nos interesa',
    stillInterested: 'Sí nos interesa',
    saved: 'Guardado',
    saveFailed: 'No se pudo guardar. Inténtelo de nuevo.',
    openMaps: 'Abrir ruta en Google Maps',
    noRoute: 'La ruta aún no está lista.',
    expires: 'Este enlace vence',
    soon: 'pronto',
    addListings: 'Agregar propiedades',
    addListingsHelp: 'Pegue enlaces de Zillow, Redfin o Realtor.com. Su agente revisará los teléfonos antes de pedir las visitas.',
    sendToAgent: 'Enviar a mi agente',
    sending: 'Enviando…',
    readingListing: 'Leyendo el anuncio…',
    findingPhoto: 'Buscando la foto…',
    savingListing: 'Guardando en su plan…',
    pasteError: 'Pegue enlaces de Zillow, Redfin o Realtor.com.',
    importDown: 'El envío de enlaces no está disponible. Envíe los enlaces a su agente por mensaje.',
    sent: (n) =>
      n
        ? `Se enviaron ${n} propiedad${n === 1 ? '' : 'es'} a su agente. Revisará los teléfonos antes de pedir las visitas.`
        : 'Propiedades enviadas a su agente.',
  },
  en: {
    loading: 'Loading your showing plan…',
    unavailableTitle: 'Showing plan unavailable',
    unavailableBody: 'This link may be invalid or expired.',
    missingToken: 'This link is missing a plan token.',
    functionsDown: 'This showing plan could not be loaded. Ask your agent to resend the link.',
    kicker: 'Showing plan',
    tourFor: 'Tour for',
    tourWith: 'Tour with',
    yourAgent: 'your agent',
    prepared: (name) =>
      name
        ? `${name} prepared this route for today's property tour. No login required.`
        : "Your agent prepared this route for today's property tour. No login required.",
    primary: 'Primary',
    coBorrower: 'Co-borrower',
    pendingTitle: 'Pending Showings',
    pendingHelp: 'Awaiting confirmation. These move to Confirmed Showings after the listing agent replies YES.',
    noPending: 'No pending showings yet.',
    confirmedTitle: 'Confirmed Showings',
    showingDayHelp: 'Showing day: add notes, then rank from favorite to least favorite.',
    noConfirmed: 'No confirmed showings yet.',
    passedTitle: 'No longer interested',
    openListing: 'Open listing',
    showingNotes: 'Showing notes',
    notesPlaceholder: 'What did you like or dislike? Layout, light, yard, neighborhood…',
    moreFavorite: 'More favorite',
    lessFavorite: 'Less favorite',
    favoriteRank: (n) => (n ? `#${n} favorite` : 'Unranked'),
    notInterested: 'No longer interested',
    stillInterested: 'Still interested',
    saved: 'Saved',
    saveFailed: 'Could not save. Try again.',
    openMaps: 'Open route in Google Maps',
    noRoute: 'Route link is not available yet.',
    expires: 'This link expires',
    soon: 'soon',
    addListings: 'Add listings',
    addListingsHelp: 'Paste Zillow, Redfin, or Realtor.com links. Your agent reviews listing-agent phones before anyone is texted.',
    sendToAgent: 'Send to my agent',
    sending: 'Sending…',
    readingListing: 'Reading the listing…',
    findingPhoto: 'Finding the listing photo…',
    savingListing: 'Saving to your plan…',
    pasteError: 'Paste Zillow, Redfin, or Realtor.com links.',
    importDown: 'Listing import is temporarily unavailable. Text the links to your agent instead.',
    sent: (n) =>
      n
        ? `Sent ${n} listing${n === 1 ? '' : 's'} to your agent. They will review phones before requesting showings.`
        : 'Listings sent to your agent.',
  },
};

const RENTAL_COPY = {
  es: {
    kicker: 'Plan de visitas de renta',
    primary: 'Inquilino principal',
    coBorrower: 'Co-solicitante',
    pendingHelp: 'En espera de confirmación. Pase a Visitas confirmadas cuando el propietario o administrador responda que sí.',
    addListingsHelp: 'Pegue enlaces de Zillow, Redfin o Realtor.com. Su agente revisará los teléfonos del propietario o administrador antes de pedir las visitas.',
  },
  en: {
    kicker: 'Rental showing plan',
    primary: 'Primary renter',
    coBorrower: 'Co-applicant',
    pendingHelp: 'Awaiting confirmation. These move to Confirmed Showings after the owner or property manager replies YES.',
    addListingsHelp: 'Paste Zillow, Redfin, or Realtor.com links. Your agent reviews owner/PM phones before anyone is texted.',
  },
};

function portalCopy(lang, tourKind) {
  const base = COPY[lang] || COPY.es;
  if (tourKind !== 'rental') return base;
  return { ...base, ...(RENTAL_COPY[lang] || RENTAL_COPY.en) };
}

function preferListingPhotos(incoming, previous) {
  if (!incoming?.length) return previous || incoming || [];
  return incoming.map((stop) => {
    if (stop?.photoUrl) return stop;
    const match = (previous || []).find((row) => (
      (row.sourceUrl && stop.sourceUrl && row.sourceUrl === stop.sourceUrl)
      || (row.id && stop.id && row.id === stop.id)
      || (row.address && stop.address && row.address === stop.address)
    ));
    return match?.photoUrl ? { ...stop, photoUrl: match.photoUrl } : stop;
  });
}

async function loadPlanFromFirestore(token) {
  const tokenRef = doc(db, 'clientPlanTokens', token);
  const tokenSnap = await getDoc(tokenRef);
  if (!tokenSnap.exists()) return null;

  const tokenData = tokenSnap.data();
  const expiresAt = tokenData.expiresAt?.toDate?.();
  if (!expiresAt || expiresAt <= new Date()) {
    throw new Error('expired');
  }

  if (tokenData.publicPlan) {
    return {
      ...tokenData.publicPlan,
      tourKind: tokenData.tourKind || tokenData.publicPlan.tourKind || 'sale',
      listings: tokenData.publicListings || tokenData.publicPlan.listings || [],
      canSubmitListings: true,
    };
  }

  if (tokenData.publicListings?.length) {
    return {
      listings: tokenData.publicListings,
      tourKind: tokenData.tourKind || 'sale',
      canSubmitListings: true,
      expiresAt: expiresAt.toISOString(),
    };
  }

  return null;
}

function LanguageToggle({ lang, onChange }) {
  return (
    <div className="flex justify-end mb-3">
      <div className="inline-flex rounded-full border border-slate-200 bg-white p-0.5 text-xs font-medium">
        <button
          type="button"
          onClick={() => onChange('es')}
          className={`rounded-full px-3 py-1 ${lang === 'es' ? 'bg-blue-600 text-white' : 'text-slate-600'}`}
        >
          Español
        </button>
        <button
          type="button"
          onClick={() => onChange('en')}
          className={`rounded-full px-3 py-1 ${lang === 'en' ? 'bg-blue-600 text-white' : 'text-slate-600'}`}
        >
          English
        </button>
      </div>
    </div>
  );
}

function ListingLinksForm({ token, t, onImported }) {
  const [paste, setPaste] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState('');
  const [done, setDone] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!submitting) {
      setProgress('');
      return undefined;
    }
    const steps = [t.readingListing, t.findingPhoto, t.savingListing];
    setProgress(steps[0]);
    let index = 0;
    const timer = setInterval(() => {
      index = Math.min(index + 1, steps.length - 1);
      setProgress(steps[index]);
    }, 4000);
    return () => clearInterval(timer);
  }, [submitting, t.findingPhoto, t.readingListing, t.savingListing]);

  const submitLinks = async (event) => {
    event.preventDefault();
    const urls = paste
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => /^https?:\/\//i.test(part));
    if (urls.length === 0) {
      setFormError(t.pasteError);
      return;
    }

    const previews = listingPreviewsFromPaste(paste);
    if (previews.length) onImported?.(previews);

    setSubmitting(true);
    setFormError('');
    setDone('');
    try {
      const submitBuyerListingLinks = httpsCallable(functions, 'submitBuyerListingLinks', { timeout: 45000 });
      const { data } = await submitBuyerListingLinks({ token, urls });
      setPaste('');
      setDone(t.sent(data?.imported));
      await onImported?.(data?.listings || previews);
    } catch (error) {
      if (isCloudFunctionsUnavailable(error)) {
        setFormError(t.importDown);
      } else {
        setFormError(error.message || t.pasteError);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submitLinks} className="mt-8 border-t border-slate-200 pt-6">
      <div className="flex items-center gap-2 mb-2">
        <LinkIcon className="w-4 h-4 text-blue-600" />
        <h2 className="font-semibold text-slate-900">{t.addListings}</h2>
      </div>
      <p className="text-sm text-slate-600 mb-3">{t.addListingsHelp}</p>
      <textarea
        rows={4}
        value={paste}
        onChange={(event) => setPaste(event.target.value)}
        placeholder="https://www.zillow.com/homedetails/..."
        disabled={submitting}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 disabled:bg-slate-50"
      />
      {formError && <p className="mt-2 text-sm text-rose-600">{formError}</p>}
      {done && <p className="mt-2 text-sm text-emerald-700">{done}</p>}
      {submitting && progress && (
        <p className="mt-2 text-sm text-blue-700" aria-live="polite">{progress}</p>
      )}
      <button
        type="submit"
        disabled={submitting || !paste.trim()}
        className="mt-3 inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? (progress || t.sending) : t.sendToAgent}
      </button>
    </form>
  );
}

function ShowingCard({
  stop,
  t,
  lang,
  tourKind,
  tone,
  rankLabel,
  passed,
  canRank,
  onMove,
  onNote,
  onInterest,
}) {
  const [note, setNote] = useState(stop.clientNote || '');
  const [saveState, setSaveState] = useState('');

  useEffect(() => {
    setNote(stop.clientNote || '');
  }, [stop.id, stop.clientNote]);

  const saveNote = async () => {
    const next = note.trim();
    if (next === String(stop.clientNote || '').trim()) return;
    setSaveState('');
    try {
      await onNote(stop, next);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  };

  return (
    <li
      className={`overflow-hidden rounded-xl border ${
        passed
          ? 'border-slate-200 bg-slate-100 opacity-60 grayscale'
          : tone === 'confirmed'
            ? 'border-emerald-200 bg-emerald-50/60'
            : 'border-amber-200 bg-amber-50'
      }`}
    >
      <div className="flex flex-col-reverse sm:flex-row sm:items-start sm:gap-3 sm:p-3">
        <div className="min-w-0 flex-1 px-3 py-3 sm:p-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className={`text-sm font-medium break-words ${passed ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                {stop.address}
              </p>
              <p className={`text-xs mt-1 ${passed ? 'text-slate-500' : tone === 'confirmed' ? 'text-emerald-800' : 'text-amber-800'}`}>
                {rankLabel || showingStatusHint(stop.status, lang, tourKind)}
              </p>
            </div>
            <span className={`self-start shrink-0 rounded-full border bg-white px-2 py-0.5 text-xs font-medium ${
              passed ? 'border-slate-200 text-slate-500' : tone === 'confirmed' ? 'border-emerald-300 text-emerald-800' : 'border-amber-300 text-amber-800'
            }`}>
              {passed ? t.passedTitle : showingStatusLabel(stop.status, lang)}
            </span>
          </div>

          {stop.sourceUrl && (
            <a
              href={stop.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              {t.openListing}
            </a>
          )}

          <label className="mt-3 block">
            <span className="text-xs font-medium text-slate-700">{t.showingNotes}</span>
            <textarea
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onBlur={saveNote}
              placeholder={t.notesPlaceholder}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 disabled:bg-slate-50"
            />
          </label>
          {saveState === 'saved' && <p className="mt-1 text-xs text-emerald-700">{t.saved}</p>}
          {saveState === 'error' && <p className="mt-1 text-xs text-rose-600">{t.saveFailed}</p>}
        </div>

        <ListingThumb
          src={stop.photoUrl}
          alt={stop.address || 'Listing photo'}
          className="aspect-[16/10] h-auto w-full rounded-none border-0 sm:aspect-auto sm:h-[140px] sm:w-[140px] sm:shrink-0 sm:rounded-xl sm:border sm:border-slate-200 md:h-[156px] md:w-[156px]"
        />
      </div>

      {tone === 'confirmed' && (
        <div className="flex flex-wrap items-center gap-2 border-t border-black/5 px-3 py-3 sm:mt-0 sm:border-0 sm:px-3 sm:pt-0 sm:pb-3">
          {canRank && (
            <>
              <button
                type="button"
                onClick={() => onMove(stop, -1)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                {t.moreFavorite}
              </button>
              <button
                type="button"
                onClick={() => onMove(stop, 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                {t.lessFavorite}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onInterest(stop, passed ? 'interested' : 'passed')}
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
          >
            {passed ? t.stillInterested : t.notInterested}
          </button>
        </div>
      )}
    </li>
  );
}

export default function BuyerClientPortal() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('t');
  const [plan, setPlan] = useState(null);
  const [errorKey, setErrorKey] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  const [loading, setLoading] = useState(true);
  const [feedbackError, setFeedbackError] = useState('');
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem('reai.portalLang') === 'en' ? 'en' : 'es';
    } catch {
      return 'es';
    }
  });

  const t = portalCopy(lang, plan?.tourKind);
  const locale = lang === 'es' ? 'es-US' : 'en-US';

  const changeLang = (next) => {
    setLang(next);
    try {
      localStorage.setItem('reai.portalLang', next);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!token) {
      setErrorKey('missingToken');
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setErrorKey('');
      setErrorDetail('');
      try {
        let cachedPlan = null;
        try {
          cachedPlan = await loadPlanFromFirestore(token);
          if (cachedPlan?.listings?.length) {
            setPlan(cachedPlan);
            setLoading(false);
          }
        } catch (cacheError) {
          if (cacheError.message === 'expired') throw cacheError;
        }

        try {
          const getBuyerPlan = httpsCallable(functions, 'getBuyerPlan', { timeout: 20000 });
          const { data } = await getBuyerPlan({ token });
          setPlan(data);
        } catch (callableError) {
          if (cachedPlan?.listings?.length) return;
          const firestorePlan = cachedPlan || await loadPlanFromFirestore(token);
          if (firestorePlan) {
            setPlan(firestorePlan);
            return;
          }
          throw callableError;
        }
      } catch (err) {
        console.error(err);
        if (err.message === 'expired') {
          setErrorKey('unavailableBody');
        } else if (isCloudFunctionsUnavailable(err)) {
          setErrorKey('functionsDown');
        } else {
          setErrorKey('unavailableBody');
          setErrorDetail(err.message || '');
        }
        setPlan(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    const tokenRef = doc(db, 'clientPlanTokens', token);
    return onSnapshot(tokenRef, (snap) => {
      if (!snap.exists()) return;
      const listings = snap.data()?.publicListings;
      if (!Array.isArray(listings) || !listings.length) return;
      setPlan((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          listings: preferListingPhotos(listings, prev.listings),
          tourKind: snap.data()?.tourKind || prev.tourKind,
        };
      });
    });
  }, [token]);

  const availabilityLabel = useMemo(
    () => formatAvailabilityLabel(plan?.availability, locale),
    [plan, locale],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <p className="text-sm text-slate-600">{t.loading}</p>
      </div>
    );
  }

  if (errorKey || !plan) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border border-slate-200 bg-white p-6">
          <LanguageToggle lang={lang} onChange={changeLang} />
          <div className="text-center">
            <h1 className="text-lg font-semibold text-slate-900 mb-2">{t.unavailableTitle}</h1>
            <p className="text-sm text-slate-600">{errorDetail || t[errorKey] || t.unavailableBody}</p>
          </div>
        </div>
      </div>
    );
  }

  const listingGroups = splitListingStops(plan.listings, plan.orderedStops);
  const pendingStops = listingGroups.pending;
  const showingDay = sortConfirmedForShowingDay(listingGroups.confirmed);

  const applyListings = (listings) => {
    setPlan((prev) => ({ ...prev, listings }));
  };

  const saveFeedback = async ({ updates = [], favoriteOrder } = {}) => {
    setFeedbackError('');
    const updateBuyerShowingFeedback = httpsCallable(functions, 'updateBuyerShowingFeedback');
    const { data } = await updateBuyerShowingFeedback({
      token,
      updates,
      favoriteOrder: favoriteOrder || undefined,
    });
    if (data?.listings) applyListings(data.listings);
    return data?.listings;
  };

  const mergeImportedStops = (importedStops) => {
    if (!importedStops?.length) return;
    setPlan((prev) => {
      const existing = prev?.listings || [];
      const merged = [...existing];
      importedStops.forEach((stop) => {
        const idx = merged.findIndex((row) => (
          (row.sourceUrl && stop.sourceUrl && row.sourceUrl === stop.sourceUrl)
          || (row.id && stop.id && row.id === stop.id)
          || (row.address && row.address === stop.address)
        ));
        if (idx >= 0) {
          merged[idx] = {
            ...merged[idx],
            ...stop,
            id: merged[idx].id || stop.id,
            photoUrl: stop.photoUrl || merged[idx].photoUrl || '',
            status: stop.status || merged[idx].status || 'pending',
          };
        } else {
          merged.push({ ...stop, status: stop.status || 'pending' });
        }
      });
      return { ...prev, listings: merged };
    });
  };

  const refreshPlan = async (importedStops) => {
    mergeImportedStops(importedStops);
    httpsCallable(functions, 'getBuyerPlan', { timeout: 20000 })({ token })
      .then(({ data }) => {
        setPlan((prev) => {
          if (!data) return prev;
          return {
            ...data,
            listings: preferListingPhotos(data.listings, prev?.listings || importedStops || []),
          };
        });
      })
      .catch(() => {});
  };

  const handleNote = async (stop, clientNote) => {
    await saveFeedback({ updates: [{ id: stop.id, address: stop.address, clientNote }] });
  };

  const handleInterest = async (stop, clientInterest) => {
    const remaining = showingDay.interested
      .filter((row) => row.id !== stop.id)
      .map((row) => row.id);
    try {
      await saveFeedback({
        updates: [{ id: stop.id, address: stop.address, clientInterest }],
        favoriteOrder: clientInterest === 'passed' ? remaining : undefined,
      });
    } catch {
      setFeedbackError(t.saveFailed);
    }
  };

  const handleMove = async (stop, direction) => {
    const current = showingDay.interested;
    const index = current.findIndex((row) => row.id === stop.id);
    const swap = index + direction;
    if (index < 0 || swap < 0 || swap >= current.length) return;
    const next = [...current];
    [next[index], next[swap]] = [next[swap], next[index]];
    try {
      await saveFeedback({ favoriteOrder: next.map((row) => row.id) });
    } catch {
      setFeedbackError(t.saveFailed);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <LanguageToggle lang={lang} onChange={changeLang} />
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <p className="text-xs uppercase tracking-wide text-blue-600 font-semibold mb-2">{t.kicker}</p>
          <h1 className="text-xl font-bold text-slate-900 mb-1 sm:text-2xl">
            {plan.buyers?.length
              ? `${t.tourFor} ${plan.buyerName}`
              : `${t.tourWith} ${plan.buyerName || t.yourAgent}`}
          </h1>
          <p className="text-sm text-slate-600 mb-4">{t.prepared(plan.agentName)}</p>

          {plan.buyers?.length > 0 && (
            <ul className="mb-5 flex flex-wrap gap-2">
              {plan.buyers.map((buyer, index) => (
                <li
                  key={`${buyer.name}-${index}`}
                  className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                >
                  {buyer.name}
                  {buyer.role === 'co_borrower' ? ` · ${t.coBorrower}` : ` · ${t.primary}`}
                </li>
              ))}
            </ul>
          )}

          {availabilityLabel && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 mb-5 text-sm text-slate-700">
              <Calendar className="w-4 h-4 text-slate-500" />
              {availabilityLabel}
            </div>
          )}

          {feedbackError && <p className="mb-4 text-sm text-rose-600">{feedbackError}</p>}

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-amber-600" />
              <h2 className="font-semibold text-slate-900">
                {pendingStops.length} {t.pendingTitle}
              </h2>
            </div>
            <p className="text-sm text-slate-600 mb-3">{t.pendingHelp}</p>
            {pendingStops.length === 0 ? (
              <p className="text-sm text-slate-500">{t.noPending}</p>
            ) : (
              <ul className="space-y-3">
                {pendingStops.map((stop, index) => (
                  <ShowingCard
                    key={stop.id || `pending-${stop.address}-${index}`}
                    stop={stop}
                    t={t}
                    lang={lang}
                    tourKind={plan.tourKind}
                    tone="pending"
                    onNote={handleNote}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-4 h-4 text-blue-600" />
              <h2 className="font-semibold text-slate-900">
                {listingGroups.confirmed.length} {t.confirmedTitle}
              </h2>
            </div>
            <p className="text-sm text-slate-600 mb-3">{t.showingDayHelp}</p>
            {listingGroups.confirmed.length === 0 ? (
              <p className="text-sm text-slate-500">{t.noConfirmed}</p>
            ) : (
              <ol className="space-y-3">
                {showingDay.interested.map((stop, index) => (
                  <ShowingCard
                    key={stop.id || `confirmed-${stop.address}-${index}`}
                    stop={stop}
                    t={t}
                    lang={lang}
                    tourKind={plan.tourKind}
                    tone="confirmed"
                    rankLabel={t.favoriteRank(stop.clientRank || index + 1)}
                    canRank={showingDay.interested.length > 1}
                    onMove={handleMove}
                    onNote={handleNote}
                    onInterest={handleInterest}
                  />
                ))}
              </ol>
            )}
            {showingDay.passed.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-slate-600 mb-2">{t.passedTitle}</h3>
                <ul className="space-y-3">
                  {showingDay.passed.map((stop, index) => (
                    <ShowingCard
                      key={stop.id || `passed-${stop.address}-${index}`}
                      stop={stop}
                      t={t}
                      lang={lang}
                      tourKind={plan.tourKind}
                      tone="confirmed"
                      passed
                      onNote={handleNote}
                      onInterest={handleInterest}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>

          {plan.mapsLink ? (
            <a
              href={plan.mapsLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700"
            >
              <ExternalLink className="w-4 h-4" />
              {t.openMaps}
            </a>
          ) : (
            <p className="text-sm text-slate-600">{t.noRoute}</p>
          )}

          {token && <ListingLinksForm token={token} t={t} onImported={refreshPlan} />}

          <p className="text-xs text-slate-500 mt-5">
            {t.expires}{' '}
            {plan.expiresAt
              ? new Date(plan.expiresAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short', hour12: true })
              : t.soon}
            .
          </p>
        </div>
      </div>
    </div>
  );
}
