/**
 * Android's fused compass (see android/…/QualkHeadingModule.kt). Null on iOS, and on Android
 * builds made before the module existed.
 */
import { NativeModule, requireOptionalNativeModule } from 'expo';

export interface RotationEvent {
  /** SensorManager.getRotationMatrixFromVector: row-major, device to world (east, north, up). */
  matrix: number[];
  /** The sensor's own heading uncertainty, where the phone gives one. */
  accuracyDeg: number | null;
  /** SensorManager.SENSOR_STATUS_*, or -1 until Android reports it. */
  status: number;
}

type Events = { onRotation: (event: RotationEvent) => void };

declare class QualkHeadingModule extends NativeModule<Events> {
  isAvailable(): boolean;
  declination(latitude: number, longitude: number): number;
}

export default requireOptionalNativeModule<QualkHeadingModule>('QualkHeading');
