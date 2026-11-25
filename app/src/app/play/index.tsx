/**
 * https://qualk.dk/play?code=K72QX opens here (App Links / Universal Links). The link goes
 * straight to joining: no welcome screen, no sign-in (spec §2).
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function PlayLink() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  return <Redirect href={{ pathname: '/join', params: code ? { code } : {} }} />;
}
