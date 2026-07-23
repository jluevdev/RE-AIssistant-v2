import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '../../../components/ui';
import { hero } from '../marketingContent';

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-50/80 via-white to-white">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
        <div>
          <p className="mb-4 inline-flex rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
            Built for real estate agents
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-[3.25rem] lg:leading-tight">
            {hero.headline}
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-600">{hero.subhead}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button as={Link} to="/signup" size="lg">
              {hero.primaryCta}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button as={Link} to="/#pricing" variant="outline" size="lg">
              {hero.secondaryCta}
            </Button>
          </div>
          <p className="mt-4 text-sm text-slate-500">{hero.trialNote}</p>
        </div>

        <div
          className="relative mx-auto w-full max-w-lg"
          aria-label="Product preview placeholder"
        >
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-100 via-white to-brand-50 p-1 shadow-card-hover">
            <div className="rounded-xl border border-slate-200/80 bg-white p-4">
              <div className="mb-4 flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-rose-400" />
                <div className="h-3 w-3 rounded-full bg-amber-400" />
                <div className="h-3 w-3 rounded-full bg-emerald-400" />
              </div>
              <div className="space-y-3">
                <div className="h-3 w-2/3 rounded bg-slate-200" />
                <div className="grid grid-cols-3 gap-2">
                  <div className="h-16 rounded-lg bg-brand-100" />
                  <div className="h-16 rounded-lg bg-accent-100" />
                  <div className="h-16 rounded-lg bg-slate-100" />
                </div>
                <div className="h-24 rounded-lg bg-slate-50 ring-1 ring-slate-100" />
                <div className="flex gap-2">
                  <div className="h-8 flex-1 rounded-md bg-brand-600/90" />
                  <div className="h-8 w-24 rounded-md bg-slate-200" />
                </div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">Dashboard preview — replace with product screenshot</p>
        </div>
      </div>
    </section>
  );
}
