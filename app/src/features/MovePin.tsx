/**
 * C5's Move pin: the map moves under a fixed crosshair, so placing a pin never depends on a
 * drag on a small target (spec §3 C5, §14). Use my location jumps there.
 */
import type { LatLng } from '@qualk/shared';
import { useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { QMap, type QMapRef } from '@/components/MapPieces';
import { Txt } from '@/components/Txt';
import { currentPlace } from '@/location/places';
import { colors, radius, spacing } from '@/theme/tokens';

export function MovePin({
  visible,
  start,
  onDismiss,
  onDone,
}: {
  visible: boolean;
  start: LatLng;
  onDismiss: () => void;
  onDone: (p: LatLng) => void;
}) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<QMapRef>(null);
  const [center, setCenter] = useState<LatLng>(start);
  const [locating, setLocating] = useState(false);

  const goToMyLocation = async () => {
    setLocating(true);
    const here = await currentPlace();
    setLocating(false);
    if (here.located) {
      mapRef.current?.animateToRegion(
        { ...here.location, latitudeDelta: 0.002, longitudeDelta: 0.002 },
        300,
      );
      setCenter(here.location);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.root}>
        <QMap
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={{ ...start, latitudeDelta: 0.003, longitudeDelta: 0.003 }}
          onRegionChangeComplete={(r) =>
            setCenter({ latitude: r.latitude, longitude: r.longitude })
          }
          showsUserLocation
        />
        <View pointerEvents="none" style={styles.crosshair} accessibilityElementsHidden>
          <View style={styles.ring}>
            <Icon name="crosshair" size={30} color={colors.ink} strokeWidth={2.4} />
          </View>
        </View>
        <View style={[styles.top, { top: insets.top + spacing.sm }]}>
          <IconButton icon="close" label="Cancel" tone="surface" onPress={onDismiss} />
          <View style={styles.hint}>
            <Txt variant="callout">Move the map until the crosshair is on the spot.</Txt>
          </View>
        </View>
        <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Button
            label="Use my location"
            icon="gps"
            kind="secondary"
            loading={locating}
            onPress={() => void goToMyLocation()}
          />
          <Button label="Put the pin here" large onPress={() => onDone(center)} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.mapBase },
  crosshair: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  top: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  hint: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md - 4,
    paddingVertical: spacing.sm,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm + 2,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
});
