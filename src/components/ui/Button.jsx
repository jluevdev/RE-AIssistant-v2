import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500 border border-transparent',
  secondary:
    'bg-slate-800 text-white hover:bg-slate-900 focus-visible:ring-slate-500 border border-transparent',
  outline:
    'bg-white text-slate-800 hover:bg-slate-50 border border-slate-300 focus-visible:ring-brand-500',
  ghost:
    'bg-transparent text-slate-700 hover:bg-slate-100 border border-transparent focus-visible:ring-brand-500',
  accent:
    'bg-accent-600 text-white hover:bg-accent-700 focus-visible:ring-accent-500 border border-transparent',
  danger:
    'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500 border border-transparent',
};

const SIZES = {
  sm: 'text-sm px-3 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2 gap-2',
  lg: 'text-base px-5 py-2.5 gap-2',
};

export default function Button({
  as: Comp = 'button',
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  children,
  ...props
}) {
  const isNativeButton = Comp === 'button';
  const classes = [
    'inline-flex items-center justify-center font-medium rounded-lg transition-colors',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:opacity-50 disabled:pointer-events-none',
    VARIANTS[variant] || VARIANTS.primary,
    SIZES[size] || SIZES.md,
    className,
  ].join(' ');

  return (
    <Comp
      className={classes}
      disabled={isNativeButton ? disabled || loading : undefined}
      aria-disabled={!isNativeButton && (disabled || loading) ? true : undefined}
      {...(isNativeButton && !props.type ? { type: 'button' } : {})}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
      {children}
    </Comp>
  );
}
