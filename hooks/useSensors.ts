import { useState, useEffect, useRef } from "react";
import { Accelerometer, Gyroscope, DeviceMotion } from "expo-sensors";
import { THREE } from "expo-three";

export interface MotionData {
  rotation: {
    alpha: number;
    beta: number;
    gamma: number;
  };
  acceleration: {
    x: number;
    y: number;
    z: number;
  };
  gravity: {
    x: number;
    y: number;
    z: number;
  };
}

export interface SensorOptions {
  updateInterval?: number;
  useDeviceMotion?: boolean;
  useAccelerometer?: boolean;
  useGyroscope?: boolean;
}

const defaultOptions: SensorOptions = {
  updateInterval: 100,
  useDeviceMotion: true,
  useAccelerometer: false,
  useGyroscope: false,
};

export function useSensors(options: SensorOptions = {}) {
  const opts = { ...defaultOptions, ...options };

  const [isAvailable, setIsAvailable] = useState<boolean>(false);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [motionData, setMotionData] = useState<MotionData>({
    rotation: { alpha: 0, beta: 0, gamma: 0 },
    acceleration: { x: 0, y: 0, z: 0 },
    gravity: { x: 0, y: 0, z: 0 },
  });

  const [quaternion, setQuaternion] = useState<THREE.Quaternion>(
    new THREE.Quaternion()
  );
  const [deviceStability, setDeviceStability] = useState<number>(1.0);

  // For tracking motion over time
  const lastAccelerationRef = useRef<{ x: number; y: number; z: number }>({
    x: 0,
    y: 0,
    z: 0,
  });
  const recentMovementsRef = useRef<number[]>([]);
  const MAX_MOVEMENT_HISTORY = 10;

  // For calibration
  const baselineReadingsRef = useRef<number[]>([]);
  const isCalibrated = useRef<boolean>(false);
  const calibrationThreshold = 0.01; // Threshold for determining when device is stable for calibration

  const subscriptions = useRef({
    deviceMotion: null as ReturnType<typeof DeviceMotion.addListener> | null,
    accelerometer: null as ReturnType<typeof Accelerometer.addListener> | null,
    gyroscope: null as ReturnType<typeof Gyroscope.addListener> | null,
  });

  const setupSensors = async () => {
    let sensorAvailable = false;

    try {
      if (opts.useDeviceMotion) {
        const isDeviceMotionAvailable = await DeviceMotion.isAvailableAsync();

        if (isDeviceMotionAvailable) {
          sensorAvailable = true;
          DeviceMotion.setUpdateInterval(opts.updateInterval || 100);

          subscriptions.current.deviceMotion = DeviceMotion.addListener(
            (data) => {
              try {
                const { rotation, acceleration, accelerationIncludingGravity } =
                  data;

                if (rotation && acceleration && accelerationIncludingGravity) {
                  setMotionData({
                    rotation: {
                      alpha: rotation.alpha || 0,
                      beta: rotation.beta || 0,
                      gamma: rotation.gamma || 0,
                    },
                    acceleration: {
                      x: acceleration.x || 0,
                      y: acceleration.y || 0,
                      z: acceleration.z || 0,
                    },
                    gravity: {
                      x: accelerationIncludingGravity.x || 0,
                      y: accelerationIncludingGravity.y || 0,
                      z: accelerationIncludingGravity.z || 0,
                    },
                  });

                  updateDeviceOrientation(rotation);
                  calculateDeviceStability(acceleration);
                }
              } catch (err) {
                console.error("Error processing device motion data:", err);
                setHasError(true);
                setErrorMessage("Failed to process motion data");
              }
            }
          );
        } else {
          console.warn("DeviceMotion not available, will try fallback sensors");
          opts.useAccelerometer = true;
          opts.useGyroscope = true;
        }
      }

      if (opts.useAccelerometer) {
        const isAccelerometerAvailable = await Accelerometer.isAvailableAsync();

        if (isAccelerometerAvailable) {
          sensorAvailable = true;
          Accelerometer.setUpdateInterval(opts.updateInterval || 100);

          subscriptions.current.accelerometer = Accelerometer.addListener(
            (data) => {
              try {
                setMotionData((prev) => ({
                  ...prev,
                  acceleration: {
                    x: data.x || 0,
                    y: data.y || 0,
                    z: data.z || 0,
                  },
                }));

                if (
                  !opts.useDeviceMotion ||
                  !subscriptions.current.deviceMotion
                ) {
                  calculateDeviceStability(data);
                }
              } catch (err) {
                console.error("Error processing accelerometer data:", err);
              }
            }
          );
        }
      }

      if (opts.useGyroscope) {
        const isGyroscopeAvailable = await Gyroscope.isAvailableAsync();

        if (isGyroscopeAvailable) {
          sensorAvailable = true;
          Gyroscope.setUpdateInterval(opts.updateInterval || 100);

          subscriptions.current.gyroscope = Gyroscope.addListener((data) => {
            try {
              if (
                !opts.useDeviceMotion ||
                !subscriptions.current.deviceMotion
              ) {
                updateGyroscopeOrientation(data);
              }
            } catch (err) {
              console.error("Error processing gyroscope data:", err);
            }
          });
        }
      }

      if (!sensorAvailable) {
        setHasError(true);
        setErrorMessage("No motion sensors available on this device");
      }

      setIsAvailable(sensorAvailable);
      setIsActive(sensorAvailable);

      // Start with calibration mode
      isCalibrated.current = false;
      baselineReadingsRef.current = [];
    } catch (err) {
      console.error("Error setting up sensors:", err);
      setHasError(true);
      setErrorMessage("Failed to initialize device sensors");
      setIsAvailable(false);
      setIsActive(false);
    }
  };

  // Initial setup
  useEffect(() => {
    setupSensors();

    return () => {
      cleanupSubscriptions();
    };
  }, [
    opts.useDeviceMotion,
    opts.useAccelerometer,
    opts.useGyroscope,
    opts.updateInterval,
  ]);

  const cleanupSubscriptions = () => {
    try {
      if (subscriptions.current.deviceMotion) {
        subscriptions.current.deviceMotion.remove();
        subscriptions.current.deviceMotion = null;
      }

      if (subscriptions.current.accelerometer) {
        subscriptions.current.accelerometer.remove();
        subscriptions.current.accelerometer = null;
      }

      if (subscriptions.current.gyroscope) {
        subscriptions.current.gyroscope.remove();
        subscriptions.current.gyroscope = null;
      }
    } catch (err) {
      console.error("Error cleaning up sensor subscriptions:", err);
    }

    setIsActive(false);
  };

  const updateDeviceOrientation = (rotation: {
    alpha: number;
    beta: number;
    gamma: number;
  }) => {
    const alpha = rotation.alpha || 0;
    const beta = rotation.beta || 0;
    const gamma = rotation.gamma || 0;

    const degToRad = Math.PI / 180;

    const alphaRad = alpha * degToRad;
    const betaRad = beta * degToRad;
    const gammaRad = gamma * degToRad;

    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(betaRad, alphaRad, -gammaRad, "YXZ")
    );

    setQuaternion(q);
  };

  const updateGyroscopeOrientation = (data: {
    x: number;
    y: number;
    z: number;
  }) => {
    const x = data.x || 0;
    const y = data.y || 0;
    const z = data.z || 0;

    const deltaTime = opts.updateInterval ? opts.updateInterval / 1000 : 0.1;

    const rotationDelta = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(x * deltaTime, y * deltaTime, z * deltaTime, "XYZ")
    );

    const newQuaternion = quaternion.clone().multiply(rotationDelta);

    setQuaternion(newQuaternion);
  };

  const calculateDeviceStability = (acceleration: {
    x: number;
    y: number;
    z: number;
  }) => {
    // Calculate magnitude of current acceleration vector
    const magnitude = Math.sqrt(
      acceleration.x * acceleration.x +
        acceleration.y * acceleration.y +
        acceleration.z * acceleration.z
    );

    // If we're in calibration mode, try to establish a baseline
    if (!isCalibrated.current) {
      handleCalibration(magnitude, acceleration);
      return;
    }

    // Calculate change in acceleration from last reading
    const lastAccel = lastAccelerationRef.current;
    const deltaX = Math.abs(acceleration.x - lastAccel.x);
    const deltaY = Math.abs(acceleration.y - lastAccel.y);
    const deltaZ = Math.abs(acceleration.z - lastAccel.z);

    // Combined movement detection - this better captures device motion
    const totalMovement = Math.sqrt(
      deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ
    );

    // Store current reading for next comparison
    lastAccelerationRef.current = { ...acceleration };

    // Add to recent movements history
    recentMovementsRef.current.push(totalMovement);
    if (recentMovementsRef.current.length > MAX_MOVEMENT_HISTORY) {
      recentMovementsRef.current.shift();
    }

    // Calculate average recent movement
    const avgMovement =
      recentMovementsRef.current.reduce((sum, val) => sum + val, 0) /
      recentMovementsRef.current.length;

    // Convert movement to stability (0-1 range)
    // Based on your data, even small movements of 0.02-0.05 are significant
    // This maps movement to stability:
    // 0.0 movement -> 1.0 stability
    // >0.1 movement -> 0.0 stability (clamped)
    const newStability = Math.max(0, Math.min(1, 1 - avgMovement * 10));

    // Apply some smoothing between frames, don't jump directly to new value
    const currentStability = deviceStability;
    const smoothedStability = currentStability * 0.6 + newStability * 0.4;

    if (__DEV__) {
      // console.log("Movement:", totalMovement.toFixed(6));
      // console.log("Avg Movement:", avgMovement.toFixed(6));
      // console.log("New Stability:", newStability.toFixed(6));
      // console.log("Smoothed Stability:", smoothedStability.toFixed(6));
    }

    setDeviceStability(smoothedStability);
  };

  const handleCalibration = (
    magnitude: number,
    acceleration: { x: number; y: number; z: number }
  ) => {
    // Add current magnitude to calibration readings
    baselineReadingsRef.current.push(magnitude);

    // Keep only the most recent readings
    if (baselineReadingsRef.current.length > 20) {
      baselineReadingsRef.current.shift();
    }

    // After collecting enough readings, check if device is stable
    if (baselineReadingsRef.current.length >= 10) {
      // Calculate variance of readings
      const avg =
        baselineReadingsRef.current.reduce((sum, val) => sum + val, 0) /
        baselineReadingsRef.current.length;

      const variance =
        baselineReadingsRef.current.reduce(
          (sum, val) => sum + Math.pow(val - avg, 2),
          0
        ) / baselineReadingsRef.current.length;

      // If variance is below threshold, device is stable enough for calibration
      if (variance < calibrationThreshold) {
        if (__DEV__) {
          console.log("Device calibrated! Baseline magnitude:", avg);
          console.log("Variance:", variance);
        }

        // Initialize last acceleration values for future comparisons
        lastAccelerationRef.current = { ...acceleration };

        // Mark as calibrated
        isCalibrated.current = true;

        // Set initial stability to perfect since we're calibrated while still
        setDeviceStability(1.0);
      }
    }
  };

  const getDeviceOrientation = (): THREE.Quaternion => {
    return quaternion.clone();
  };

  const getTransformationMatrix = (): THREE.Matrix4 => {
    const matrix = new THREE.Matrix4();
    matrix.makeRotationFromQuaternion(quaternion);
    return matrix;
  };

  const getMovementQuality = (): {
    stability: number;
    recommendation: string;
  } => {
    if (!isCalibrated.current) {
      return {
        stability: 0,
        recommendation: "Hold the device still for calibration...",
      };
    }

    if (deviceStability > 0.85) {
      return {
        stability: deviceStability,
        recommendation: "Excellent stability. Perfect for scanning.",
      };
    } else if (deviceStability > 0.6) {
      return {
        stability: deviceStability,
        recommendation: "Good stability. Continue scanning.",
      };
    } else if (deviceStability > 0.3) {
      return {
        stability: deviceStability,
        recommendation:
          "Moderate movement. Try to hold the device more steady.",
      };
    } else {
      return {
        stability: deviceStability,
        recommendation:
          "Too much movement. Hold the device still to improve results.",
      };
    }
  };

  // Add a method to activate or deactivate the sensors
  const setSensorsActive = (active: boolean): void => {
    if (active && !isActive) {
      setupSensors();
    } else if (!active && isActive) {
      cleanupSubscriptions();
    }
  };

  // Force recalibration
  const recalibrate = (): void => {
    isCalibrated.current = false;
    baselineReadingsRef.current = [];
    recentMovementsRef.current = [];
  };

  // Function to reset sensor data
  const resetSensorData = (): void => {
    setMotionData({
      rotation: { alpha: 0, beta: 0, gamma: 0 },
      acceleration: { x: 0, y: 0, z: 0 },
      gravity: { x: 0, y: 0, z: 0 },
    });
    setQuaternion(new THREE.Quaternion());
    setDeviceStability(1.0);
    recalibrate();
  };

  return {
    isAvailable,
    isActive,
    hasError,
    errorMessage,
    motionData,
    quaternion,
    deviceStability,
    isCalibrated: isCalibrated.current,
    getDeviceOrientation,
    getTransformationMatrix,
    getMovementQuality,
    setSensorsActive,
    resetSensorData,
    recalibrate,
  };
}
