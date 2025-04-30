import { useState, useEffect, useRef } from "react";
import { Accelerometer, Gyroscope } from "expo-sensors";
import {
  DeviceMotionSensor,
  DeviceMotionMeasurement,
  DeviceMotionOrientation,
} from "expo-sensors/build/DeviceMotion";
import { THREE } from "expo-three";

// Create a DeviceMotion instance
const DeviceMotion = new DeviceMotionSensor(null, "deviceMotionDidUpdate");

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

  // Using ref to store subscriptions so they can be accessed in setSensorsActive
  const subscriptions = useRef({
    deviceMotion: null as { remove: () => void } | null,
    accelerometer: null as { remove: () => void } | null,
    gyroscope: null as { remove: () => void } | null,
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
          // If DeviceMotion isn't available but was requested, try fallback sensors
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
      // Cleanup subscriptions on unmount
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
    timestamp: number;
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
    // This would be more complex in a real implementation
    // For now, just a simple integration of gyroscope data
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
    // Calculate movement magnitude
    const movementMagnitude = Math.sqrt(
      acceleration.x * acceleration.x +
        acceleration.y * acceleration.y +
        acceleration.z * acceleration.z
    );

    // Gravity is approximately 9.8 m/s²
    // Subtract it to get the device movement
    const movement = Math.abs(movementMagnitude - 9.8);

    // Map stability from 0-5 to 0-1 (inverse, more movement = less stable)
    const stability = Math.max(0, Math.min(1, 1 - movement / 5));

    setDeviceStability(stability);
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
    if (deviceStability > 0.9) {
      return {
        stability: deviceStability,
        recommendation: "Excellent stability. Perfect for scanning.",
      };
    } else if (deviceStability > 0.7) {
      return {
        stability: deviceStability,
        recommendation: "Good stability. Continue scanning.",
      };
    } else if (deviceStability > 0.4) {
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

  // Function to reset sensor data
  const resetSensorData = (): void => {
    setMotionData({
      rotation: { alpha: 0, beta: 0, gamma: 0 },
      acceleration: { x: 0, y: 0, z: 0 },
      gravity: { x: 0, y: 0, z: 0 },
    });
    setQuaternion(new THREE.Quaternion());
    setDeviceStability(1.0);
  };

  return {
    isAvailable,
    isActive,
    hasError,
    errorMessage,
    motionData,
    quaternion,
    deviceStability,
    getDeviceOrientation,
    getTransformationMatrix,
    getMovementQuality,
    setSensorsActive,
    resetSensorData,
  };
}
