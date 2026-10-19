import usePlanStatus from './usePlanStatus';
import toast from 'react-hot-toast';

export { toDate } from './planStatus';

export default function useTrialStatus() {
  const plan = usePlanStatus();
  return {
    isTrial: plan.isTrial,
    expired: plan.expired,
    daysLeft: plan.daysLeft,
    paid: plan.paid,
    pending: plan.pending,
    endDate: plan.endDate,
    label: plan.label,
    planName: plan.planName,
    status: plan.status,
    plan: plan.plan,
  };
}

export function blockTrialAction(trial, message) {
  if (!trial || trial.pending || trial.paid || !trial.expired) return false;
  toast.error(message || 'Your free trial has ended. Add billing info to continue.');
  return true;
}
