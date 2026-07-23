export default function EmptyState({ icon: Icon, title, description, action, className = '' }) {
  return (
    <div className={`text-center py-10 px-6 ${className}`}>
      {Icon && (
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Icon className="w-6 h-6" />
        </span>
      )}
      {title && <h3 className="text-sm font-semibold text-slate-900">{title}</h3>}
      {description && <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
