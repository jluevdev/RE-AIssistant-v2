import { forwardRef, useId } from 'react';

const Select = forwardRef(function Select(
  { label, hint, error, className = '', id, containerClassName = '', children, ...props },
  ref
) {
  const autoId = useId();
  const selectId = id || autoId;

  return (
    <div className={containerClassName}>
      {label && (
        <label htmlFor={selectId} className="block text-xs font-medium text-slate-600 mb-1">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        aria-invalid={error ? true : undefined}
        className={[
          'w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:border-brand-500',
          error ? 'border-rose-300' : 'border-slate-300',
          className,
        ].join(' ')}
        {...props}
      >
        {children}
      </select>
      {error ? (
        <p className="mt-1 text-xs text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
});

export default Select;
