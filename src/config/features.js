/**
 * SmartShowings is on unless the build sets VITE_SMART_SHOWINGS_ENABLED=false.
 * Outbound SMS stays mock until SMART_SHOWINGS_SMS_MODE=live.
 */
export const smartShowingsEnabled = import.meta.env.VITE_SMART_SHOWINGS_ENABLED !== 'false';
