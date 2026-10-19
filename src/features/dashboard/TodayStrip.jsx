import { useState } from 'react';
import { Link } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { Button, Card, toast } from '../../components/ui';
import { buildTodayItems } from './todayItems';

export default function TodayStrip({ records, loading }) {
  const { items } = buildTodayItems(records || {});
  const [busyId, setBusyId] = useState('');

  async function queueTour(scheduleId) {
    setBusyId(scheduleId);
    try {
      await httpsCallable(functions, 'queueTourFollowup')({ scheduleId });
      toast.success('Tour follow-up is waiting for your approval');
    } catch (error) {
      toast.error(error.message || 'Could not queue the follow-up');
    } finally {
      setBusyId('');
    }
  }

  async function queueDeadline(item) {
    setBusyId(item.id);
    try {
      await httpsCallable(functions, 'queueDeadlineReminder')({
        offerId: item.offerId,
        key: item.deadlineKey,
      });
      toast.success('Reminder is waiting for your approval');
    } catch (error) {
      toast.error(error.message || 'Could not queue the reminder');
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className="mb-8" aria-labelledby="dashboard-today">
      <h2 id="dashboard-today" className="text-lg font-semibold text-slate-900">Today</h2>
      <p className="mb-3 text-sm text-slate-500">Tours, open houses, unanswered texts, and deadlines due within 48 hours.</p>
      <Card>
        {loading ? (
          <p className="text-sm text-slate-500">Loading today…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing due today.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-slate-900">{item.title}</p>
                  <p className="text-sm text-slate-500">{item.detail}</p>
                </div>
                <div className="flex gap-2">
                  <Link to={item.to} className="text-sm font-medium text-brand-600 hover:underline">Open</Link>
                  {item.kind === 'tour' && (
                    <Button type="button" variant="outline" size="sm" loading={busyId === item.id} disabled={Boolean(busyId)} onClick={() => queueTour(item.scheduleId)}>
                      Queue follow-up
                    </Button>
                  )}
                  {item.kind === 'deadline' && (
                    <Button type="button" variant="outline" size="sm" loading={busyId === item.id} disabled={Boolean(busyId)} onClick={() => queueDeadline(item)}>
                      Remind me
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
