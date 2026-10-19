import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { brand } from '../../theme/tokens';

const SLIDES = [
  {
    tone: 'hero',
    kicker: 'Expo',
    title: brand.name,
    lede: brand.tagline,
    tiles: [
      { value: '7', label: 'day trial', detail: 'No card to start' },
      { value: '$999', label: 'for the year', detail: 'All-Inclusive Agent' },
      { value: 'Call', label: 'for teams', detail: 'Expo pricing' },
    ],
    footnote: 'Not affiliated with CAR Expo.',
  },
  {
    tone: 'light',
    kicker: 'Workspace',
    title: 'The whole day.\nOne quiet screen.',
    lede: 'Inbox, contacts, and follow-ups stay together.',
    tiles: [
      { value: '01', label: 'Dashboard', detail: 'The pipeline, at a glance.' },
      { value: '02', label: 'Messages', detail: 'Buyers and sellers, one thread.' },
      { value: '03', label: 'Contacts', detail: 'People from check-in and follow-up.' },
      { value: '04', label: 'Automations', detail: 'Reminders while you are in the field.' },
    ],
  },
  {
    tone: 'light',
    kicker: 'Listing agent',
    title: 'From the open house\nto the offer.',
    lede: 'Check-in, the listing, and a side-by-side compare.',
    tiles: [
      { value: 'QR', label: 'Check-in', detail: 'Visitors sign in on their phone.' },
      { value: '01', label: 'Listing', detail: 'Follow-ups stay on the house.' },
      { value: '02', label: 'Offers', detail: 'Collect, compare, status, attachments.' },
    ],
    footnote: 'Signature packet is a summary the parties sign. Not a CAR form.',
  },
  {
    tone: 'light',
    kicker: 'Buyer agent',
    title: 'A tour, not\na spreadsheet.',
    lede: 'Build the route. Send the requests. Share the plan.',
    tiles: [
      { value: '01', label: 'Route', detail: 'Stops for the day, in order.' },
      { value: '02', label: 'Requests', detail: 'Showing texts, sent in bulk.' },
      { value: '03', label: 'Client link', detail: 'A secure plan. No app install.' },
    ],
  },
  {
    tone: 'light',
    kicker: 'Team',
    title: 'The office,\nand a teammate.',
    lede: 'Roles for the brokerage. Answers from your own records.',
    tiles: [
      { value: '01', label: 'Invites', detail: 'Agents, with roles.' },
      { value: '02', label: 'Assistant', detail: 'Tours, messages, houses, offers.' },
      { value: '03', label: 'Teams', detail: 'Call for Expo pricing.' },
    ],
  },
  {
    tone: 'price',
    kicker: 'Pricing',
    title: 'Simple at the booth.',
    lede: 'Monthly stays. The Expo special is the year.',
    prices: [
      { name: 'Single Agent', amount: '$299', cadence: 'per month' },
      { name: 'All-Inclusive', amount: '$499', cadence: 'per month', featured: false },
      { name: 'Expo special', amount: '$999', cadence: 'for the year', featured: true },
    ],
    footnote: 'Teams: call for Expo pricing. Not affiliated with CAR Expo.',
  },
  {
    tone: 'future',
    kicker: 'Signatures',
    title: 'Smart e-sign.',
    lede: 'Drawing up an offer, without the paperwork pile.',
    steps: [
      { n: '1', label: 'Pick the listing and the parties.' },
      { n: '2', label: 'The assistant fills the packet.' },
      { n: '3', label: 'Everyone signs on their phone.' },
      { n: '4', label: 'Status lands on Offers.' },
    ],
    footnote: 'Summary packet. Not a CAR form.',
  },
];

