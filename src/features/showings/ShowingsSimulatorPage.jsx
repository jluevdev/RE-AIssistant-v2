import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';
import { Badge, Button, Card, PageHeader } from '../../components/ui';
import lifecycle from 'virtual:showings-lifecycle';

const engine = lifecycle.default || lifecycle;
const {
  HAPPY_IDS,
  STEPS,
  advanceHappy,
  applyCard,
  attestCurrent,
  createSession,
  mockOcr,
  simulateListingReply,
} = engine;

const TITLES = Object.fromEntries(STEPS.map((step) => [step.id, step.title]));

function snapshot(session) {
  if (!session) return null;
  return {
    tour: session.tour,
    verification: session.verification,
    approvals: session.approvals,
    threads: session.threads,
    messages: session.messages,
    audits: session.audits,
    dnc: session.dnc,
    profile: session.profile,
    cursor: session.cursor,
    network: session.network,
  };
}

export default function ShowingsSimulatorPage() {
  const sessionRef = useRef(null);
  const [tick, setTick] = useState(0);
  const [log, setLog] = useState([]);
  const [freeText, setFreeText] = useState('Please check with your seller and let me know.');
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    address: '123 Elm St',
    window: 'Sat 10:30–11:00',
    buyerName: 'Alex Rivera',
    buyerAgentName: 'Joseph Luevanos',
    listingAgentName: 'Maria Chen',
    listingAgentPhone: '2135550100',
    listingAgentEmail: 'maria@harbor.example',
    sellerName: 'Pat Seller',
    card: 'sample',
  });

  const view = useMemo(() => snapshot(sessionRef.current), [tick]);

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function reset(nextForm = form) {
    sessionRef.current = createSession({
      ...nextForm,
      listingAgentIsUser: false,
    });
    applyCard(sessionRef.current, nextForm.card);
    setLog([]);
    setTick((value) => value + 1);
  }

  async function nextStep() {
    if (!sessionRef.current) reset();
    setBusy(true);
    const row = await advanceHappy(sessionRef.current);
    setLog((current) => [...current, row]);
    setTick((value) => value + 1);
    setBusy(false);
  }

  async function reply(text) {
    if (!sessionRef.current) reset();
    setBusy(true);
    const session = sessionRef.current;
    const readyAt = HAPPY_IDS.indexOf('S14');
    while (session.cursor <= readyAt) {
      const row = await advanceHappy(session);
      setLog((current) => [...current, row]);
      setTick((value) => value + 1);
      if (!row.pass) {
        setBusy(false);
        return;
      }
    }
    const row = await simulateListingReply(session, text);
    setLog((current) => [...current, ...(session.recentRows || [row])]);
    setTick((value) => value + 1);
    setBusy(false);
  }

  function onUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(String(reader.result || ''));
      const card = /blank/i.test(file.name) ? 'blank' : 'sample';
      const next = { ...form, card };
      setForm(next);
      if (!sessionRef.current) reset(next);
      else applyCard(sessionRef.current, card);
      const extracted = mockOcr(card);
      setLog((current) => [...current, {
        id: 'S4',
        pass: extracted.ok && card === 'sample',
        detail: card === 'sample'
          ? `Mock OCR (no xAI): ${extracted.extraction.name}, DRE ${extracted.extraction.dreNumber}.`
          : 'Blank card. S4 on the happy path will fail; S6F is the Failed branch.',
      }]);
      setTick((value) => value + 1);
    };
    reader.readAsDataURL(file);
  }

  function attest() {
    if (!sessionRef.current) reset();
    const row = attestCurrent(sessionRef.current);
    setLog((current) => [...current, row]);
    setTick((value) => value + 1);
  }

  if (!import.meta.env.DEV) return null;

  const nextId = view ? HAPPY_IDS[view.cursor] : HAPPY_IDS[0];

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          icon={FlaskConical}
          title="SmartShowings simulator"
          subtitle="Dev only. Walks the numbered flow locally. SMS, email, and xAI stay mocked."
          actions={<Badge tone="warning">Not in production</Badge>}
        />
        <p className="text-sm text-slate-600">
          Step ids match <span className="font-medium">docs/smartshowings-flow.md</span>.
          {' '}
          <Link to="/showings" className="text-brand-700 underline">Back to SmartShowings</Link>
        </p>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-4">
            <Card>
              <h2 className="font-semibold text-slate-900">Fake request</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[
                  ['address', 'Address'],
                  ['window', 'Window'],
                  ['buyerName', 'Buyer'],
                  ['buyerAgentName', 'Buyer agent'],
                  ['listingAgentName', 'Listing agent'],
                  ['listingAgentPhone', 'Listing agent phone'],
                  ['listingAgentEmail', 'Listing agent email'],
                  ['sellerName', 'Seller'],
                ].map(([key, label]) => (
                  <label key={key} className="text-sm text-slate-700">
                    {label}
                    <input
                      value={form[key]}
                      onChange={(event) => setField(key, event.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" onClick={() => reset()} disabled={busy}>Reset</Button>
                <Button type="button" variant="outline" onClick={nextStep} disabled={busy || !nextId}>
                  {nextId ? `Next step (${nextId})` : 'Happy path complete'}
                </Button>
              </div>
            </Card>

            <Card>
              <h2 className="font-semibold text-slate-900">Business card</h2>
              <p className="mt-1 text-sm text-slate-600">
                Upload the sample or any image. Extraction is the local mock, not xAI.
                Name a file with “blank” to try the Failed branch.
              </p>
              <input type="file" accept="image/*,.svg" onChange={onUpload} className="mt-3 text-sm" />
              {preview && <img src={preview} alt="Uploaded card" className="mt-3 max-h-40 rounded border border-slate-200" />}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => { setField('card', 'sample'); reset({ ...form, card: 'sample' }); }}>Use sample card</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => { setField('card', 'blank'); reset({ ...form, card: 'blank' }); }}>Use blank card</Button>
                <Button type="button" size="sm" variant="outline" onClick={attest}>Attest Partial</Button>
              </div>
            </Card>

            <Card>
              <h2 className="font-semibold text-slate-900">Listing agent reply</h2>
              <p className="mt-1 text-sm text-slate-600">These play the request through S14 if you have not already, then apply the reply.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => reply('1')} disabled={busy}>1 approve</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => reply('2 3pm')} disabled={busy}>2 suggest 3pm</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => reply('3')} disabled={busy}>3 decline</Button>
                <Button type="button" size="sm" variant="danger" onClick={() => reply('STOP')} disabled={busy}>STOP</Button>
              </div>
              <label className="mt-3 block text-sm text-slate-700">
                Free text
                <textarea
                  value={freeText}
                  onChange={(event) => setFreeText(event.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
                  rows={2}
                />
              </label>
              <Button type="button" className="mt-2" size="sm" variant="outline" onClick={() => reply(freeText)} disabled={busy}>
                Send free text
              </Button>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <h2 className="font-semibold text-slate-900">Step log</h2>
              <ul className="mt-3 max-h-56 space-y-1 overflow-auto text-sm">
                {log.map((row, index) => (
                  <li key={`${row.id}-${index}`} className={row.pass ? 'text-slate-800' : 'text-rose-700'}>
                    <span className="font-mono">{row.id}</span>
                    {' '}
                    {row.pass ? 'PASS' : 'FAIL'}
                    {' '}
                    <span className="text-slate-600">{TITLES[row.id] || row.detail}</span>
                  </li>
                ))}
                {log.length === 0 && <li className="text-slate-500">Press Next step. S1 creates the tour stop.</li>}
              </ul>
            </Card>

            <Card>
              <h2 className="font-semibold text-slate-900">Tour and verification</h2>
              <p className="mt-2 text-sm text-slate-700">
                Status: <span className="font-medium">{view?.tour?.status || 'not created'}</span>
                {view?.tour?.rescheduleNote ? ` · ${view.tour.rescheduleNote}` : ''}
                {view?.tour?.optedOut ? ' · opted out' : ''}
              </p>
              <ul className="mt-2 text-sm text-slate-600">
                {(view?.tour?.parties || []).map((party) => (
                  <li key={party.role}>{party.role}: {party.name}</li>
                ))}
              </ul>
              {view?.verification && (
                <p className="mt-2 text-sm text-slate-700">
                  {view.verification.level || view.verification.status}
                  {view.verification.extraction?.name ? ` · ${view.verification.extraction.name}` : ''}
                  {view.verification.extraction?.dreNumber ? ` · DRE ${view.verification.extraction.dreNumber}` : ''}
                </p>
              )}
              {view?.profile && (
                <p className="mt-2 text-sm text-slate-600">
                  Profile: {view.profile.approvalMode}, occupants via {view.profile.occupantNotify}. Seller notified: {view.tour?.seller?.notified ? 'yes' : 'no'}.
                </p>
              )}
            </Card>

            <Card>
              <h2 className="font-semibold text-slate-900">Approval queue</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {(view?.approvals || []).map((row) => (
                  <li key={row.id} className="rounded-lg border border-slate-200 p-2">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{row.id} · {row.type} · {row.status}</p>
                    <p className="mt-1 whitespace-pre-wrap text-slate-800">{row.body}</p>
                  </li>
                ))}
                {!(view?.approvals || []).length && <li className="text-slate-500">Empty.</li>}
              </ul>
            </Card>

            <Card>
              <h2 className="font-semibold text-slate-900">Threads</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {(view?.threads || []).map((thread) => (
                  <li key={thread.id} className="rounded-lg border border-slate-200 p-2">
                    <p className="font-medium text-slate-800">{thread.role} · {thread.participants.length} participant{thread.optedOut ? ' · STOP' : ''}</p>
                    <p className="text-slate-600">{thread.messages.length} message{thread.messages.length === 1 ? '' : 's'}</p>
                  </li>
                ))}
                {!(view?.threads || []).length && <li className="text-slate-500">No threads yet.</li>}
              </ul>
              {!!(view?.dnc || []).length && <p className="mt-2 text-sm text-rose-700">Do not contact: {view.dnc.join(', ')}</p>}
            </Card>

            <Card>
              <h2 className="font-semibold text-slate-900">Audit log</h2>
              <ul className="mt-3 max-h-48 space-y-1 overflow-auto font-mono text-xs text-slate-700">
                {(view?.audits || []).map((entry) => (
                  <li key={entry.hash}>{entry.type} · {entry.summary} · {entry.hash.slice(0, 12)}</li>
                ))}
                {!(view?.audits || []).length && <li className="font-sans text-sm text-slate-500">Empty.</li>}
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
