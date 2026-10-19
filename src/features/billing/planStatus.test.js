import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlanStatus } from './planStatus.js';

test('one record cannot show both a trial countdown and an active team plan', () => {
  const plan = resolvePlanStatus({
    plan: 'premiumTeam',
    planName: 'Premium Team',
    status: 'active',
    source: 'team',
  });
  assert.equal(plan.paid, true);
  assert.equal(plan.isTrial, false);
  assert.equal(plan.label, 'Premium Team · Active');
});

test('trial copy comes from the same record', () => {
  const plan = resolvePlanStatus({
    plan: 'trial',
    planName: 'Free trial',
    status: 'trialing',
    source: 'trial',
    endDate: new Date('2026-10-26T00:00:00Z'),
  }, {}, new Date('2026-10-19T00:00:00Z').getTime());
  assert.equal(plan.isTrial, true);
  assert.equal(plan.daysLeft, 7);
  assert.match(plan.label, /7 days left/);
});
