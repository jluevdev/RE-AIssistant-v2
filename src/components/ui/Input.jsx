import { forwardRef, useId } from 'react';

const Input = forwardRef(function Input(
  { label, hint, error, className = '', id, containerClassName = '', ...props },
  ref
) {
  const autoId = useId();
  const inputId = id || autoId;

  return (
    <div className={containerClassName}>
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-slate-600 mb-1">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        className={[
          'w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:border-brand-500',
          error ? 'border-rose-300' : 'border-slate-300',
          className,
        ].join(' ')}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="mt-1 text-xs text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export default Input;
