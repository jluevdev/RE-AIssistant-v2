/**
 * Curated in-app help index. Used for keyword matching and as LLM context.
 * Only routes listed here may be suggested to users.
 */

const ALLOWED_ROUTES = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/messages', label: 'Messages' },
  { to: '/contacts', label: 'Contacts' },
  { to: '/automations', label: 'Automations' },
  { to: '/open-houses', label: 'Open Houses' },
  { to: '/listings/new', label: 'Create Listing' },
  { to: '/offers', label: 'Offers' },
  { to: '/buyer/schedule', label: 'Buyer Scheduling' },
  { to: '/team', label: 'Team' },
  { to: '/billing', label: 'Billing' },
];

const HELP_ENTRIES = [
  {
    id: 'open-house-create',
    keywords: ['open house', 'open houses', 'check-in', 'check in', 'qr', 'visitor'],
    answer:
      'Create an open house under Listing Agent → Open Houses. Share the check-in link or QR so visitors can register. After check-in, visitors sync to Contacts and can trigger automations.',
    links: [{ to: '/open-houses', label: 'Open Houses' }],
  },
  {
    id: 'listing-create',
    keywords: ['listing', 'listings', 'listing hub', 'public hub', 'submit offer'],
    answer:
      'Create a listing hub from Listing Agent → Listings (or the mobile + button → New Listing). Buyers can submit offers through your public listing page.',
    links: [{ to: '/listings/new', label: 'Create Listing' }],
  },
  {
    id: 'offers',
    keywords: ['offer', 'offers', 'compare', 'pipeline', 'status'],
    answer:
      'View and compare offers under Listing Agent → Offers. Open an offer for timeline, notes, and status updates.',
    links: [{ to: '/offers', label: 'Offers' }],
  },
  {
    id: 'buyer-schedule',
    keywords: ['buyer', 'showing', 'showings', 'tour', 'schedule', 'route'],
    answer:
      'Plan buyer tours under Buyer Agent → Buyer Scheduling. Build a route, send showing requests, and share a plan with your client.',
    links: [{ to: '/buyer/schedule', label: 'Buyer Scheduling' }],
  },
  {
    id: 'messages',
    keywords: ['message', 'messages', 'sms', 'text', 'inbox', 'reply', 'unread'],
    answer:
      'Your unified SMS inbox is under Workspace → Messages. Threads group by contact phone; unread badges appear in the sidebar.',
    links: [{ to: '/messages', label: 'Messages' }],
  },
  {
    id: 'contacts',
    keywords: ['contact', 'contacts', 'crm', 'lead', 'visitor'],
    answer:
      'Contacts live under Workspace → Contacts. They auto-populate from open-house check-ins, messages, and other activity.',
    links: [{ to: '/contacts', label: 'Contacts' }],
  },
  {
    id: 'automations',
    keywords: ['automation', 'automations', 'follow up', 'follow-up', 'reminder', 'quiet hours'],
    answer:
      'Set rules and view scheduled tasks under Workspace → Automations. Post–open-house follow-ups and reminders run on a schedule.',
    links: [{ to: '/automations', label: 'Automations' }],
  },
  {
    id: 'team',
    keywords: ['team', 'invite', 'brokerage', 'member', 'role', 'seat'],
    answer:
      'Manage your team under Team → Team. Invite agents by email, assign roles, and use the dashboard Team toggle for shared metrics.',
    links: [{ to: '/team', label: 'Team' }, { to: '/dashboard', label: 'Dashboard' }],
  },
  {
    id: 'billing',
    keywords: ['billing', 'plan', 'subscription', 'trial', 'upgrade', 'stripe', 'price'],
    answer:
      'Manage your plan under Account → Billing. Plans include a $10 one-day trial; upgrade or change plans from that page.',
    links: [{ to: '/billing', label: 'Billing' }],
  },
  {
    id: 'dashboard',
    keywords: ['dashboard', 'stats', 'metrics', 'this month', 'home'],
    answer:
      'The dashboard shows this month’s activity and quick links grouped by Listing Agent, Buyer Agent, and Team. Use the Team toggle if you’re on a team account.',
    links: [{ to: '/dashboard', label: 'Dashboard' }],
  },
  {
    id: 'nav-structure',
    keywords: ['navigate', 'navigation', 'sidebar', 'where', 'find', 'menu', 'section'],
    answer:
      'The sidebar is grouped into Workspace (Dashboard, Messages, Contacts, Automations), Listing Agent tools, Buyer Agent tools, Team, and Account (Billing).',
    links: [{ to: '/dashboard', label: 'Dashboard' }],
  },
  {
    id: 'getting-started',
    keywords: ['start', 'getting started', 'setup', 'onboard', 'new user', 'help'],
    answer:
      'Open Getting started from your account menu (top-right avatar) for a setup checklist. Complete profile, inbox, contacts, and automations from the dashboard checklist.',
    links: [{ to: '/dashboard', label: 'Dashboard' }],
  },
];

const OFF_TOPIC_REPLY = {
  answer:
    'I can only help with RE AIssistant — navigating the app and using its tools (open houses, offers, buyer scheduling, messages, team, billing, etc.). Try asking where a feature is or how to do something in the app.',
  links: [{ to: '/dashboard', label: 'Dashboard' }],
  source: 'guardrail',
};

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreEntry(query, entry) {
  let score = 0;
  for (const keyword of entry.keywords) {
    const kw = normalize(keyword);
    if (!kw) continue;
    if (query.includes(kw)) score += kw.split(' ').length + 2;
    else {
      for (const part of kw.split(' ')) {
        if (part.length > 2 && query.includes(part)) score += 1;
      }
    }
  }
  return score;
}

function sanitizeLinks(links) {
  if (!Array.isArray(links)) return [];
  const allowed = new Map(ALLOWED_ROUTES.map((r) => [r.to, r.label]));
  const out = [];
  for (const link of links) {
    const to = link?.to;
    if (!to || !allowed.has(to)) continue;
    out.push({ to, label: String(link.label || allowed.get(to)).slice(0, 40) });
  }
  return out.slice(0, 3);
}

function searchLocalHelp(question) {
  const query = normalize(question);
  if (!query) return null;

  let best = null;
  let bestScore = 0;
  for (const entry of HELP_ENTRIES) {
    const score = scoreEntry(query, entry);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  if (!best || bestScore < 2) return null;

  return {
    answer: best.answer,
    links: sanitizeLinks(best.links),
    source: 'local',
    matchedId: best.id,
  };
}

function buildKnowledgeContext() {
  return HELP_ENTRIES.map(
    (e) =>
      `- ${e.id}: ${e.answer} Links: ${(e.links || []).map((l) => l.label + ' → ' + l.to).join(', ') || 'none'}`,
  ).join('\n');
}

module.exports = {
  ALLOWED_ROUTES,
  HELP_ENTRIES,
  OFF_TOPIC_REPLY,
  searchLocalHelp,
  sanitizeLinks,
  buildKnowledgeContext,
};
