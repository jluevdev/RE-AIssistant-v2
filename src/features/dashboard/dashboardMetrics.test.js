import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDashboardMetrics, timestampToDate } from './dashboardMetrics.js';

test('tours scheduled counts tours that have showings, not only tours created this month', () => {
  const metrics = computeDashboardMetrics({
    schedules: [
      {
        id: 'old',
        createdAt: { seconds: Math.floor(new Date('2026-01-02T00:00:00Z').getTime() / 1000) },
        targets: [
          { address: '1 Elm', status: 'pending' },
          { address: '2 Elm', status: 'confirmed' },
        ],
      },
    ],
  }, new Date('2026-10-19T00:00:00Z'));
  assert.equal(metrics.toursScheduled, 1);
  assert.equal(metrics.pendingTargets, 1);
  assert.equal(metrics.confirmedTargets, 1);
  assert.ok(timestampToDate({ seconds: 1 }) instanceof Date);
});
