/**
 * Design tokens — single source of truth for RE-AIssistant-v2 skinning.
 *
 * Re-skinning the whole app should be a one-file change here:
 *   - Swap `brandColors` / `accentColors` scales to rebrand.
 *   - Change `brand.name` / `brand.shortName` / logo to relabel.
 *
 * These color scales are imported by tailwind.config.js so classes like
 * `bg-brand-600`, `text-brand-700`, `bg-accent-500` stay in sync automatically.
 * Kept as pure ESM (no React) so it is safe to import from the Tailwind config.
 */

export const brandColors = {
  50: '#eff6ff',
  100: '#dbeafe',
  200: '#bfdbfe',
  300: '#93c5fd',
  400: '#60a5fa',
  500: '#3b82f6',
  600: '#2563eb',
  700: '#1d4ed8',
  800: '#1e40af',
  900: '#1e3a8a',
};

export const accentColors = {
  50: '#ecfdf5',
  100: '#d1fae5',
  200: '#a7f3d0',
  300: '#6ee7b7',
  400: '#34d399',
  500: '#10b981',
  600: '#059669',
  700: '#047857',
  800: '#065f46',
  900: '#064e3b',
};

/** Brand identity — placeholder, swap freely. */
export const brand = {
  name: 'RE AIssistant',
  shortName: 'RE',
  tagline: 'Your always-on real estate teammate',
};

/** Shared visual constants (mirrors Tailwind usage; adjust to taste). */
export const radius = {
  card: 'rounded-xl',
  control: 'rounded-lg',
  pill: 'rounded-full',
};

export const font = {
  sans: "Inter, system-ui, sans-serif",
};

export default { brandColors, accentColors, brand, radius, font };
