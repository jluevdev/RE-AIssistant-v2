const test = require('node:test');
const assert = require('node:assert/strict');
const { derivePlan } = require('./planStatus');

test('team billing replaces a leftover personal trial', () => {
  const plan = derivePlan({
    user: { subscription: { plan: 'trial', planName: 'trial', status: 'active', endDate: new Date('2026-10-26') } },
    team: { id: 'team1', billing: { status: 'active', planName: 'Premium Team', stripeSubscriptionId: 'sub_123' } },
  });
  assert.equal(plan.plan, 'premiumTeam');
  assert.equal(plan.planName, 'Premium Team');
  assert.equal(plan.status, 'active');
  assert.equal(plan.source, 'team');
});

test('a personal trial stays a trial when the team is not paid', () => {
  const plan = derivePlan({
    user: { subscription: { plan: 'trial', endDate: new Date('2026-10-26T00:00:00Z') } },
    team: null,
    now: new Date('2026-10-19T00:00:00Z').getTime(),
  });
  assert.equal(plan.plan, 'trial');
  assert.equal(plan.status, 'trialing');
});
