import { useEffect, useId, useRef, useState } from 'react';

/**
 * Lightweight accessible tooltip — hover, focus, and tap on mobile.
 */
export default function Tooltip({
  content,
  children,
  position = 'top',
  className = '',
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [open]);

  const positionClass =
    position === 'bottom'
      ? 'top-full left-1/2 -translate-x-1/2 mt-2'
      : 'bottom-full left-1/2 -translate-x-1/2 mb-2';

  return (
    <span ref={rootRef} className={`relative inline-flex ${className}`}>
      <span
        tabIndex={0}
        aria-describedby={open ? id : undefined}
        className="inline-flex cursor-help rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        {children}
      </span>
      {open && content && (
        <span
          id={id}
          role="tooltip"
          className={`absolute z-50 w-max max-w-[240px] rounded-lg border border-slate-200 bg-slate-900 px-3 py-2 text-xs text-white shadow-lg ${positionClass}`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
