import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  DoorOpen,
  FileText,
  GitCompare,
  CalendarClock,
  CreditCard,
  ArrowRight,
  Sparkles,
  Users,
  MessageSquare,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Badge, Card, PageHeader } from '../../components/ui';
import {
  computeDashboardMetrics,
  formatCurrency,
  formatPercent,
} from './dashboardMetrics';
import useDashboardData from './useDashboardData';

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

function monthLabel() {
  return new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

function StatSkeleton() {
  return (
    <Card className="animate-pulse">
      <div className="h-10 w-10 rounded-lg bg-slate-200" />
      <div className="mt-3 h-8 w-16 rounded bg-slate-200" />
      <div className="mt-2 h-4 w-28 rounded bg-slate-100" />
      <div className="mt-1 h-3 w-20 rounded bg-slate-100" />
    </Card>
  );
}

function StatTile({ to, icon: Icon, value, label, subline, tone = 'brand' }) {
  const iconClass =
    tone === 'accent'
      ? 'bg-accent-50 text-accent-600'
      : tone === 'warning'
        ? 'bg-amber-50 text-amber-600'
        : 'bg-brand-50 text-brand-600';

  return (
    <Link to={to} className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-xl">
      <Card hover className="h-full">
        <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconClass}`}>
          <Icon className="w-5 h-5" aria-hidden="true" />
        </span>
        <p className="mt-3 text-3xl font-bold text-slate-900 tabular-nums">{value}</p>
        <p className="mt-1 text-sm font-medium text-slate-700">{label}</p>
        {subline && <p className="mt-0.5 text-xs text-slate-500">{subline}</p>}
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
          View details
          <ArrowRight className="w-3 h-3" />
        </span>
      </Card>
    </Link>
  );
}

export default function DashboardShell() {
  const { currentUser, userProfile } = useAuth();
  const { data, loading } = useDashboardData();
  const subscription = userProfile?.subscription;
  const planName = subscription?.planName || subscription?.plan || 'trial';
  const status = subscription?.status;
  const firstName =
    userProfile?.fullName?.split(' ')[0] ||
    currentUser?.displayName?.split(' ')[0] ||
    currentUser?.email?.split('@')[0] ||
    'there';

  const metrics = useMemo(() => computeDashboardMetrics(data), [data]);

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

      <section className="mb-8" aria-labelledby="dashboard-this-month">
        <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
          <div>
            <h2 id="dashboard-this-month" className="text-lg font-semibold text-slate-900">
              This month
            </h2>
            <p className="text-sm text-slate-500">{monthLabel()} · updated in real time</p>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <StatSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
            <StatTile
              to="/open-houses"
              icon={Users}
              value={metrics.visitorsThisMonth}
              label="Open house visitors"
              subline={`All-time: ${metrics.visitorsAllTime}`}
            />
            <StatTile
              to="/offers"
              icon={GitCompare}
              value={metrics.activeOffers}
              label="Active offers"
              subline={
                metrics.offerPipelineUsd > 0
                  ? `${formatCurrency(metrics.offerPipelineUsd)} pipeline`
                  : 'No priced offers yet'
              }
              tone="accent"
            />
            <StatTile
              to="/buyer/schedule"
              icon={CalendarClock}
              value={metrics.toursThisMonth}
              label="Tours scheduled"
              subline={`${metrics.confirmedTargets} confirmed showings`}
              tone="warning"
            />
            <StatTile
              to="/messages"
              icon={MessageSquare}
              value={formatPercent(metrics.responseRate)}
              label="SMS response rate"
              subline="Contacts who replied this month"
            />
            <StatTile
              to="/open-houses"
              icon={DoorOpen}
              value={metrics.openHousesThisMonth}
              label="Open houses hosted"
              subline="Events this month"
            />
            <StatTile
              to="/contacts"
              icon={TrendingUp}
              value={metrics.contactsThisMonth}
              label="New contacts"
              subline="Added to your CRM this month"
              tone="accent"
            />
          </div>
        )}
      </section>

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
