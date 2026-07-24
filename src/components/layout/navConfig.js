import {
  LayoutDashboard,
  DoorOpen,
  FileText,
  GitCompare,
  CalendarClock,
  MessageSquare,
  Users,
  CreditCard,
  Zap,
  Building2,
} from 'lucide-react';

/**
 * Central nav definition used by both the desktop sidebar and mobile menus.
 * Grouped into a shared Workspace group plus role-based sections
 * (Listing Agent, Buyer Agent, Team) and an Account group.
 * A section with `label: null` renders without a header.
 * `soon: true` on an item renders a disabled item with a "Soon" badge.
 */
export const NAV_SECTIONS = [
  {
    label: null,
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/messages', label: 'Messages', icon: MessageSquare },
      { to: '/contacts', label: 'Contacts', icon: Users },
      { to: '/automations', label: 'Automations', icon: Zap },
    ],
  },
  {
    label: 'Listing Agent',
    items: [
      { to: '/open-houses', label: 'Open Houses', icon: DoorOpen },
      { to: '/listings/new', label: 'Listings', icon: FileText },
      { to: '/offers', label: 'Offers', icon: GitCompare },
    ],
  },
  {
    label: 'Buyer Agent',
    items: [{ to: '/buyer/schedule', label: 'Buyer Scheduling', icon: CalendarClock }],
  },
  {
    label: 'Team',
    items: [{ to: '/team', label: 'Team', icon: Building2 }],
  },
  {
    label: 'Account',
    items: [{ to: '/billing', label: 'Billing', icon: CreditCard }],
  },
];

/** Backward-compatible flat list derived from the grouped sections. */
export const NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);

/** Quick-create actions surfaced by the mobile "+" button. */
export const QUICK_ACTIONS = [
  { to: '/listings/new', label: 'New Listing', icon: FileText },
  { to: '/open-houses', label: 'New Open House', icon: DoorOpen },
  { to: '/buyer/schedule', label: 'New Buyer Tour', icon: CalendarClock },
];
