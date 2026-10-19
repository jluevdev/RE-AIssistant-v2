/** Build-time flag. Off unless VITE_SMART_SHOWINGS_ENABLED=true. */
export const smartShowingsEnabled = import.meta.env.VITE_SMART_SHOWINGS_ENABLED === 'true';
