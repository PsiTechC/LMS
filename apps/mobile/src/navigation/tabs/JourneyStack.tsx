import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { JourneyScreen } from '../../screens/journey/JourneyScreen';
import { ActivityDetailScreen } from '../../screens/journey/ActivityDetailScreen';
import { AssessmentsListScreen } from '../../screens/assessments/AssessmentsListScreen';
import { AssessmentIntroScreen } from '../../screens/assessments/AssessmentIntroScreen';
import { AssessmentAttemptScreen } from '../../screens/assessments/AssessmentAttemptScreen';
import { AssessmentResultScreen } from '../../screens/assessments/AssessmentResultScreen';
import type { ActivityDTO, AssessmentCardDTO, AssessmentResultDTO, SubmissionDTO } from '../../types/api';
import { colors, fontFamily } from '../../theme';

export type JourneyStackParamList = {
  Journey: undefined;
  ActivityDetail: { activity: ActivityDTO; submission: SubmissionDTO | null };
  AssessmentsList: { programId?: string } | undefined;
  AssessmentIntro: { card: AssessmentCardDTO };
  AssessmentAttempt: { activityId: string; title: string };
  AssessmentResult: { result: AssessmentResultDTO };
};

const Stack = createNativeStackNavigator<JourneyStackParamList>();

/** Home tab: My Journey dashboard -> activity detail/submission, and the
 * quiz-backed Assessments sub-flow (list -> instructions -> attempt -> result). */
export function JourneyStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.brand.navy },
        headerTintColor: colors.text.inverse,
        headerTitleStyle: { fontFamily: fontFamily.bold, fontSize: 15 },
        contentStyle: { backgroundColor: colors.surface.page },
      }}
    >
      <Stack.Screen name="Journey" component={JourneyScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ActivityDetail" component={ActivityDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="AssessmentsList" component={AssessmentsListScreen} options={{ title: 'Assessments' }} />
      <Stack.Screen name="AssessmentIntro" component={AssessmentIntroScreen} options={{ title: 'Assessment' }} />
      {/* Modal presentation with the swipe-back gesture disabled — the
          in-progress attempt has its own confirm-before-leaving flow (see
          AssessmentAttemptScreen's beforeRemove/BackHandler listeners), so a
          casual swipe or tab switch must not silently discard it. */}
      <Stack.Screen
        name="AssessmentAttempt"
        component={AssessmentAttemptScreen}
        options={{ title: 'Attempt', headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }}
      />
      <Stack.Screen
        name="AssessmentResult"
        component={AssessmentResultScreen}
        options={{ title: 'Result', headerBackVisible: false, gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
