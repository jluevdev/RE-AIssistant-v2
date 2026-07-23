import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function BillingSuccessPage() {
  const { userProfile } = useAuth();
  const subscription = userProfile?.subscription;

  return (
    <div className="max-w-lg mx-auto p-8 text-center space-y-4">
      <h1 className="text-2xl font-semibold">Subscription updated</h1>
      <p className="text-slate-600">
        Thanks! Stripe checkout completed
        {subscription?.planName ? ` for ${subscription.planName}` : ''}.
      </p>
      <p className="text-sm text-slate-500">
        If your plan has not updated yet, wait a few seconds for the webhook to sync, then refresh the dashboard.
      </p>
      <Link to="/dashboard" className="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
        Back to dashboard
      </Link>
    </div>
  );
}
