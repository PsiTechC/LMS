import React from 'react';
import { NavigationContainer } from '@react-navigation/native';

import { useAuth } from '../auth/AuthContext';
import { FullScreenLoading } from '../components';
import { AuthStack } from './AuthStack';
import { AppStack } from './AppStack';

/**
 * Session-gated navigation root: restore -> signed-out (AuthStack) or
 * signed-in (AppStack). Swapping the whole navigator on auth-state change
 * (rather than nesting a conditional inside one navigator) is the
 * React Navigation-recommended pattern for auth flows and guarantees a
 * signed-out user can never programmatically back into an authenticated
 * screen.
 */
export function RootNavigator() {
  const { status } = useAuth();

  if (status === 'restoring') {
    return <FullScreenLoading label="Loading your session…" />;
  }

  return (
    <NavigationContainer>
      {status === 'signed-in' ? <AppStack /> : <AuthStack />}
    </NavigationContainer>
  );
}
