// ── Light palette (default) ───────────────────────────────────────────────────

export const lightColors = {
  // Brand
  primary:       '#F5C518',
  primaryDark:   '#D4A017',
  primaryLight:  '#FDE68A',

  // Backgrounds
  background:  '#FFFFFF',
  surface:     '#F8F9FA',
  surfaceAlt:  '#F1F3F4',

  // Text
  text:          '#111827',
  textSecondary: '#6B7280',
  textDisabled:  '#9CA3AF',
  textOnPrimary: '#111827',

  // Semantic
  success:      '#10B981',
  successLight: '#D1FAE5',
  error:        '#EF4444',
  errorLight:   '#FEE2E2',
  warning:      '#F59E0B',
  warningLight: '#FEF3C7',
  info:         '#3B82F6',
  infoLight:    '#DBEAFE',

  // UI
  border:      '#E5E7EB',
  borderFocus: '#F5C518',
  shadow:      '#000000',
  overlay:     'rgba(0,0,0,0.45)',
  white:       '#FFFFFF',
  black:       '#000000',
  transparent: 'transparent',

  // Status chips
  statusRequested:  '#F59E0B',
  statusAccepted:   '#3B82F6',
  statusInProgress: '#10B981',
  statusCompleted:  '#6B7280',
  statusCancelled:  '#EF4444',
} as const;

// ── Dark palette ──────────────────────────────────────────────────────────────

export const darkColors = {
  // Brand — keep yellow vibrant
  primary:       '#F5C518',
  primaryDark:   '#D4A017',
  primaryLight:  '#92731A',

  // Backgrounds
  background:  '#111827',
  surface:     '#1F2937',
  surfaceAlt:  '#374151',

  // Text
  text:          '#F9FAFB',
  textSecondary: '#9CA3AF',
  textDisabled:  '#6B7280',
  textOnPrimary: '#111827',

  // Semantic
  success:      '#34D399',
  successLight: '#064E3B',
  error:        '#F87171',
  errorLight:   '#7F1D1D',
  warning:      '#FBD24C',
  warningLight: '#78350F',
  info:         '#60A5FA',
  infoLight:    '#1E3A5F',

  // UI
  border:      '#374151',
  borderFocus: '#F5C518',
  shadow:      '#000000',
  overlay:     'rgba(0,0,0,0.65)',
  white:       '#FFFFFF',
  black:       '#000000',
  transparent: 'transparent',

  // Status chips
  statusRequested:  '#FBD24C',
  statusAccepted:   '#60A5FA',
  statusInProgress: '#34D399',
  statusCompleted:  '#9CA3AF',
  statusCancelled:  '#F87171',
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

// Mapped to `string` so both lightColors and darkColors satisfy the type
// (each palette's `as const` literal values differ, but both are strings).
export type ColorPalette = { readonly [K in keyof typeof lightColors]: string };
export type ColorKey     = keyof ColorPalette;

