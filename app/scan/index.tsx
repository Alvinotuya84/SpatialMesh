import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import {
  ViroARScene,
  ViroARSceneNavigator,
  ViroNode,
  ViroText,
} from "@reactvision/react-viro";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Accelerometer, DeviceMotion } from "expo-sensors";
import { v4 as uuidv4 } from "uuid";

import {
  useScanStore,
  ScanningStage,
  ScanFrame,
  ScanPoint,
} from "../../stores/scanStore";
import { THREE } from "expo-three";

// Main Scanning Screen Component
export default function ScanningScreen() {
  const router = useRouter();
  const {
    stage,
    setStage,
    addFrame,
    scanQuality,
    captureInterval,
    resetScan,
    frames,
  } = useScanStore();

  const [deviceTracking, setDeviceTracking] = useState<{
    isTracking: boolean;
    trackingState: string;
    trackingStateReason: string;
  }>({
    isTracking: false,
    trackingState: "UNKNOWN",
    trackingStateReason: "Not started",
  });

  const [captureActive, setCaptureActive] = useState(false);
  const captureTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<{
    position: THREE.Vector3;
    rotation: THREE.Quaternion;
  }>({
    position: new THREE.Vector3(),
    rotation: new THREE.Quaternion(),
  });

  // Animation values
  const buttonScale = useSharedValue(1);
  const headerHeight = useSharedValue(120);
  const footerHeight = useSharedValue(100);
  const infoOpacity = useSharedValue(1);

  // Subscribe to device motion for better tracking
  useEffect(() => {
    DeviceMotion.setUpdateInterval(100);
    const subscription = DeviceMotion.addListener((data) => {
      // This data can be used to improve point cloud generation
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (captureTimeoutRef.current) {
        clearTimeout(captureTimeoutRef.current);
      }
      resetScan();
    };
  }, [resetScan]);

  // UI animations based on scanning state
  useEffect(() => {
    if (stage === "scanning") {
      headerHeight.value = withTiming(80, { duration: 300 });
      footerHeight.value = withTiming(80, { duration: 300 });
      infoOpacity.value = withTiming(0, { duration: 200 });
    } else {
      headerHeight.value = withTiming(120, { duration: 300 });
      footerHeight.value = withTiming(100, { duration: 300 });
      infoOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [stage, headerHeight, footerHeight, infoOpacity]);

  // Register frame capture loop
  useEffect(() => {
    if (captureActive && stage === "scanning") {
      const captureFrame = () => {
        if (cameraRef.current && deviceTracking.isTracking) {
          // Create a new scan frame with current camera data
          const newFrame: ScanFrame = {
            id: uuidv4(),
            timestamp: Date.now(),
            points: [], // This would be populated by the AR system in a real implementation
            cameraPosition: cameraRef.current.position.clone(),
            cameraRotation: cameraRef.current.rotation.clone(),
          };

          addFrame(newFrame);

          // Schedule next capture
          captureTimeoutRef.current = setTimeout(captureFrame, captureInterval);
        }
      };

      // Start the capture loop
      captureFrame();
    }

    return () => {
      if (captureTimeoutRef.current) {
        clearTimeout(captureTimeoutRef.current);
        captureTimeoutRef.current = null;
      }
    };
  }, [
    captureActive,
    stage,
    addFrame,
    captureInterval,
    deviceTracking.isTracking,
  ]);

  // Toggle scanning state
  const toggleScanning = () => {
    if (stage === "ready" || stage === "paused") {
      setStage("scanning");
      setCaptureActive(true);
    } else if (stage === "scanning") {
      setStage("paused");
      setCaptureActive(false);
    }
  };

  // Complete scanning and move to processing
  const completeScanning = () => {
    setCaptureActive(false);
    setStage("processing");

    // Navigate to preview screen with captured data
    router.push("/scan/preview");
  };

  // Cancel scanning and go back to home
  const cancelScanning = () => {
    resetScan();
    router.back();
  };

  // Handle AR tracking updates
  const onTrackingUpdated = (state: string, reason: string) => {
    setDeviceTracking({
      isTracking: state === "TRACKING_NORMAL",
      trackingState: state,
      trackingStateReason: reason,
    });

    // Update app state based on tracking
    if (state === "TRACKING_NORMAL" && stage === "initializing") {
      setStage("ready");
    } else if (state !== "TRACKING_NORMAL" && stage === "scanning") {
      setStage("paused");
      setCaptureActive(false);
    }
  };

  // Handle button animations
  const handlePressIn = () => {
    buttonScale.value = withSpring(0.95);
  };

  const handlePressOut = () => {
    buttonScale.value = withSpring(1);
  };

  // Animated styles
  const headerAnimatedStyle = useAnimatedStyle(() => {
    return {
      height: headerHeight.value,
    };
  });

  const footerAnimatedStyle = useAnimatedStyle(() => {
    return {
      height: footerHeight.value,
    };
  });

  const infoAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: infoOpacity.value,
      display: infoOpacity.value === 0 ? "none" : "flex",
    };
  });

  const buttonAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: buttonScale.value }],
    };
  });

  // Create the AR Scene component
  const ARSceneComponent = () => {
    return (
      <ViroARScene
        onTrackingUpdated={(state, reason) => onTrackingUpdated(state, reason)}
        onCameraTransformUpdate={(position, rotation) => {
          // Update the camera reference with latest position and rotation
          cameraRef.current = {
            position: new THREE.Vector3(position[0], position[1], position[2]),
            rotation: new THREE.Quaternion(
              rotation[0],
              rotation[1],
              rotation[2],
              rotation[3]
            ),
          };
        }}
      >
        {/* Debug text showing tracking state */}
        <ViroNode position={[0, -1, -2]}>
          <ViroText
            text={`Frames: ${frames.length} | Tracking: ${
              deviceTracking.isTracking ? "OK" : "Lost"
            }`}
            scale={[0.5, 0.5, 0.5]}
            position={[0, 0, 0]}
            style={{ color: "white", fontFamily: "Arial", fontSize: 12 }}
          />
        </ViroNode>
      </ViroARScene>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* AR Scene Navigator */}
      <ViroARSceneNavigator
        initialScene={{
          scene: ARSceneComponent,
        }}
        style={styles.arView}
        ref={sceneRef}
      />

      {/* Header UI */}
      <Animated.View style={[styles.header, headerAnimatedStyle]}>
        <SafeAreaView style={styles.headerContent}>
          <TouchableOpacity style={styles.backButton} onPress={cancelScanning}>
            <Text style={styles.backButtonText}>Cancel</Text>
          </TouchableOpacity>

          <Animated.View style={[styles.statusContainer, infoAnimatedStyle]}>
            <Text style={styles.statusText}>
              {stage === "initializing"
                ? "Initializing AR..."
                : stage === "ready"
                ? "Ready to scan"
                : stage === "paused"
                ? "Scanning paused"
                : stage === "scanning"
                ? "Scanning active"
                : "Processing"}
            </Text>
          </Animated.View>
        </SafeAreaView>
      </Animated.View>

      {/* Guidance overlay */}
      <Animated.View style={[styles.guidanceOverlay, infoAnimatedStyle]}>
        {stage === "ready" && (
          <View style={styles.guidanceBox}>
            <Text style={styles.guidanceTitle}>Scanning Tips</Text>
            <Text style={styles.guidanceText}>
              • Move slowly around your space
            </Text>
            <Text style={styles.guidanceText}>
              • Keep the device at different heights
            </Text>
            <Text style={styles.guidanceText}>
              • Ensure good lighting conditions
            </Text>
          </View>
        )}

        {stage === "paused" && (
          <View style={styles.guidanceBox}>
            <Text style={styles.guidanceTitle}>Scanning Paused</Text>
            <Text style={styles.guidanceText}>
              • Tap "Resume" to continue scanning
            </Text>
            <Text style={styles.guidanceText}>
              • {frames.length} frames captured so far
            </Text>
          </View>
        )}
      </Animated.View>

      {/* Footer with controls */}
      <Animated.View style={[styles.footer, footerAnimatedStyle]}>
        <SafeAreaView style={styles.footerContent}>
          {/* Scan progress indicator */}
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, (frames.length / 50) * 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.progressText}>{frames.length} frames</Text>
          </View>

          {/* Action buttons */}
          <View style={styles.controlsContainer}>
            <Animated.View style={[buttonAnimatedStyle]}>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  stage === "scanning" ? styles.actionButtonActive : null,
                ]}
                onPress={toggleScanning}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                disabled={stage === "initializing" || stage === "processing"}
              >
                <Text style={styles.actionButtonText}>
                  {stage === "ready"
                    ? "Start Scanning"
                    : stage === "scanning"
                    ? "Pause"
                    : "Resume"}
                </Text>
              </TouchableOpacity>
            </Animated.View>

            {frames.length > 10 &&
              (stage === "paused" || stage === "scanning") && (
                <TouchableOpacity
                  style={styles.completeButton}
                  onPress={completeScanning}
                >
                  <Text style={styles.completeButtonText}>Complete</Text>
                </TouchableOpacity>
              )}
          </View>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  arView: {
    flex: 1,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 10,
  },
  headerContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  backButton: {
    padding: 10,
  },
  backButtonText: {
    color: "#fff",
    fontSize: 16,
  },
  statusContainer: {
    alignItems: "center",
  },
  statusText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  guidanceOverlay: {
    position: "absolute",
    top: "50%",
    left: 20,
    right: 20,
    transform: [{ translateY: -100 }],
    alignItems: "center",
    zIndex: 5,
  },
  guidanceBox: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 10,
    padding: 15,
    width: "100%",
  },
  guidanceTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  guidanceText: {
    color: "#fff",
    fontSize: 14,
    marginBottom: 5,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 10,
  },
  footerContent: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 15,
  },
  progressContainer: {
    marginBottom: 15,
  },
  progressBar: {
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 5,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#4a80f5",
    borderRadius: 3,
  },
  progressText: {
    color: "#fff",
    fontSize: 12,
  },
  controlsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 20,
  },
  actionButton: {
    backgroundColor: "#4a80f5",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
    marginHorizontal: 10,
  },
  actionButtonActive: {
    backgroundColor: "#f54a4a",
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  completeButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
  },
  completeButtonText: {
    color: "#fff",
    fontSize: 16,
  },
});
