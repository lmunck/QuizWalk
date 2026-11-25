/** "Review our answers" (P5): each stop with the team's answer, the right one and the points. */
import { useLocalSearchParams } from 'expo-router';

import { useAuth } from '@/auth/AuthProvider';
import { Screen } from '@/components/Screen';
import { AnswerList } from '@/features/AnswerList';

export default function Answers() {
  const { walkId } = useLocalSearchParams<{ walkId: string }>();
  const { uid } = useAuth();
  return (
    <Screen title="Our answers">
      <AnswerList walkId={walkId} teamId={uid} />
    </Screen>
  );
}
