/** Whether the phone is offline, from the OS (expo-network), not from Firestore's cache flags. */
import { useNetworkState } from 'expo-network';

export function useOffline(): boolean {
  const n = useNetworkState();
  return n.isConnected === false || n.isInternetReachable === false;
}
