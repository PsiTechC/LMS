import * as SecureStore from 'expo-secure-store';

/**
 * Secure, Expo-compatible persistence for the auth token. Never use
 * AsyncStorage or any browser storage for this value — expo-secure-store
 * backs onto Keychain (iOS) / Keystore-backed EncryptedSharedPreferences
 * (Android).
 */
const TOKEN_KEY = 'xa_lms_access_token';

export async function getStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    // Corrupt/inaccessible secure storage — treat as no session rather than
    // crashing app launch.
    return null;
  }
}

export async function setStoredToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearStoredToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Nothing to clear / storage unavailable — logout should still proceed.
  }
}
