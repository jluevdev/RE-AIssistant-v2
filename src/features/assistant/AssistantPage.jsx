import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { Sparkles } from 'lucide-react';
import { functions } from '../../config/firebase';
import { Button, Card, PageHeader, toast } from '../../components/ui';

const PROVIDER_OPTIONS = [
  { id: 'vertex', label: 'Platform Grok' },
  { id: 'grok', label: 'Grok (xAI)' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
];

export default function AssistantPage() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'bot',
      text: 'Ask about your tours, messages, open houses, or offers. I only see your own workspace.',
      links: [],
    },
  ]);
  const [provider, setProvider] = useState('vertex');
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState({ configured: false, provider: 'vertex', last4: '' });
  const [savingKey, setSavingKey] = useState(false);
  const [platform, setPlatform] = useState({ configured: false, last4: '', canEdit: false, source: 'none' });
  const [platformKey, setPlatformKey] = useState('');
  const [bots, setBots] = useState([]);
  const [activeBotId, setActiveBotId] = useState('desk');
  const [toolIds, setToolIds] = useState([]);
  const [draft, setDraft] = useState(null);

  function loadBots() {
    return httpsCallable(functions, 'listAssistantBots')().then(({ data }) => {
      setBots(data?.bots || []);
      setActiveBotId(data?.activeBotId || 'desk');
      setToolIds(data?.toolIds || []);
      const current = (data?.bots || []).find((bot) => bot.id === data?.activeBotId) || data?.bots?.[0];
      if (current) setDraft(current);
    });
  }

  useEffect(() => {
    let cancelled = false;
    httpsCallable(functions, 'getAiCredential')()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setSaved(data);
        setProvider(data.configured && data.provider && data.provider !== 'vertex' ? data.provider : 'vertex');
      })
      .catch(() => {});
    httpsCallable(functions, 'getPlatformAi')()
      .then(({ data }) => { if (!cancelled && data) setPlatform(data); })
      .catch(() => {});
    loadBots().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function ask(event) {
    event.preventDefault();
    const text = question.trim();
    if (!text || loading) return;
    setQuestion('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setLoading(true);
    try {
      const { data } = await httpsCallable(functions, 'askAssistant', { timeout: 120000 })({ question: text });
      setMessages((prev) => [
        ...prev,
        {
          role: 'bot',
          text: data?.answer || 'No answer returned.',
          links: Array.isArray(data?.links) ? data.links : [],
        },
      ]);
    } catch (error) {
      toast.error(error.message || 'Assistant failed');
      setMessages((prev) => [
        ...prev,
        { role: 'bot', text: error.message || 'Something went wrong.', links: [] },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function saveKey(event) {
    event.preventDefault();
    setSavingKey(true);
    try {
      if (provider === 'vertex') {
        const { data } = await httpsCallable(functions, 'clearAiCredential')();
        setSaved(data);
        setApiKey('');
        toast.success('Using the platform Grok key');
        return;
      }
      const { data } = await httpsCallable(functions, 'saveAiCredential')({ provider, apiKey });
      setSaved(data);
      setApiKey('');
      toast.success('AI key saved');
    } catch (error) {
      toast.error(error.message || 'Could not save the key');
    } finally {
      setSavingKey(false);
    }
  }

  async function savePlatform(event) {
    event.preventDefault();
    setSavingKey(true);
    try {
      const { data } = await httpsCallable(functions, 'savePlatformAiKey')({ apiKey: platformKey });
      setPlatform(data);
      setPlatformKey('');
      toast.success('Platform Grok key saved for every account');
    } catch (error) {
      toast.error(error.message || 'Could not save the platform key');
    } finally {
      setSavingKey(false);
    }
  }

  async function chooseBot(id) {
    setActiveBotId(id);
    const bot = bots.find((item) => item.id === id);
    if (bot) setDraft(bot);
    try {
      await httpsCallable(functions, 'setActiveAssistantBot')({ id });
    } catch (error) {
      toast.error(error.message || 'Could not switch bots');
    }
  }

  function toggleTool(tool) {
    setDraft((current) => {
      if (!current) return current;
      const tools = current.tools.includes(tool)
        ? current.tools.filter((item) => item !== tool)
        : [...current.tools, tool];
      return { ...current, tools };
    });
  }

  async function saveBot(event) {
    event.preventDefault();
    if (!draft) return;
    setSavingKey(true);
    try {
      await httpsCallable(functions, 'saveAssistantBot')(draft);
      toast.success(`${draft.name} saved`);
      await loadBots();
    } catch (error) {
      toast.error(error.message || 'Could not save the bot');
    } finally {
      setSavingKey(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        icon={Sparkles}
        title="Assistant"
        subtitle="Grok runs for every account. Pick a bot and it can only use the dashboard tools you leave on."
        backTo="/dashboard"
        backLabel="Dashboard"
      />

      <Card>
        <div className="space-y-3">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={message.role === 'user' ? 'text-right' : ''}>
              <div
                className={`inline-block max-w-[90%] rounded-xl px-3 py-2 text-left text-sm ${
                  message.role === 'user'
                    ? 'bg-brand-600 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-800'
                }`}
              >
                <p className="whitespace-pre-wrap">{message.text}</p>
                {message.links?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {message.links.map((link) => (
                      <Link
                        key={link.to}
                        to={link.to}
                        className="rounded-lg bg-white px-2 py-1 text-xs font-medium text-brand-700"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={ask} className="mt-4 flex gap-2">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="What is on my calendar Saturday?"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <Button type="submit" loading={loading} disabled={loading || !question.trim()}>
            Ask
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900">Platform Grok</h2>
        <p className="mt-1 text-sm text-slate-600">
          {platform.source === 'secret'
            ? 'The xAI key lives in the server secret XAI_API_KEY. You do not paste a key to use the assistant.'
            : platform.configured
              ? `A saved platform key is in use${platform.last4 ? ` (ending ${platform.last4})` : ''}. Prefer the XAI_API_KEY secret when you can.`
              : 'The assistant uses the platform XAI_API_KEY secret when it is set. A pasted key is only a fallback.'}
        </p>
        {platform.canEdit && platform.source !== 'secret' && (
          <form onSubmit={savePlatform} className="mt-4 flex gap-2">
            <input
              type="password"
              value={platformKey}
              onChange={(event) => setPlatformKey(event.target.value)}
              placeholder="Optional fallback xai- key"
              autoComplete="off"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <Button type="submit" variant="outline" loading={savingKey} disabled={savingKey || !platformKey.trim()}>
              Save fallback
            </Button>
          </form>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900">Bots</h2>
        <p className="mt-1 text-sm text-slate-600">Each bot delegates only the tools you leave checked.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {bots.map((bot) => (
            <Button key={bot.id} type="button" variant={bot.id === activeBotId ? 'primary' : 'outline'} onClick={() => chooseBot(bot.id)}>
              {bot.name}
            </Button>
          ))}
        </div>
        {draft && (
          <form onSubmit={saveBot} className="mt-4 space-y-3">
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <textarea
              value={draft.instructions}
              onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              {toolIds.map((tool) => (
                <button
                  key={tool}
                  type="button"
                  onClick={() => toggleTool(tool)}
                  className={`rounded-lg border px-2 py-1 text-xs ${
                    draft.tools.includes(tool) ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-300 text-slate-600'
                  }`}
                >
                  {tool}
                </button>
              ))}
            </div>
            <Button type="submit" variant="outline" loading={savingKey} disabled={savingKey}>Save bot</Button>
          </form>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900">Optional: bring your own key</h2>
        <p className="mt-1 text-sm text-slate-600">
          Leave this on Platform Grok. Paste a key only if this account should stop using the server key.
          {saved.configured ? ` Current key ends in ${saved.last4} (${saved.provider}).` : ''}
        </p>
        <form onSubmit={saveKey} className="mt-4 space-y-3">
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {PROVIDER_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          {provider !== 'vertex' && (
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="API key"
              autoComplete="off"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          )}
          <Button type="submit" variant="outline" loading={savingKey} disabled={savingKey}>
            {provider === 'vertex' ? 'Use platform Grok' : 'Save my key'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
