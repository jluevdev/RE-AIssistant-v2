export const WALKAROUND = [
  {
    to: '/dashboard',
    title: 'Dashboard',
    line: 'This is home. Your day, messages, and open houses show up here.',
  },
  {
    to: '/line',
    title: 'Your line',
    line: 'This is your text line. I draft replies, and you approve them before anything sends.',
  },
  {
    to: '/messages',
    title: 'Messages',
    line: 'Client texts land here. I can queue a reply and wait for you.',
  },
  {
    to: '/buyer/schedule',
    title: 'Tours',
    line: 'I plan the stop list. Google Maps builds the drive.',
  },
  {
    to: '/open-houses',
    title: 'Open houses',
    line: 'I can queue reminders for the open houses on your calendar.',
  },
  {
    to: '/offers',
    title: 'Offers',
    line: 'I can prep a signature packet and flag mistakes. I never sign.',
  },
  {
    to: '/assistant',
    title: 'My settings',
    line: 'You can change my instructions and choose which dashboard tools I am allowed to use.',
  },
];

export const WIZARD_GUIDE = [
  'Welcome. I will walk this wizard with you. Press Next and I will move it.',
  'This is your profile. Your name and phone are how clients reach you. I will not text anyone until you approve it.',
  'These are the tools I can use. Messages, tours, open houses, and offers connect from here.',
  'You are set. I will stay on the screen with you. Hide me whenever you want.',
];

export const DEMO_TOOLS = [
  { id: 'messages', label: 'Messages' },
  { id: 'tours', label: 'Tours' },
  { id: 'open-houses', label: 'Open houses' },
  { id: 'offers', label: 'Offers' },
  { id: 'line', label: 'Your line' },
];

const DEMO_ACCOUNTS = new Set(['josephluevanos8@gmail.com']);

export function canDemoBots(user, profile) {
  const email = String(user?.email || profile?.email || '').trim().toLowerCase();
  return DEMO_ACCOUNTS.has(email) || profile?.botDemo === true;
}