export default function OverviewDeck() {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === ' ') {
        event.preventDefault();
        setIndex((current) => Math.min(SLIDES.length - 1, current + 1));
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        setIndex((current) => Math.max(0, current - 1));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function go(next) {
    setIndex(Math.max(0, Math.min(SLIDES.length - 1, next)));
  }

  const dark = slide.tone === 'hero' || slide.tone === 'future';

  return (
    <div className="-mx-4 -my-6 sm:-mx-6 lg:-mx-8">
      <style>{`
        @keyframes overview-rise {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: none; }
        }
      `}</style>
      <section
        className={`relative flex min-h-[calc(100vh-4rem)] flex-col overflow-hidden px-6 pb-28 pt-8 sm:px-10 md:pb-16 ${
          dark ? 'bg-[#070b14] text-white' : 'bg-[#f5f5f7] text-slate-950'
        }`}
        onTouchStart={(event) => {
          event.currentTarget.dataset.x = String(event.changedTouches[0].clientX);
        }}
        onTouchEnd={(event) => {
          const start = Number(event.currentTarget.dataset.x || 0);
          const delta = event.changedTouches[0].clientX - start;
          if (delta < -48) go(index + 1);
          if (delta > 48) go(index - 1);
        }}
      >
        <div
          className={`pointer-events-none absolute -left-24 top-0 h-80 w-80 rounded-full blur-3xl ${
            dark ? 'bg-brand-600/30' : 'bg-brand-200/70'
          }`}
        />
        <div
          className={`pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full blur-3xl ${
            dark ? 'bg-accent-500/20' : 'bg-accent-100'
          }`}
        />

        <div key={index} className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col" style={{ animation: 'overview-rise 0.55s ease' }}>
          <div className="flex items-center justify-between">
            <img src="/icons/app-icon.png" alt={brand.name} className="h-9 w-9" />
            <p className={`text-xs tracking-[0.22em] uppercase ${dark ? 'text-white/50' : 'text-slate-400'}`}>
              {slide.kicker}
            </p>
          </div>

          <div className="mt-10 flex flex-1 flex-col justify-center sm:mt-14">
            <h1 className="max-w-4xl whitespace-pre-line text-5xl font-semibold tracking-tight sm:text-7xl">
              {slide.title}
            </h1>
            <p className={`mt-5 max-w-2xl text-xl sm:text-2xl ${dark ? 'text-white/70' : 'text-slate-500'}`}>
              {slide.lede}
            </p>

            {slide.tiles && (
              <div className={`mt-12 grid gap-4 ${slide.tiles.length > 3 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
                {slide.tiles.map((tile) => (
                  <article
                    key={tile.label}
                    className={`rounded-3xl px-5 py-6 ${
                      dark ? 'border border-white/10 bg-white/5' : 'bg-white shadow-[0_20px_50px_-30px_rgba(15,23,42,0.45)]'
                    }`}
                  >
                    <p className={`text-3xl font-semibold tracking-tight ${dark ? 'text-white' : 'text-brand-700'}`}>{tile.value}</p>
                    <p className="mt-3 text-lg font-medium">{tile.label}</p>
                    <p className={`mt-1 text-sm ${dark ? 'text-white/60' : 'text-slate-500'}`}>{tile.detail}</p>
                  </article>
                ))}
              </div>
            )}

            {slide.prices && (
              <div className="mt-12 grid gap-4 md:grid-cols-3">
                {slide.prices.map((price) => (
                  <article
                    key={price.name}
                    className={`rounded-[2rem] px-6 py-8 ${
                      price.featured
                        ? 'bg-[#070b14] text-white shadow-[0_30px_80px_-40px_rgba(37,99,235,0.9)] md:-translate-y-3'
                        : 'bg-white text-slate-950'
                    }`}
                  >
                    <p className={`text-sm ${price.featured ? 'text-white/60' : 'text-slate-500'}`}>{price.name}</p>
                    <p className="mt-3 text-6xl font-semibold tracking-tight">{price.amount}</p>
                    <p className={`mt-2 text-sm ${price.featured ? 'text-accent-300' : 'text-slate-500'}`}>{price.cadence}</p>
                  </article>
                ))}
              </div>
            )}

            {slide.steps && (
              <ol className="mt-14 grid gap-6 sm:grid-cols-4">
                {slide.steps.map((step) => (
                  <li key={step.n}>
                    <p className="text-4xl font-semibold text-white/30">{step.n}</p>
                    <p className="mt-3 text-lg leading-snug">{step.label}</p>
                  </li>
                ))}
              </ol>
            )}

            {slide.footnote && (
              <p className={`mt-10 text-sm ${dark ? 'text-white/45' : 'text-slate-400'}`}>{slide.footnote}</p>
            )}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-6 flex items-center justify-between px-6 sm:px-10 md:bottom-8">
          <button
            type="button"
            aria-label="Previous slide"
            className={`flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-30 ${
              dark ? 'bg-white/10 text-white' : 'bg-white text-slate-900 shadow-sm'
            }`}
            onClick={() => go(index - 1)}
            disabled={index === 0}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            {SLIDES.map((item, dot) => (
              <button
                key={item.kicker}
                type="button"
                aria-label={`Slide ${dot + 1}`}
                className={`h-1.5 rounded-full transition-all ${dot === index ? 'w-8 bg-brand-600' : `w-1.5 ${dark ? 'bg-white/30' : 'bg-slate-300'}`}`}
                onClick={() => go(dot)}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Next slide"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-white disabled:opacity-30"
            onClick={() => go(index + 1)}
            disabled={index === SLIDES.length - 1}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </section>
    </div>
  );
}
