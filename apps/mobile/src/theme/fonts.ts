import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';

/**
 * Loads the Poppins weights used across the design system (apps/CLAUDE.md).
 * Returns `[fontsLoaded, error]` — callers should hold the full-screen
 * loading state until `fontsLoaded` is true (see App.tsx).
 */
export function useAppFonts() {
  return useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });
}
