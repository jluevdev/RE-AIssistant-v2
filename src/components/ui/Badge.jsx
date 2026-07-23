const TONES = {
  brand: 'bg-brand-50 text-brand-700 border-brand-200',
  success: 'bg-accent-50 text-accent-700 border-accent-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-rose-50 text-rose-700 border-rose-200',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function Badge({ tone = 'neutral', className = '', children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${
        TONES[tone] || TONES.neutral
      } ${className}`}
    >
      {children}
    </span>
  );
}
