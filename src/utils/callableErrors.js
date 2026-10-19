export function isCloudFunctionsUnavailable(error) {
  const code = error?.code || '';
  const raw = String(error?.message || '');
  return (
    code === 'functions/internal'
    || code === 'functions/unavailable'
    || code === 'functions/deadline-exceeded'
    || /billing is disabled/i.test(raw)
    || /^internal$/i.test(raw.trim())
  );
}

export function friendlyCallableError(error, fallback, billingHint) {
  if (isCloudFunctionsUnavailable(error)) {
    return billingHint || 'Cloud Functions are unavailable (Google Cloud billing may be off). Try again after billing is enabled.';
  }
  return error?.message || fallback;
}
