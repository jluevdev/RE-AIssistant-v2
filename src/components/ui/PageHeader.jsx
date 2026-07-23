import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

export default function PageHeader({ title, subtitle, actions, backTo, backLabel = 'Back', icon: Icon }) {
  return (
    <div className="mb-6">
      {backTo && (
        <Link
          to={backTo}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-2"
        >
          <ChevronLeft className="w-4 h-4" />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {Icon && (
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Icon className="w-5 h-5" />
            </span>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
            {subtitle && <p className="text-sm text-slate-600 mt-1">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
