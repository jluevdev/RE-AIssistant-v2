import { useEffect, useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Table,
  Tooltip,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  toast,
} from '../../components/ui';
import { formatPhone, formatRelativeTime } from '../messages/messageUtils';
import {
  DELAY_PRESETS,
  REMINDER_PRESETS,
  RULE_META,
  SAMPLE_VARS,
  TIMEZONES,
  TYPE_LABELS,
  getDefaultAutomationSettings,
  mergeSettings,
  renderTemplate,
  resolveDelayMinutes,
  statusTone,
} from './automationsUtils';

function RuleCard({ ruleKey, rule, onChange, disabled }) {
  const meta = RULE_META[ruleKey];
  if (!meta) return null;

  const previewVars = { ...SAMPLE_VARS, minutesBefore: String(rule.minutesBefore || 60) };
  const previewBody = renderTemplate(rule.template, previewVars);
  const previewSubject = rule.subject ? renderTemplate(rule.subject, previewVars) : null;

  return (
    <Card className={disabled || meta.comingSoon ? 'opacity-70' : ''}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-900">{meta.title}</h3>
            <Badge tone={meta.channel === 'email' ? 'neutral' : 'brand'}>
              {meta.channel.toUpperCase()}
            </Badge>
            {meta.comingSoon && <Badge tone="warning">Coming soon</Badge>}
          </div>
          <p className="mt-1 text-sm text-slate-500">{meta.description}</p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            checked={Boolean(rule.enabled)}
            disabled={disabled || meta.comingSoon}
            onChange={(e) => onChange({ ...rule, enabled: e.target.checked })}
          />
          Enabled
        </label>
      </div>

      {!meta.comingSoon && (
        <div className="mt-4 space-y-3">
          {meta.timing === 'minutesBefore' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Remind me"
                value={
                  REMINDER_PRESETS.some((p) => p.minutes === Number(rule.minutesBefore))
                    ? String(rule.minutesBefore)
                    : 'custom'
                }
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    onChange({ ...rule, minutesBefore: Number(rule.minutesBefore) || 60 });
                  } else {
                    onChange({ ...rule, minutesBefore: Number(e.target.value) });
                  }
                }}
                disabled={disabled}
              >
                {REMINDER_PRESETS.map((p) => (
                  <option key={p.minutes} value={p.minutes}>
                    {p.label}
                  </option>
                ))}
                <option value="custom">Custom minutes</option>
              </Select>
              <Input
                label="Minutes before start"
                type="number"
                min={5}
                value={rule.minutesBefore ?? 60}
                onChange={(e) =>
                  onChange({ ...rule, minutesBefore: Math.max(5, Number(e.target.value) || 60) })
                }
                disabled={disabled}
              />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Send after"
                value={rule.delayPreset || '1h'}
                onChange={(e) => {
                  const preset = e.target.value;
                  const minutes = resolveDelayMinutes(preset, rule.delayMinutes);
                  onChange({ ...rule, delayPreset: preset, delayMinutes: minutes });
                }}
                disabled={disabled}
              >
                {DELAY_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
              {rule.delayPreset === 'custom' && (
                <Input
                  label="Custom minutes"
                  type="number"
                  min={0}
                  value={rule.delayMinutes ?? 0}
                  onChange={(e) =>
                    onChange({
                      ...rule,
                      delayMinutes: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  disabled={disabled}
                />
              )}
            </div>
          )}

          {meta.channel === 'email' && (
            <Input
              label="Subject"
              value={rule.subject || ''}
              onChange={(e) => onChange({ ...rule, subject: e.target.value })}
              disabled={disabled}
            />
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Template</label>
            <textarea
              rows={4}
              value={rule.template || ''}
              onChange={(e) => onChange({ ...rule, template: e.target.value })}
              disabled={disabled}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-slate-400">
              Merge fields: {'{{visitorName}}'}, {'{{address}}'}, {'{{agentName}}'}, {'{{price}}'}, etc.
            </p>
          </div>

          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <p className="text-xs font-medium text-slate-500 mb-1">Preview</p>
            {previewSubject && (
              <p className="text-sm font-medium text-slate-800 mb-1">Subject: {previewSubject}</p>
            )}
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{previewBody || '—'}</p>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function AutomationsPage() {
  const { currentUser, userProfile } = useAuth();
  const [tab, setTab] = useState('rules');
  const [settings, setSettings] = useState(() => getDefaultAutomationSettings(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    if (!currentUser?.uid) {
      setLoading(false);
      return undefined;
    }

    const ref = doc(db, 'automationSettings', currentUser.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setSettings(mergeSettings(snap.exists() ? snap.data() : null, currentUser.uid));
        setLoading(false);
      },
      (error) => {
        console.error('automationSettings subscribe error:', error);
        setSettings(mergeSettings(null, currentUser.uid));
        setLoading(false);
      }
    );
    return unsub;
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!currentUser?.uid) {
      setTasks([]);
      setTasksLoading(false);
      return undefined;
    }

    let unsub = () => {};
    const apply = (snapshot) => {
      setTasks(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setTasksLoading(false);
    };

    const indexed = query(
      collection(db, 'scheduledTasks'),
      where('ownerUid', '==', currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    unsub = onSnapshot(indexed, apply, (error) => {
      const needsIndex = String(error?.message || '').toLowerCase().includes('index');
      if (needsIndex) {
        const fallback = query(
          collection(db, 'scheduledTasks'),
          where('ownerUid', '==', currentUser.uid)
        );
        unsub = onSnapshot(
          fallback,
          (snap) => {
            const rows = snap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .sort((a, b) => {
                const aMs = a.createdAt?.toMillis?.() || 0;
                const bMs = b.createdAt?.toMillis?.() || 0;
                return bMs - aMs;
              })
              .slice(0, 50);
            setTasks(rows);
            setTasksLoading(false);
          },
          () => setTasksLoading(false)
        );
        return;
      }
      console.error('scheduledTasks subscribe error:', error);
      setTasksLoading(false);
    });

    return () => unsub();
  }, [currentUser?.uid]);

  const filteredTasks = useMemo(() => {
    if (statusFilter === 'all') return tasks;
    return tasks.filter((t) => t.status === statusFilter);
  }, [tasks, statusFilter]);

  const updateRule = (key, next) => {
    setSettings((prev) => ({
      ...prev,
      rules: { ...prev.rules, [key]: next },
    }));
  };

  const updateGlobal = (patch) => {
    setSettings((prev) => ({
      ...prev,
      global: { ...prev.global, ...patch },
    }));
  };

  const enableRecommended = () => {
    setSettings((prev) => ({
      ...prev,
      rules: {
        ...prev.rules,
        openHouseAgentReminderSms: {
          ...prev.rules.openHouseAgentReminderSms,
          enabled: true,
          minutesBefore: prev.rules.openHouseAgentReminderSms?.minutesBefore || 60,
        },
      },
    }));
    toast.success('Recommended: open house agent reminder enabled. Click Save to apply.');
  };

  const handleSave = async () => {
    if (!currentUser?.uid) return;
    setSaving(true);
    try {
      const payload = {
        ownerUid: currentUser.uid,
        global: settings.global,
        rules: {
          ...settings.rules,
          openHouseVisitorSms: {
            ...settings.rules.openHouseVisitorSms,
            delayMinutes: resolveDelayMinutes(
              settings.rules.openHouseVisitorSms.delayPreset,
              settings.rules.openHouseVisitorSms.delayMinutes
            ),
          },
          openHouseVisitorEmail: {
            ...settings.rules.openHouseVisitorEmail,
            delayMinutes: resolveDelayMinutes(
              settings.rules.openHouseVisitorEmail.delayPreset,
              settings.rules.openHouseVisitorEmail.delayMinutes
            ),
          },
          offerBuyerAgentSms: {
            ...settings.rules.offerBuyerAgentSms,
            delayMinutes: resolveDelayMinutes(
              settings.rules.offerBuyerAgentSms.delayPreset,
              settings.rules.offerBuyerAgentSms.delayMinutes
            ),
          },
          offerBuyerAgentEmail: {
            ...settings.rules.offerBuyerAgentEmail,
            delayMinutes: resolveDelayMinutes(
              settings.rules.offerBuyerAgentEmail.delayPreset,
              settings.rules.offerBuyerAgentEmail.delayMinutes
            ),
          },
        },
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'automationSettings', currentUser.uid), payload, { merge: true });
      toast.success('Automations saved');
    } catch (error) {
      console.error('Save automations failed:', error);
      toast.error(error.message || 'Could not save automations');
    } finally {
      setSaving(false);
    }
  };

  const agentName =
    userProfile?.fullName?.split(' ')[0] ||
    currentUser?.displayName?.split(' ')[0] ||
    'Agent';

  return (
    <div>
      <PageHeader
        icon={Zap}
        title="Automations"
        subtitle="Follow-ups and reminders that run while you work — or sleep."
        actions={
          tab === 'rules' ? (
            <Button type="button" onClick={handleSave} loading={saving} disabled={loading || saving}>
              Save
            </Button>
          ) : null
        }
      />

      <div className="flex gap-2 mb-6" role="tablist" aria-label="Automations sections">
        {[
          { id: 'rules', label: 'Rules' },
          { id: 'activity', label: 'Activity' },
        ].map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={[
              'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
              tab === id
                ? 'border-brand-600 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'rules' && (
        <div className="space-y-6">
          {loading ? (
            <p className="text-sm text-slate-500">Loading settings…</p>
          ) : (
            <>
              <Card>
                <h3 className="font-semibold text-slate-900">Global</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Quiet hours and send windows apply to delayed automations for {agentName}.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      checked={Boolean(settings.global.quietHoursEnabled)}
                      onChange={(e) => updateGlobal({ quietHoursEnabled: e.target.checked })}
                    />
                    <Tooltip content="Overnight sends are deferred until your quiet-hours window ends — respects your timezone.">
                      <span className="underline decoration-dotted cursor-help">
                        Quiet hours (defer sends overnight)
                      </span>
                    </Tooltip>
                  </label>
                  <Input
                    label="Quiet hours start"
                    type="time"
                    value={settings.global.quietHoursStart || '21:00'}
                    onChange={(e) => updateGlobal({ quietHoursStart: e.target.value })}
                    disabled={!settings.global.quietHoursEnabled}
                  />
                  <Input
                    label="Quiet hours end"
                    type="time"
                    value={settings.global.quietHoursEnd || '08:00'}
                    onChange={(e) => updateGlobal({ quietHoursEnd: e.target.value })}
                    disabled={!settings.global.quietHoursEnabled}
                  />
                  <Select
                    label="Timezone"
                    value={settings.global.timezone || 'America/Los_Angeles'}
                    onChange={(e) => updateGlobal({ timezone: e.target.value })}
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </Select>
                  <Select
                    label="Send window"
                    value={settings.global.sendWindow || 'immediate'}
                    onChange={(e) => updateGlobal({ sendWindow: e.target.value })}
                  >
                    <option value="immediate">Immediate (after delay)</option>
                    <option value="business_hours">Business hours (9am–6pm)</option>
                  </Select>
                </div>
                <div className="mt-4">
                  <Button type="button" variant="outline" onClick={enableRecommended}>
                    Enable recommended defaults
                  </Button>
                  <p className="mt-2 text-xs text-slate-500">
                    Turns on open house agent reminder SMS only. Other rules stay off until you enable them.
                  </p>
                </div>
              </Card>

              {Object.keys(RULE_META).map((key) => (
                <RuleCard
                  key={key}
                  ruleKey={key}
                  rule={settings.rules[key] || {}}
                  onChange={(next) => updateRule(key, next)}
                />
              ))}

              <div className="flex justify-end">
                <Button type="button" onClick={handleSave} loading={saving} disabled={saving}>
                  Save automations
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'activity' && (
        <div>
          <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filter activity">
            {['all', 'scheduled', 'sent', 'failed', 'skipped'].map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id)}
                className={[
                  'rounded-full border px-3 py-1 text-xs font-medium capitalize',
                  statusFilter === id
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                ].join(' ')}
              >
                {id}
              </button>
            ))}
          </div>

          {tasksLoading ? (
            <p className="text-sm text-slate-500">Loading activity…</p>
          ) : filteredTasks.length === 0 ? (
            <EmptyState
              icon={Zap}
              title="No automation activity yet"
              description="Enable a rule in the Rules tab — visitor follow-ups and reminders show up here within a few minutes."
              action={
                <Button type="button" variant="outline" onClick={() => setTab('rules')}>
                  Configure rules
                </Button>
              }
            />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <THead>
                    <Tr>
                      <Th>When</Th>
                      <Th>Type</Th>
                      <Th>Recipient</Th>
                      <Th>Status</Th>
                      <Th>Detail</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {filteredTasks.map((task) => (
                      <Tr key={task.id}>
                        <Td>{formatRelativeTime(task.sentAt || task.createdAt) || '—'}</Td>
                        <Td>{TYPE_LABELS[task.type] || task.type}</Td>
                        <Td>
                          {task.contactPhone
                            ? formatPhone(task.contactPhone)
                            : task.contactEmail || '—'}
                        </Td>
                        <Td>
                          <Badge tone={statusTone(task.status)}>{task.status}</Badge>
                        </Td>
                        <Td className="max-w-[220px] truncate text-xs text-slate-500">
                          {task.lastError || task.payload?.body || '—'}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </div>

              <div className="md:hidden space-y-3">
                {filteredTasks.map((task) => (
                  <Card key={task.id}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-slate-900">
                        {TYPE_LABELS[task.type] || task.type}
                      </p>
                      <Badge tone={statusTone(task.status)}>{task.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {task.contactPhone
                        ? formatPhone(task.contactPhone)
                        : task.contactEmail || '—'}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatRelativeTime(task.sentAt || task.createdAt)}
                    </p>
                    {task.lastError && (
                      <p className="mt-2 text-xs text-rose-600 truncate">{task.lastError}</p>
                    )}
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
