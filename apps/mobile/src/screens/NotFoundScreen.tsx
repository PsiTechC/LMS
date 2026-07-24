import React from 'react';

import { ErrorState, ScreenContainer } from '../components';

/** Fallback for any route name the current stack doesn't recognize. */
export function NotFoundScreen() {
  return (
    <ScreenContainer>
      <ErrorState title="Screen not found" message="This screen doesn't exist." />
    </ScreenContainer>
  );
}
