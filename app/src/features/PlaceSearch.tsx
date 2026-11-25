/** G2 search a place: the platform geocoder, no extra API (spec §3 G2). */
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import { searchPlaces, type PlaceResult } from '@/location/places';
import { colors, minTouchTarget, radius, spacing, type as typeScale } from '@/theme/tokens';

export function PlaceSearch({
  visible,
  onDismiss,
  onPick,
}: {
  visible: boolean;
  onDismiss: () => void;
  onPick: (place: PlaceResult) => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>();
  const [busy, setBusy] = useState(false);

  const search = async () => {
    setBusy(true);
    setResults(await searchPlaces(query));
    setBusy(false);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View style={[styles.root, { paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Txt variant="heading" style={styles.flex} accessibilityRole="header">
            Find a place
          </Txt>
          <IconButton icon="close" label="Close" onPress={onDismiss} />
        </View>
        <View style={styles.searchRow}>
          <Icon name="search" size={20} color={colors.secondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Address or place, e.g. Nyhavn 17, Copenhagen"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={() => void search()}
            accessibilityLabel="Search for a place"
          />
        </View>
        <ScrollView contentContainerStyle={styles.results} keyboardShouldPersistTaps="handled">
          {busy ? <ActivityIndicator color={colors.accent} /> : null}
          {!busy && results?.length === 0 ? (
            <Txt variant="callout" color={colors.secondary}>
              Nothing found. Try adding the town, or long-press the map instead.
            </Txt>
          ) : null}
          {results?.map((r, i) => (
            <Pressable
              key={`${r.location.latitude},${r.location.longitude},${i}`}
              onPress={() => {
                onPick(r);
                setQuery('');
                setResults(undefined);
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.result, pressed && { backgroundColor: colors.tint }]}
            >
              <Icon name="pin" size={20} color={colors.accent} />
              <View style={styles.flex}>
                <Txt variant="bodyStrong">{r.label}</Txt>
                <Txt variant="caption" color={colors.muted}>
                  {r.location.latitude.toFixed(5)}, {r.location.longitude.toFixed(5)}
                </Txt>
              </View>
              <Txt variant="calloutStrong" color={colors.accent}>
                Add
              </Txt>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingTop: spacing.md,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
  },
  input: { ...typeScale.body, flex: 1, minHeight: minTouchTarget + 4, color: colors.ink },
  results: { padding: spacing.lg, gap: spacing.sm },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    padding: spacing.md - 4,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 60,
  },
});
