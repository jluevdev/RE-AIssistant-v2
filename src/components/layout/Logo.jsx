import { brand } from '../../theme/tokens';

/**
 * Placeholder logo — swappable via theme/tokens.js.
 * Replace the mark/text here (or drop in an <img>) to rebrand.
 */
export default function Logo({ collapsed = false, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white font-bold">
        {brand.shortName}
      </span>
      {!collapsed && (
        <span className="font-semibold text-slate-900 whitespace-nowrap">{brand.name}</span>
      )}
    </span>
  );
}
