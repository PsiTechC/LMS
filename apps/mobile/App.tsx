import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/auth/AuthContext';
import { FullScreenLoading } from './src/components';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAppFonts } from './src/theme';

export default function App() {
  const [fontsLoaded] = useAppFonts();

  if (!fontsLoaded) {
    // No Poppins yet - fall back to the full-screen loading state rather
    // than a flash of unstyled text.
    return <FullScreenLoading />;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
        <StatusBar style="dark" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
