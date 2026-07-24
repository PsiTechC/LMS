/**
 * XA-LMS mobile design tokens.
 *
 * Mirrors the confirmed brand tokens in `apps/CLAUDE.md` (Midnight Navy /
 * Champagne Gold design system) as semantic React Native constants. Do not
 * invent new colors in screens/components — extend this file instead.
 *
 * Source of truth: apps/CLAUDE.md ("Color Tokens", "Typography", "Shadow
 * Scale", "Border Radius System", "Persona Accent Colors").
 */

export const colors = {
  brand: {
    navy: '#182848', // Midnight Navy — primary text, header/tab bg, primary-solid button
    gold: '#C8A860', // Champagne Gold — CTA button, active states, progress fill
    slate: '#4A5573', // coaching / capstone / peer-review accent
  },
  surface: {
    page: '#F7F5F0', // Parchment — screen background
    card: '#FFFFFF', // cards, sheets, modals
    alt: '#EFE9DC', // alt rows, progress track, input bg
    border: '#E6DED0', // Sand — all borders/dividers
  },
  text: {
    primary: '#182848',
    secondary: '#4A5573',
    inverse: '#FFFFFF',
  },
  status: {
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    inactive: '#C9BFA8',
  },
  // Persona accent colors (apps/CLAUDE.md "Persona Accent Colors"). "coach"
  // has no dedicated row in that table; it is treated as a Faculty-adjacent
  // persona there (coaching accent = Slate), so it reuses `slate` here too —
  // flagged for design sign-off if a distinct coach accent is ever wanted.
  persona: {
    participant: '#C8A860',
    participant_retailer: '#C8A860',
    program_manager: '#182848',
    faculty: '#4A5573',
    coach: '#4A5573',
    superadmin: '#0052CC',
    superadmin_secondary: '#0052CC',
  } as Record<string, string>,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  card: 12,
  modal: 16,
  button: 8,
  buttonFull: 10,
  buttonSmall: 6,
  input: 8,
  pill: 99,
} as const;

// Poppins is loaded via @expo-google-fonts/poppins (see src/theme/fonts.ts).
// Fall back to the platform default while fonts are loading so first paint
// never blocks on the network font fetch.
export const fontFamily = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semiBold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
  extraBold: 'Poppins_800ExtraBold',
} as const;

export const typography = {
  screenTitle: { fontSize: 17, fontFamily: fontFamily.bold, color: colors.text.primary },
  cardTitle: { fontSize: 15, fontFamily: fontFamily.bold, color: colors.text.primary },
  body: { fontSize: 13, fontFamily: fontFamily.regular, color: colors.text.primary },
  bodyMedium: { fontSize: 13, fontFamily: fontFamily.medium, color: colors.text.primary },
  buttonLabel: { fontSize: 12, fontFamily: fontFamily.bold },
  meta: { fontSize: 11, fontFamily: fontFamily.medium, color: colors.text.secondary },
  microLabel: {
    fontSize: 10,
    fontFamily: fontFamily.bold,
    color: colors.text.secondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  statNumber: { fontSize: 26, fontFamily: fontFamily.extraBold, color: colors.text.primary },
} as const;

// React Native shadow tokens (iOS: shadow* props, Android: elevation).
// Values approximate the web box-shadow scale in apps/CLAUDE.md.
export const shadows = {
  card: {
    shadowColor: '#182848',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  dropdown: {
    shadowColor: '#182848',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 32,
    elevation: 6,
  },
  modal: {
    shadowColor: '#182848',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.22,
    shadowRadius: 64,
    elevation: 12,
  },
} as const;

export type PersonaRole = keyof typeof colors.persona;
