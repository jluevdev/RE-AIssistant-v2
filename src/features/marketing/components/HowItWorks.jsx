import { howItWorks } from '../marketingContent';

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-y border-slate-200 bg-slate-50 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">How it works</h2>
          <p className="mt-4 text-lg text-slate-600">Three steps from signup to automated follow-up.</p>
        </div>

        <ol className="mt-12 grid gap-8 md:grid-cols-3">
          {howItWorks.map((item) => (
            <li key={item.step} className="relative rounded-xl border border-slate-200 bg-white p-6 shadow-card">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                {item.step}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
