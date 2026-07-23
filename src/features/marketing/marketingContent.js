import { brand } from '../../theme/tokens';

export const hero = {
  headline: 'Close more deals with less busywork',
  subhead:
    'RE AIssistant keeps your inbox, open houses, offers, and follow-ups in one place — so you spend time with clients, not spreadsheets.',
  primaryCta: 'Start $10 trial',
  secondaryCta: 'See pricing',
  trialNote: 'One-day trial for $10 · Cancel anytime',
};

export const socialProof = [
  { value: '10k+', label: 'Messages handled' },
  { value: '2×', label: 'Faster follow-up' },
  { value: '98%', label: 'Agent satisfaction' },
];

export const features = [
  {
    icon: 'MessageSquare',
    title: 'Unified SMS inbox',
    description:
      'Reply to buyers and sellers from one thread. Quick replies and unread badges keep nothing slipping through.',
  },
  {
    icon: 'Home',
    title: 'Open-house check-in & analytics',
    description:
      'QR check-in, visitor capture, and same-day follow-ups — with analytics that show what’s working.',
  },
  {
    icon: 'FileText',
    title: 'Offer management',
    description:
      'Collect, compare, and track offers with timelines and notes so listing decisions stay organized.',
  },
  {
    icon: 'Calendar',
    title: 'Buyer scheduling',
    description:
      'Build showing routes, send requests in bulk, and share plans with clients via a secure portal.',
  },
  {
    icon: 'Zap',
    title: 'Automations & follow-ups',
    description:
      'Quiet hours, scheduled reminders, and post–open-house sequences run while you’re in the field.',
  },
  {
    icon: 'Users',
    title: 'Teams & brokerage dashboard',
    description:
      'Invite agents, assign roles, and roll up pipeline metrics across your office.',
  },
];

export const howItWorks = [
  {
    step: 1,
    title: 'Sign up in minutes',
    description: 'Create your account, connect SMS, and import your first listing or open house.',
  },
  {
    step: 2,
    title: 'Run your day from one hub',
    description: 'Messages, contacts, offers, and automations live together — no tab hopping.',
  },
  {
    step: 3,
    title: 'Follow up automatically',
    description: 'Let reminders and sequences nurture leads while you focus on showings and closings.',
  },
];

export const pricingIntro = {
  title: 'Simple, transparent pricing',
  subtitle:
    'Choose the plan that fits your business. All plans include unlimited texting, scheduling, and client collaboration.',
  trialCallout: 'Every plan includes a $10 one-day trial so you can test with real workflows.',
};

export const planFeatures = {
  singleAgent: [
    'Listing OR buyer-agent focus',
    'Single agent account',
    'Unlimited texting & scheduling',
    'Magic-link client access',
    'Basic analytics & reporting',
    '$10 one-day trial',
    'Email support',
  ],
  allInclusive: [
    'Both listing AND buyer features',
    'Advanced analytics & reporting',
    'Priority support',
    'Unlimited property listings',
    'Advanced client management',
    'Commission tracking',
    '$10 one-day trial',
  ],
  premiumTeam: [
    '5+ agent seats included',
    'Team collaboration dashboard',
    'Role-based permissions',
    'Team performance analytics',
    'Dedicated account manager',
    'Multi-office management',
    'Bulk SMS campaigns',
  ],
};

export const planCtas = {
  singleAgent: { label: 'Start $10 trial', to: '/signup' },
  allInclusive: { label: 'Start $10 trial', to: '/signup' },
  premiumTeam: { label: 'Contact sales', href: 'mailto:support@reaiassistant.com?subject=Premium%20Team%20plan' },
};

export const faq = [
  {
    question: 'What is included in the $10 trial?',
    answer:
      'You get full access to your chosen plan for one day. Explore messaging, open houses, and automations with real data before committing to a monthly subscription.',
  },
  {
    question: 'Can I switch plans later?',
    answer:
      'Yes. Upgrade or change plans anytime from Billing in your dashboard. Changes take effect on your next billing cycle unless you contact support for immediate adjustments.',
  },
  {
    question: 'Do you support teams and brokerages?',
    answer:
      'Premium Team includes multiple seats, role-based permissions, and a shared team dashboard. Smaller teams can start on All-Inclusive and add seats as you grow.',
  },
  {
    question: 'Is SMS included?',
    answer:
      'All plans include unlimited texting within fair-use limits designed for professional real estate communication. Carrier fees may apply depending on your region.',
  },
  {
    question: 'How does open-house check-in work?',
    answer:
      'Generate a QR code for each open house. Visitors check in on their phone, you capture contact info, and automations can send follow-ups the same day.',
  },
  {
    question: 'Is my client data secure?',
    answer:
      'Data is stored in Firebase with role-based access rules. Authenticated routes require login; public check-in and client portals use scoped tokens.',
  },
];

export const ctaSection = {
  title: 'Ready to win back your time?',
  subtitle: 'Join agents who run their pipeline from one intelligent workspace.',
  primaryCta: 'Start $10 trial',
  secondaryCta: 'View pricing',
};

export const footer = {
  tagline: brand.tagline,
  columns: {
    product: [
      { label: 'Features', href: '/#features' },
      { label: 'Pricing', href: '/#pricing' },
      { label: 'Sign up', to: '/signup' },
    ],
    company: [
      { label: 'Sign in', to: '/login' },
      { label: 'Contact', href: 'mailto:support@reaiassistant.com' },
    ],
    legal: [
      { label: 'Privacy', to: '/privacy' },
      { label: 'Terms', to: '/terms' },
    ],
  },
};

export const privacySections = [
  {
    title: 'Overview',
    body: 'This Privacy Policy describes how RE AIssistant ("we", "us") collects, uses, and protects information when you use our website and application. This is a template for review by legal counsel before production use.',
  },
  {
    title: 'Information we collect',
    body: 'We may collect account information (name, email, phone), property and transaction data you enter, communication logs (SMS threads), and usage analytics to improve the product.',
  },
  {
    title: 'How we use information',
    body: 'We use your information to provide the service, process subscriptions, send transactional messages, and improve features. We do not sell personal information to third parties.',
  },
  {
    title: 'Data storage & security',
    body: 'Data is stored on Firebase/Google Cloud infrastructure with encryption in transit. Access is restricted by authentication and Firestore security rules.',
  },
  {
    title: 'Your choices',
    body: 'You may update profile information in settings, export data on request, or delete your account by contacting support. Marketing emails include an unsubscribe link where applicable.',
  },
  {
    title: 'Contact',
    body: 'Questions about this policy: support@reaiassistant.com',
  },
];

export const termsSections = [
  {
    title: 'Acceptance of terms',
    body: 'By accessing RE AIssistant, you agree to these Terms of Service. This document is a template and should be reviewed by legal counsel before production use.',
  },
  {
    title: 'Service description',
    body: 'RE AIssistant provides software for real estate professionals including messaging, open-house tools, offer management, scheduling, and team collaboration.',
  },
  {
    title: 'Accounts & billing',
    body: 'You are responsible for account security. Subscriptions renew monthly unless cancelled. Trial and refund terms are described at checkout and in your plan details.',
  },
  {
    title: 'Acceptable use',
    body: 'You agree not to misuse the service, send unsolicited spam, violate TCPA or local telecom rules, or upload unlawful content. We may suspend accounts that violate these terms.',
  },
  {
    title: 'Limitation of liability',
    body: 'The service is provided "as is" to the maximum extent permitted by law. We are not liable for indirect or consequential damages arising from use of the platform.',
  },
  {
    title: 'Contact',
    body: 'Questions about these terms: support@reaiassistant.com',
  },
];
