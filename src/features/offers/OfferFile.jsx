import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { Button, Card, toast } from '../../components/ui';
import { CHECKLIST_FIELDS, DEADLINE_FIELDS } from '../dashboard/todayItems';

export default function OfferFile({ offer, onSaved }) {
  const file = offer.file || { deadlines: {}, checklist: {} };
  const [deadlines, setDeadlines] = useState({ ...(file.deadlines || {}) });
  const [checklist, setChecklist] = useState({ ...(file.checklist || {}) });
  const [saving, setSaving] = useState(false);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await httpsCallable(functions, 'updateOfferFile')({
        offerId: offer.id,
        deadlines,
        checklist,
      });
      toast.success('File saved');
      onSaved?.();
    } catch (error) {
      toast.error(error.message || 'Could not save the file');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="font-semibold text-slate-900">Transaction file</h2>
      <p className="mt-1 text-sm text-slate-500">Dates and checklist items you type. This is a tracker, not a contract.</p>
      <form onSubmit={save} className="mt-4 space-y-4">
        <div className="space-y-2">
          {DEADLINE_FIELDS.map((field) => (
            <label key={field.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-700">{field.label}</span>
              <input
                type="date"
                value={deadlines[field.key] || ''}
                onChange={(event) => setDeadlines((current) => ({ ...current, [field.key]: event.target.value }))}
                className="rounded-lg border border-slate-300 px-2 py-1"
              />
            </label>
          ))}
        </div>
        <div className="space-y-2">
          {CHECKLIST_FIELDS.map((field) => (
            <label key={field.key} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(checklist[field.key])}
                onChange={(event) => setChecklist((current) => ({ ...current, [field.key]: event.target.checked }))}
              />
              {field.label}
            </label>
          ))}
        </div>
        <Button type="submit" loading={saving} disabled={saving}>Save file</Button>
      </form>
    </Card>
  );
}
