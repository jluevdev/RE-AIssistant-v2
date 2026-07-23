import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  Plus,
  X,
  Home,
  DoorOpen,
  MessageSquare,
  MoreHorizontal,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import Logo from './Logo';
import { NAV_ITEMS, QUICK_ACTIONS } from './navConfig';

const SIDEBAR_STORAGE_KEY = 'reai.sidebar.collapsed';

function planLabel(subscription) {
  if (!subscription) return 'Trial';
  return subscription.planName || subscription.plan || 'Trial';
}

function NavItem({ item, collapsed, onNavigate }) {
  const { to, label, icon: Icon, soon } = item;

  if (soon) {
    return (
      <div
        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 cursor-not-allowed ${
          collapsed ? 'justify-center' : ''
        }`}
        title={`${label} — coming soon`}
      >
        <Icon className="w-5 h-5 shrink-0" />
        {!collapsed && (
          <span className="flex-1 flex items-center justify-between">
            {label}
            <span className="text-[10px] font-medium uppercase rounded-full bg-slate-100 text-slate-400 px-1.5 py-0.5">
              Soon
            </span>
          </span>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={to}
      end={to === '/dashboard'}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          collapsed ? 'justify-center' : '',
          isActive
            ? 'bg-brand-50 text-brand-700'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        ].join(' ')
      }
      title={collapsed ? label : undefined}
    >
      <Icon className="w-5 h-5 shrink-0" />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}

function AccountMenu({ email, plan, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const initial = (email || '?').charAt(0).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white text-sm font-semibold">
          {initial}
        </span>
        <span className="hidden sm:block max-w-[160px] truncate text-sm text-slate-700">{email}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white shadow-lg py-2 z-50"
        >
          <div className="px-4 py-2 border-b border-slate-100">
            <p className="text-xs text-slate-500">Signed in as</p>
            <p className="text-sm font-medium text-slate-900 truncate">{email}</p>
            <span className="mt-1 inline-flex items-center rounded-full bg-brand-50 text-brand-700 text-xs font-medium px-2 py-0.5 capitalize">
              {plan}
            </span>
          </div>
          <Link
            to="/billing"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Billing &amp; plan
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** Bottom action sheet for the mobile "+" quick-create button. */
function QuickActionSheet({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Quick actions">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />
      <div className="absolute bottom-0 inset-x-0 rounded-t-2xl bg-white p-4 pb-8 shadow-xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <p className="text-sm font-semibold text-slate-900 mb-2">Create</p>
        <div className="space-y-1">
          {QUICK_ACTIONS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={onClose}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-slate-700 hover:bg-slate-50"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Icon className="w-5 h-5" />
              </span>
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Slide-in drawer with full nav for mobile ("More" / hamburger). */
function MobileDrawer({ open, onClose, email, plan, onLogout }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />
      <div className="absolute left-0 top-0 h-full w-72 max-w-[80%] bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-4 h-16 border-b border-slate-200">
          <Logo />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.to} item={item} onNavigate={onClose} />
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <p className="text-xs text-slate-500">Signed in as</p>
          <p className="text-sm font-medium text-slate-900 truncate">{email}</p>
          <span className="mt-1 inline-flex items-center rounded-full bg-brand-50 text-brand-700 text-xs font-medium px-2 py-0.5 capitalize">
            {plan}
          </span>
          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppLayout({ children }) {
  const { currentUser, userProfile, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const email = currentUser?.email || '';
  const plan = planLabel(userProfile?.subscription);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // Close overlays on route change.
  useEffect(() => {
    setDrawerOpen(false);
    setSheetOpen(false);
  }, [location.pathname]);

  const mobileTabActive = (path) =>
    path === '/dashboard'
      ? location.pathname === '/dashboard'
      : location.pathname.startsWith(path);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex md:flex-col fixed inset-y-0 left-0 z-30 border-r border-slate-200 bg-white transition-all duration-200 ${
          collapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        <div className={`flex items-center h-16 px-4 ${collapsed ? 'justify-center' : ''}`}>
          <Link to="/dashboard" aria-label="Go to dashboard">
            <Logo collapsed={collapsed} />
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.to} item={item} collapsed={collapsed} />
          ))}
        </nav>
        <div className="p-3 border-t border-slate-200">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className={`transition-all duration-200 ${collapsed ? 'md:pl-[72px]' : 'md:pl-64'}`}>
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 backdrop-blur px-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="md:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Link to="/dashboard" className="md:hidden">
              <Logo />
            </Link>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Notifications"
              title="Notifications (coming soon)"
            >
              <Bell className="w-5 h-5" />
            </button>
            <AccountMenu email={email} plan={plan} onLogout={logout} />
          </div>
        </header>

        {/* Page content */}
        <main className="px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-8 max-w-6xl mx-auto">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur"
        aria-label="Primary"
      >
        <div className="grid grid-cols-5">
          <MobileTab to="/dashboard" label="Home" icon={Home} active={mobileTabActive('/dashboard')} />
          <MobileTab
            to="/open-houses"
            label="Open Hs."
            icon={DoorOpen}
            active={mobileTabActive('/open-houses')}
          />
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex flex-col items-center justify-center py-2"
            aria-label="Create new"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white -mt-4 shadow-lg">
              <Plus className="w-5 h-5" />
            </span>
            <span className="text-[10px] text-slate-500 mt-0.5">New</span>
          </button>
          <MobileTab
            to="/buyer/schedule"
            label="Tours"
            icon={MessageSquare}
            active={mobileTabActive('/buyer/schedule')}
          />
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex flex-col items-center justify-center py-2 text-slate-500"
            aria-label="More"
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">More</span>
          </button>
        </div>
      </nav>

      <QuickActionSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        email={email}
        plan={plan}
        onLogout={logout}
      />
    </div>
  );
}

function MobileTab({ to, label, icon: Icon, active }) {
  return (
    <Link
      to={to}
      className={`flex flex-col items-center justify-center py-2 ${
        active ? 'text-brand-600' : 'text-slate-500'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-[10px] mt-0.5">{label}</span>
    </Link>
  );
}
