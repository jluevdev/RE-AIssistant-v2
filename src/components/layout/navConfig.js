import {
  LayoutDashboard,
  DoorOpen,
  FileText,
  GitCompare,
  CalendarClock,
  MessageSquare,
  Users,
  CreditCard,
} from 'lucide-react';

/**
 * Central nav definition used by both the desktop sidebar and mobile menus.
 * `soon: true` renders a disabled item with a "Soon" badge.
 */
export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/open-houses', label: 'Open Houses', icon: DoorOpen },
  { to: '/listings/new', label: 'Listings', icon: FileText },
  { to: '/offers', label: 'Offers', icon: GitCompare },
  { to: '/buyer/schedule', label: 'Buyer Scheduling', icon: CalendarClock },
  { to: '/messages', label: 'Messages', icon: MessageSquare, soon: true },
  { to: '/contacts', label: 'Contacts', icon: Users, soon: true },
  { to: '/billing', label: 'Billing', icon: CreditCard },
];

/** Quick-create actions surfaced by the mobile "+" button. */
export const QUICK_ACTIONS = [
  { to: '/listings/new', label: 'New Listing', icon: FileText },
  { to: '/open-houses', label: 'New Open House', icon: DoorOpen },
  { to: '/buyer/schedule', label: 'New Buyer Tour', icon: CalendarClock },
];
