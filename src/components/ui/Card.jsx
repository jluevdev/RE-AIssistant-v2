export default function Card({ as: Comp = 'div', className = '', padded = true, hover = false, children, ...props }) {
  const classes = [
    'bg-white border border-slate-200 rounded-xl shadow-card',
    padded ? 'p-5' : '',
    hover ? 'transition-shadow hover:shadow-card-hover' : '',
    className,
  ].join(' ');

  return (
    <Comp className={classes} {...props}>
      {children}
    </Comp>
  );
}

export function CardHeader({ title, subtitle, actions, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div>
        {title && <h3 className="font-semibold text-slate-900">{title}</h3>}
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
