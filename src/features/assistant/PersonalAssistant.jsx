import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Send, X } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { Button } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { OPEN_HELP_EVENT } from '../tester/TesterChecklistContext';
import useHelpBot from '../help/useHelpBot';
import { useOnboardingUi } from '../onboarding/OnboardingContext';
import { WALKAROUND, WIZARD_GUIDE, DEMO_TOOLS, canDemoBots } from './walkaround';

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'AI';
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
}

export default function PersonalAssistant() {
  const { currentUser, userProfile, updateUserProfile, refreshUserProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const assistant = userProfile?.personalAssistant || null;
  const name = String(assistant?.name || '').trim();
  const hidden = Boolean(assistant?.hidden);
  const walkaroundDone = Boolean(assistant?.walkaroundDone);
  const step = Math.min(Number(assistant?.walkaroundStep) || 0, WALKAROUND.length - 1);
  const stop = WALKAROUND[step];
  const { ask, loading } = useHelpBot();
  const { guide, startBotGuide, advanceBotGuide } = useOnboardingUi();
  const demo = canDemoBots(currentUser, userProfile);
  const [open, setOpen] = useState(false);
  const [making, setMaking] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftJob, setDraftJob] = useState('');
  const [draftTools, setDraftTools] = useState(['messages', 'tours']);
  const [question, setQuestion] = useState('');
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);
  const demoBots = Array.isArray(userProfile?.demoBots) ? userProfile.demoBots : [];
  const guideLine = guide ? WIZARD_GUIDE[Math.min(guide.step, WIZARD_GUIDE.length - 1)] : '';

  const demoOpened = useRef(false);

  const needsAssistant = !name;

  useEffect(() => {
    if (hidden) return;
    if (needsAssistant) {
      setOpen(true);
      setMaking(true);
      return;
    }
    if (name && !walkaroundDone) setOpen(true);
    if (demo && !demoOpened.current) {
      demoOpened.current = true;
      setOpen(true);
    }
  }, [demo, hidden, name, needsAssistant, walkaroundDone]);

  useEffect(() => {
    function handleOpenHelp() {
      setOpen(true);
      if (hidden && currentUser) {
        saveAssistant({ hidden: false });
      }
    }
    window.addEventListener(OPEN_HELP_EVENT, handleOpenHelp);
    return () => window.removeEventListener(OPEN_HELP_EVENT, handleOpenHelp);
  }, [hidden, currentUser]);

  if (!currentUser) return null;

  async function saveAssistant(patch) {
    const next = {
      name,
      hidden: false,
      walkaroundStep: step,
      walkaroundDone,
      ...patch,
    };
    await updateUserProfile(currentUser.uid, { personalAssistant: next });
  }

  async function createWithWizard(event) {
    event.preventDefault();
    const chosen = draftName.trim().slice(0, 24);
    if (chosen.length < 2) return;
    const id = chosen.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'assistant';
    const nextBot = {
      id,
      name: chosen,
      job: draftJob.trim().slice(0, 140),
      tools: draftTools.length ? draftTools : ['messages'],
    };
    setSaving(true);
    try {
      try {
        await httpsCallable(functions, 'createPersonalAssistant')({
          name: chosen,
          job: nextBot.job,
          tools: nextBot.tools,
          another: Boolean(name),
        });
        await refreshUserProfile();
      } catch {
        await updateUserProfile(currentUser.uid, {
          personalAssistant: {
            name: name || chosen,
            hidden: false,
            walkaroundStep: name ? step : 0,
            walkaroundDone: true,
          },
          demoBots: [...demoBots.filter((bot) => bot.id !== id), nextBot],
        });
      }
      setMaking(false);
      setDraftName('');
      setDraftJob('');
      setOpen(true);
      startBotGuide(chosen);
    } finally {
      setSaving(false);
    }
  }

  function toggleTool(toolId) {
    setDraftTools((current) => (
      current.includes(toolId) ? current.filter((tool) => tool !== toolId) : [...current, toolId]
    ));
  }

  async function goTo(nextStep, done) {
    const target = WALKAROUND[Math.min(nextStep, WALKAROUND.length - 1)];
    setSaving(true);
    try {
      await saveAssistant({ walkaroundStep: nextStep, walkaroundDone: done });
      if (!done) navigate(target.to);
    } finally {
      setSaving(false);
    }
  }

  async function askQuestion(event) {
    event.preventDefault();
    const text = question.trim();
    if (!text || loading) return;
    setQuestion('');
    try {
      const result = await ask(text);
      setReply(result?.answer || 'I could not answer that just now.');
    } catch {
      setReply('I could not reach the assistant just now. Use the sidebar to keep going.');
    }
  }

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => saveAssistant({ hidden: false }).then(() => setOpen(true))}
        className="fixed bottom-24 right-4 z-40 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-md hover:bg-slate-50 md:bottom-6"
      >
        Show {name || 'AIssistant'}
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 right-4 z-[60] flex flex-col items-end gap-3 md:bottom-6">
      {open && (
        <div className="w-[min(100vw-2rem,340px)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{name || 'Your AIssistant'}</p>
              <p className="text-xs text-slate-500">
                {name ? 'On screen with you' : 'Create your personal assistant'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              aria-label="Collapse assistant"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {guide && (
            <div className="mt-3 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-700">
                Wizard step {(guide.step || 0) + 1} of {WIZARD_GUIDE.length}
              </p>
              <p className="text-sm text-slate-600">{guideLine}</p>
              <Button type="button" onClick={advanceBotGuide}>Next</Button>
            </div>
          )}

          {(needsAssistant || making) && !guide && (
            <form onSubmit={createWithWizard} className="mt-3 space-y-3">
              <p className="text-sm text-slate-600">
                {needsAssistant
                  ? 'This account does not have an AIssistant yet. Name one and I will walk the setup wizard with you.'
                  : 'Name this bot, then I will walk the setup wizard with you.'}
              </p>
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Assistant name"
                maxLength={24}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                autoFocus
              />
              <input
                value={draftJob}
                onChange={(event) => setDraftJob(event.target.value)}
                placeholder="What should this assistant handle?"
                maxLength={140}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                {DEMO_TOOLS.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => toggleTool(tool.id)}
                    className={`rounded-lg border px-2 py-1 text-xs ${
                      draftTools.includes(tool.id) ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-300 text-slate-600'
                    }`}
                  >
                    {tool.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={saving || draftName.trim().length < 2} loading={saving}>
                  Create and start wizard
                </Button>
                {!needsAssistant && (
                  <Button type="button" variant="outline" onClick={() => setMaking(false)}>Cancel</Button>
                )}
              </div>
            </form>
          )}

          {demo && !needsAssistant && !guide && !making && (
            <div className="mt-3 space-y-2">
              <Button type="button" onClick={() => setMaking(true)}>Make a new bot</Button>
              {demoBots.length > 0 && (
                <ul className="space-y-1 text-sm text-slate-600">
                  {demoBots.map((bot) => (
                    <li key={bot.id}>{bot.name}{bot.job ? ` — ${bot.job}` : ''}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {name && !walkaroundDone && !guide && !making && (
            <div className="mt-3 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-700">
                Walkaround {step + 1} of {WALKAROUND.length}
              </p>
              <p className="text-sm font-semibold text-slate-900">{stop.title}</p>
              <p className="text-sm text-slate-600">{stop.line}</p>
              {location.pathname !== stop.to && (
                <Button type="button" variant="outline" onClick={() => navigate(stop.to)}>
                  Take me there
                </Button>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => goTo(step + 1, step + 1 >= WALKAROUND.length)}
                  disabled={saving}
                  loading={saving}
                >
                  {step + 1 >= WALKAROUND.length ? 'Finish' : 'Next'}
                </Button>
                <Button type="button" variant="outline" onClick={() => goTo(step, true)} disabled={saving}>
                  Skip
                </Button>
              </div>
            </div>
          )}

          {name && walkaroundDone && !guide && !making && (
            <form onSubmit={askQuestion} className="mt-3 space-y-2">
              <p className="text-sm text-slate-600">
                {reply || `I'm ${name}. Ask me where something is, or walk around again.`}
              </p>
              <div className="flex gap-2">
                <input
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Ask me…"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <Button type="submit" disabled={loading || !question.trim()} aria-label="Send">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <button
                type="button"
                onClick={() => goTo(0, false)}
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                Walk me around again
              </button>
            </form>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        {name && (
          <button
            type="button"
            onClick={() => saveAssistant({ hidden: true }).then(() => setOpen(false))}
            className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 shadow-sm hover:bg-slate-50"
            aria-label="Hide assistant"
            title="Hide"
          >
            <EyeOff className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex items-center gap-2 rounded-full bg-brand-600 py-2 pl-2 pr-4 text-white shadow-lg"
          style={{ animation: 'assistant-breathe 2.8s ease-in-out infinite' }}
          aria-label={open ? `Collapse ${name || 'assistant'}` : `Open ${name || 'assistant'}`}
        >
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">
            <span className="absolute inset-0 rounded-full bg-white/30 animate-ping" />
            <span className="relative">{initials(name)}</span>
          </span>
          <span className="text-sm font-medium">{guide?.name || name || 'AIssistant'}</span>
          {open ? <Eye className="h-4 w-4 opacity-80" /> : null}
        </button>
      </div>
    </div>
  );
}
