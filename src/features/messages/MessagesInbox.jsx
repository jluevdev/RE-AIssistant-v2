import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, MessageSquare, Search, Send } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { writeBatch, doc } from 'firebase/firestore';
import { db, functions } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Badge, Button, EmptyState, Input, PageHeader, toast } from '../../components/ui';
import { subscribeToAgentMessages } from './agentMessagesSubscription';
import {
  QUICK_REPLY_TEMPLATES,
  buildThreads,
  formatMessageTime,
  formatPhone,
  formatRelativeTime,
  getThreadMessages,
  normalizePhoneKey,
} from './messageUtils';

export default function MessagesInbox() {
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPhone, setSelectedPhone] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [indexPending, setIndexPending] = useState(false);
  const messagesEndRef = useRef(null);
  const composerRef = useRef(null);
  const errorToastShown = useRef(false);

  useEffect(() => {
    if (!currentUser?.uid) {
      setMessages([]);
      setLoading(false);
      return undefined;
    }

    errorToastShown.current = false;

    return subscribeToAgentMessages(
      db,
      { agentUid: currentUser.uid, agentEmail: currentUser.email || null },
      {
        onData: (nextMessages) => {
          setMessages(nextMessages);
          setLoading(false);
        },
        onIndexPending: setIndexPending,
        onError: (error) => {
          setLoading(false);
          if (!errorToastShown.current) {
            errorToastShown.current = true;
            const needsIndex = String(error?.message || '').toLowerCase().includes('index');
            toast.error(
              needsIndex
                ? 'Firestore index required. Run: firebase deploy --only firestore:indexes'
                : 'Could not load messages.'
            );
          }
        },
      }
    );
  }, [currentUser?.uid]);

  const threads = useMemo(() => buildThreads(messages), [messages]);

  const filteredThreads = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return threads;
    return threads.filter((thread) => {
      const phone = formatPhone(thread.contactPhone).toLowerCase();
      const preview = (thread.lastMessage?.body || '').toLowerCase();
      return phone.includes(term) || thread.contactPhone.includes(term) || preview.includes(term);
    });
  }, [threads, search]);

  const selectedThread = useMemo(
    () => threads.find((t) => t.contactPhone === selectedPhone) ?? null,
    [threads, selectedPhone]
  );

  const conversationMessages = useMemo(
    () => (selectedPhone ? getThreadMessages(messages, selectedPhone) : []),
    [messages, selectedPhone]
  );

  const markThreadRead = useCallback(
    async (contactPhone) => {
      if (!currentUser?.uid) return;
      const unread = messages.filter(
        (m) =>
          normalizePhoneKey(m.contactPhone) === normalizePhoneKey(contactPhone) &&
          m.direction === 'inbound' &&
          m.read === false
      );
      if (!unread.length) return;

      try {
        const batch = writeBatch(db);
        unread.forEach((m) => {
          batch.update(doc(db, 'messages', m.id), { read: true });
        });
        await batch.commit();
      } catch (error) {
        console.warn('Mark-as-read failed:', error);
      }
    },
    [currentUser?.uid, messages]
  );

  useEffect(() => {
    if (selectedPhone) {
      markThreadRead(selectedPhone);
    }
  }, [selectedPhone, markThreadRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationMessages.length, selectedPhone]);

  const handleSend = async () => {
    const text = replyText.trim();
    if (!text || !selectedPhone || sending) return;

    setSending(true);
    try {
      const sendAgentSms = httpsCallable(functions, 'sendAgentSms');
      const payload = {
        toPhone: selectedPhone,
        message: text,
      };
      if (selectedThread?.offerId) payload.offerId = selectedThread.offerId;
      if (selectedThread?.listingId) payload.listingId = selectedThread.listingId;
      if (selectedThread?.scheduleId) payload.scheduleId = selectedThread.scheduleId;

      await sendAgentSms(payload);
      setReplyText('');
      toast.success('Message sent');
      composerRef.current?.focus();
    } catch (error) {
      console.error('sendAgentSms failed:', error);
      toast.error(error.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const handleComposerKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const insertTemplate = (text) => {
    setReplyText((prev) => (prev ? `${prev} ${text}` : text));
    composerRef.current?.focus();
  };

  const showListOnMobile = !selectedPhone;
  const showConversationOnMobile = Boolean(selectedPhone);

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8">
      <div className="px-4 sm:px-6 lg:px-8 mb-4">
        <PageHeader
          title="Messages"
          subtitle="SMS conversations with buyers and contacts."
        />
        {indexPending && (
          <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Firestore index is still building. Messages load via fallback — deploy indexes with{' '}
            <code className="text-xs bg-amber-100 px-1 rounded">firebase deploy --only firestore:indexes</code>{' '}
            for best performance.
          </p>
        )}
      </div>

      <div className="flex h-[calc(100dvh-10rem)] md:h-[calc(100dvh-12rem)] border-y md:border border-slate-200 md:rounded-xl md:mx-4 lg:mx-8 bg-white overflow-hidden shadow-sm">
        {/* Thread list */}
        <aside
          className={[
            'flex flex-col border-r border-slate-200 bg-white shrink-0 w-full md:w-[360px]',
            showListOnMobile ? 'flex' : 'hidden md:flex',
          ].join(' ')}
        >
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <Input
                type="search"
                placeholder="Search by phone or message…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                aria-label="Search conversations"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto" role="list" aria-label="Conversations">
            {loading ? (
              <p className="p-4 text-sm text-slate-500">Loading conversations…</p>
            ) : filteredThreads.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title={search ? 'No matches' : 'No conversations yet'}
                description={
                  search
                    ? 'Try a different search term.'
                    : 'Inbound SMS from your Twilio number will appear here.'
                }
                className="py-12"
              />
            ) : (
              filteredThreads.map((thread) => {
                const isActive = thread.contactPhone === selectedPhone;
                const preview = thread.lastMessage?.body || '';
                const direction = thread.lastMessage?.direction;

                return (
                  <button
                    key={thread.contactPhone}
                    type="button"
                    role="listitem"
                    onClick={() => setSelectedPhone(thread.contactPhone)}
                    className={[
                      'w-full text-left px-4 py-3 border-b border-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500',
                      isActive ? 'bg-brand-50' : 'hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {formatPhone(thread.contactPhone)}
                      </p>
                      <span className="text-xs text-slate-400 shrink-0">
                        {formatRelativeTime(thread.lastMessage?.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-sm text-slate-500 truncate flex-1">
                        {direction === 'outbound' && (
                          <span className="text-slate-400">You: </span>
                        )}
                        {preview}
                      </p>
                      {thread.unreadCount > 0 && (
                        <Badge tone="brand" className="shrink-0 min-w-[1.25rem] justify-center">
                          {thread.unreadCount > 99 ? '99+' : thread.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Conversation pane */}
        <section
          className={[
            'flex flex-col flex-1 min-w-0 bg-slate-50',
            showConversationOnMobile ? 'flex' : 'hidden md:flex',
          ].join(' ')}
        >
          {!selectedPhone ? (
            <div className="hidden md:flex flex-1 items-center justify-center">
              <EmptyState
                icon={MessageSquare}
                title="Select a conversation"
                description="Choose a thread from the list to read and reply."
              />
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setSelectedPhone(null)}
                  className="md:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-900 truncate">
                    {formatPhone(selectedPhone)}
                  </h2>
                  <p className="text-xs text-slate-500">SMS thread</p>
                </div>
              </header>

              <div
                className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
                role="log"
                aria-live="polite"
                aria-label="Message history"
              >
                {conversationMessages.length === 0 ? (
                  <EmptyState
                    icon={MessageSquare}
                    title="No messages yet"
                    description="Send a reply below to start the conversation."
                    className="py-8"
                  />
                ) : (
                  conversationMessages.map((message) => {
                    const outbound = message.direction === 'outbound';
                    return (
                      <div
                        key={message.id}
                        className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}
                      >
                        {outbound ? (
                          <div className="max-w-[85%] sm:max-w-[70%] rounded-2xl rounded-br-md px-4 py-2 shadow-sm bg-brand-600">
                            <p className="text-sm whitespace-pre-wrap break-words text-white">
                              {message.body}
                            </p>
                            <p className="text-[10px] mt-1 text-blue-100">
                              {formatMessageTime(message.createdAt)}
                            </p>
                          </div>
                        ) : (
                          <div className="max-w-[85%] sm:max-w-[70%] rounded-2xl rounded-bl-md px-4 py-2 shadow-sm bg-white border border-slate-200">
                            <p className="text-sm whitespace-pre-wrap break-words text-slate-800">
                              {message.body}
                            </p>
                            <p className="text-[10px] mt-1 text-slate-400">
                              {formatMessageTime(message.createdAt)}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <footer className="border-t border-slate-200 bg-white p-3 space-y-2">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Quick replies">
                  {QUICK_REPLY_TEMPLATES.map((template) => (
                    <button
                      key={template}
                      type="button"
                      onClick={() => insertTemplate(template)}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      {template}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 items-end">
                  <textarea
                    ref={composerRef}
                    rows={2}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder="Type a reply…"
                    disabled={sending}
                    aria-label="Reply message"
                    className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:opacity-50"
                  />
                  <Button
                    type="button"
                    onClick={handleSend}
                    disabled={sending || !replyText.trim()}
                    aria-label="Send message"
                  >
                    <Send className="w-4 h-4" />
                    <span className="hidden sm:inline">Send</span>
                  </Button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
