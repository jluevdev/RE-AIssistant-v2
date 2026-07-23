import { socialProof } from '../marketingContent';

export default function SocialProofStrip() {
  return (
    <section className="border-y border-slate-200 bg-white py-8" aria-label="Social proof">
      <div className="mx-auto grid max-w-4xl grid-cols-3 gap-4 px-4 text-center sm:px-6">
        {socialProof.map((item) => (
          <div key={item.label}>
            <p className="text-2xl font-bold text-brand-700 sm:text-3xl">{item.value}</p>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">{item.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
