import { Link } from 'react-router-dom';
import {
  DoorOpen,
  FileText,
  GitCompare,
  CalendarClock,
  CreditCard,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Badge, Card, PageHeader } from '../../components/ui';

const FEATURES = [
  {
    to: '/open-houses',
    title: 'Open Houses',
    description: 'Create events, run OTP check-ins, and capture visitor feedback.',
    icon: DoorOpen,
    tone: 'brand',
  },
  {
    to: '/listings/new',
    title: 'Create Listing',
    description: 'Spin up a public listing hub for offer submissions.',
    icon: FileText,
    tone: 'brand',
  },
  {
    to: '/offers',
    title: 'Offers',
    description: 'Compare offers side by side and track status changes.',
    icon: GitCompare,
    tone: 'brand',
  },
  {
    to: '/buyer/schedule',
    title: 'Buyer Scheduling',
    description: 'Request showings, collect confirmations, share a tour route.',
    icon: CalendarClock,
    tone: 'brand',
  },
  {
    to: '/billing',
    title: 'Billing',
    description: 'Manage your subscription and plan.',
    icon: CreditCard,
    tone: 'neutral',
  },
];

export default function DashboardShell() {
  const { currentUser, userProfile } = useAuth();
  const subscription = userProfile?.subscription;
  const planName = subscription?.planName || subscription?.plan || 'trial';
  const status = subscription?.status;
  const firstName =
    userProfile?.fullName?.split(' ')[0] ||
    currentUser?.displayName?.split(' ')[0] ||
    currentUser?.email?.split('@')[0] ||
    'there';

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle="Your workspace for offers, open houses, and buyer tours."
        actions={
          <Badge tone={status === 'active' || status === 'trialing' ? 'success' : 'neutral'}>
            <Sparkles className="w-3 h-3" />
            {planName}
            {status ? ` · ${status}` : ''}
          </Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ to, title, description, icon: Icon, tone }) => (
          <Link key={to} to={to} className="group">
            <Card hover className="h-full flex flex-col">
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  tone === 'neutral' ? 'bg-slate-100 text-slate-600' : 'bg-brand-50 text-brand-600'
                }`}
              >
                <Icon className="w-5 h-5" />
              </span>
              <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
              <p className="mt-1 text-sm text-slate-500 flex-1">{description}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 group-hover:gap-2 transition-all">
                Open
                <ArrowRight className="w-4 h-4" />
              </span>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Signed in as</p>
            <p className="font-medium text-slate-900">{currentUser?.email}</p>
          </div>
          <Link to="/billing" className="text-sm font-medium text-brand-600 hover:underline">
            Manage plan
          </Link>
        </div>
      </Card>
    </div>
  );
}
