import { brand } from '../../../theme/tokens';
import { privacySections } from '../marketingContent';

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Legal</p>
      <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">Privacy Policy</h1>
      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Template for review by legal counsel — not final legal advice.
      </p>

      <div className="prose prose-slate mt-10 max-w-none space-y-8">
        {privacySections.map((section) => (
          <section key={section.title}>
            <h2 className="text-xl font-semibold text-slate-900">{section.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{section.body}</p>
          </section>
        ))}
      </div>

      <p className="mt-12 text-xs text-slate-400">Last updated: {new Date().getFullYear()} · {brand.name}</p>
    </article>
  );
}
