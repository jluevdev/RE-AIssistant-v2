import { brand } from '../../theme/tokens';

export default function Logo({ collapsed = false, variant = 'mark', className = '' }) {
  const tall = variant === 'lockup';
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src="/icons/app-icon.png"
        alt=""
        width={tall ? 40 : 32}
        height={tall ? 40 : 32}
        className={`${tall ? 'h-10 w-10' : 'h-8 w-8'} shrink-0`}
      />
      {!collapsed && (
        <img
          src="/brand/wordmark.png"
          alt={brand.name}
          width={168}
          height={28}
          className={`${tall ? 'h-7' : 'h-6'} w-auto max-w-[10.5rem] object-contain object-left`}
        />
      )}
      {collapsed && <span className="sr-only">{brand.name}</span>}
    </span>
  );
}
