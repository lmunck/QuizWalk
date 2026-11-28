package expo.modules.qualkheading

import android.content.Context
import android.hardware.GeomagneticField
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * P3's compass on Android. expo-location builds its heading from the raw accelerometer and
 * magnetometer, which jumps with every step and swings when the phone is held upright. This
 * reads Android's rotation vector instead: the system's fusion of the gyroscope, accelerometer
 * and magnetometer, the sensor Google recommends for compasses. It sends the rotation matrix,
 * and the app works out the heading in shared/src/compass.ts, where it is tested.
 */
class QualkHeadingModule : Module(), SensorEventListener {
  private val sensorManager: SensorManager?
    get() = appContext.reactContext?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager

  /** JS is listening. */
  private var observing = false

  /** The sensor listener is registered (only while observing and in the foreground). */
  private var registered = false

  /** SensorManager.SENSOR_STATUS_*, or -1 until Android reports it. */
  private var status = -1
  private var lastSentAt = 0L

  override fun definition() = ModuleDefinition {
    Name("QualkHeading")

    Events(EVENT)

    Function("isAvailable") {
      sensorManager?.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) != null
    }

    /** Degrees east of north to add to a magnetic heading to get a true one. */
    Function("declination") { latitude: Double, longitude: Double ->
      GeomagneticField(latitude.toFloat(), longitude.toFloat(), 0f, System.currentTimeMillis())
        .declination
        .toDouble()
    }

    OnStartObserving(EVENT) {
      observing = true
      register()
    }

    OnStopObserving(EVENT) {
      observing = false
      unregister()
    }

    OnActivityEntersForeground {
      if (observing) register()
    }

    OnActivityEntersBackground {
      unregister()
    }

    OnDestroy {
      observing = false
      unregister()
    }
  }

  private fun register() {
    if (registered) return
    val manager = sensorManager ?: return
    val sensor = manager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) ?: return
    status = -1
    registered = manager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_UI)
  }

  private fun unregister() {
    if (!registered) return
    sensorManager?.unregisterListener(this)
    registered = false
  }

  override fun onSensorChanged(event: SensorEvent?) {
    if (event == null || event.sensor.type != Sensor.TYPE_ROTATION_VECTOR) return
    val now = SystemClock.elapsedRealtime()
    if (now - lastSentAt < MIN_INTERVAL_MS) return
    lastSentAt = now

    // Some older phones reject more than four values here.
    val vector = event.values.copyOf(minOf(event.values.size, 4))
    val matrix = FloatArray(9)
    SensorManager.getRotationMatrixFromVector(matrix, vector)

    // values[4] is the sensor's own heading uncertainty in radians, where the phone gives one.
    val accuracyRad = if (event.values.size > 4) event.values[4] else -1f
    val accuracyDeg: Double? =
      if (accuracyRad > 0f) Math.toDegrees(accuracyRad.toDouble()) else null

    sendEvent(
      EVENT,
      mapOf(
        "matrix" to matrix.map { it.toDouble() },
        "accuracyDeg" to accuracyDeg,
        "status" to status,
      ),
    )
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
    if (sensor?.type == Sensor.TYPE_ROTATION_VECTOR) status = accuracy
  }

  companion object {
    private const val EVENT = "onRotation"
    private const val MIN_INTERVAL_MS = 50L
  }
}
