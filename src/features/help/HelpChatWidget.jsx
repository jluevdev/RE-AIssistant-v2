import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { HelpCircle, Send, X } from 'lucide-react';
import { Button } from '../../components/ui';
import useHelpBot from './useHelpBot';
import { STARTER_PROMPTS } from './helpPrompts';

function BotMessage({ message, onNavigate }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] rounded-xl rounded-bl-sm bg-white border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm">
        <p className="whitespace-pre-wrap">{message.text}</p>
        {message.links?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={onNavigate}
                className="inline-flex items-center rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function HelpChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'bot',
      text: 'Hi! I can help you find features and navigate RE AIssistant. What would you like to do?',
      links: [{ to: '/dashboard', label: 'Dashboard' }],
    },
  ]);
  const { ask, loading } = useHelpBot();
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function submitQuestion(text) {
    const question = String(text || '').trim();
    if (!question || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: question }]);

    try {
      const result = await ask(question);
      setMessages((prev) => [
        ...prev,
        {
          role: 'bot',
          text: result?.answer || 'Something went wrong. Try again or use the sidebar.',
          links: result?.links || [],
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'bot',
          text: 'Could not reach help right now. Use the sidebar: Workspace, Listing Agent, Buyer Agent, and Team.',
          links: [{ to: '/dashboard', label: 'Dashboard' }],
        },
      ]);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    submitQuestion(input);
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/20 md:bg-transparent md:pointer-events-none"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end gap-3 md:bottom-6 md:right-6">
        {open && (
          <div
            className="pointer-events-auto flex w-[min(100vw-2rem,380px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-xl"
            role="dialog"
            aria-label="Help assistant"
          >
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <HelpCircle className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Help</p>
                  <p className="text-xs text-slate-500">App navigation & tools</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="Close help"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div ref={listRef} className="flex max-h-72 flex-col gap-3 overflow-y-auto px-3 py-3">
              {messages.map((msg, idx) =>
                msg.role === 'user' ? (
                  <div key={idx} className="flex justify-end">
                    <div className="max-w-[85%] rounded-xl rounded-br-sm bg-brand-600 px-3 py-2 text-sm text-white">
                      {msg.text}
                    </div>
                  </div>
                ) : (
                  <BotMessage key={idx} message={msg} onNavigate={() => setOpen(false)} />
                ),
              )}
              {loading && (
                <p className="text-xs text-slate-400 px-1">Thinking…</p>
              )}
            </div>

            {messages.length <= 1 && (
              <div className="flex flex-wrap gap-1.5 border-t border-slate-200 bg-white px-3 py-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => submitQuestion(prompt)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-3">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask how to do something…"
                  maxLength={500}
                  disabled={loading}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
                />
                <Button type="submit" size="sm" disabled={loading || !input.trim()} aria-label="Send">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          aria-label={open ? 'Close help' : 'Open help'}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <HelpCircle className="h-5 w-5" />}
        </button>
      </div>
    </>
  );
}
