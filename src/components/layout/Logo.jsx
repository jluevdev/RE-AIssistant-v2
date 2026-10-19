import { brand } from '../../theme/tokens';

export default function Logo({ collapsed = false, variant = 'mark', className = '' }) {
  if (variant === 'lockup') {
    return (
      <img
        src="/brand/lockup.png"
        alt={brand.name}
        className={`block h-16 w-auto max-w-full object-contain object-left ${className}`}
      />
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img src="/icons/app-icon.png" alt={collapsed ? brand.name : ''} className="h-8 w-8 shrink-0" />
      {!collapsed && (
        <img
          src="/brand/wordmark.png"
          alt={brand.name}
          className="h-6 w-auto max-w-[10.5rem] object-contain object-left"
        />
      )}
    </span>
  );
}
