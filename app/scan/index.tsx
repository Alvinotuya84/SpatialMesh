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
  ViroTrackingState,
  ViroTrackingReason,
  ViroTrackingStateConstants,
  ViroARTrackingReasonConstants,
} from "@reactvision/react-viro";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { DeviceMotion } from "expo-sensors";
import { v4 as uuidv4 } from "uuid";
import { useScanStore, ScanningStage, ScanFrame } from "../../stores/scanStore";
import { THREE } from "expo-three";

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
    trackingState: ViroTrackingState;
    trackingStateReason: ViroTrackingReason;
  }>({
    isTracking: false,
    trackingState: ViroTrackingStateConstants.TRACKING_UNAVAILABLE,
    trackingStateReason: ViroARTrackingReasonConstants.TRACKING_REASON_NONE,
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

  const buttonScale = useSharedValue(1);
  const headerHeight = useSharedValue(120);
  const footerHeight = useSharedValue(100);
  const infoOpacity = useSharedValue(1);

  useEffect(() => {
    DeviceMotion.setUpdateInterval(100);
    const subscription = DeviceMotion.addListener((data) => {
      if (data) {
        const { rotation } = data;
        cameraRef.current.rotation.set(
          rotation.alpha,
          rotation.beta,
          rotation.gamma
        );
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (captureTimeoutRef.current) {
        clearTimeout(captureTimeoutRef.current);
      }
      resetScan();
    };
  }, [resetScan]);

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

  useEffect(() => {
    if (captureActive && stage === "scanning") {
      const captureFrame = () => {
        if (cameraRef.current && deviceTracking.isTracking) {
          const newFrame: ScanFrame = {
            id: uuidv4(),
            timestamp: Date.now(),
            points: [],
            cameraPosition: cameraRef.current.position.clone(),
            cameraRotation: cameraRef.current.rotation.clone(),
          };

          addFrame(newFrame);

          captureTimeoutRef.current = setTimeout(captureFrame, captureInterval);
        }
      };

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

  const toggleScanning = () => {
    if (stage === "ready" || stage === "paused") {
      setStage("scanning");
      setCaptureActive(true);
    } else if (stage === "scanning") {
      setStage("paused");
      setCaptureActive(false);
    }
  };

  const completeScanning = () => {
    setCaptureActive(false);
    setStage("processing");

    router.push("/scan/preview");
  };

  const cancelScanning = () => {
    resetScan();
    router.back();
  };

  const onTrackingUpdated = (
    state: ViroTrackingState,
    reason: ViroTrackingReason
  ) => {
    setDeviceTracking({
      isTracking: state === ViroTrackingStateConstants.TRACKING_NORMAL,
      trackingState: state,
      trackingStateReason: reason,
    });

    if (
      state === ViroTrackingStateConstants.TRACKING_NORMAL &&
      stage === "initializing"
    ) {
      setStage("ready");
    } else if (
      state !== ViroTrackingStateConstants.TRACKING_NORMAL &&
      stage === "scanning"
    ) {
      setStage("paused");
      setCaptureActive(false);
    }
  };

  const handlePressIn = () => {
    buttonScale.value = withSpring(0.95);
  };

  const handlePressOut = () => {
    buttonScale.value = withSpring(1);
  };

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

  const ARSceneComponent = () => {
    return (
      <ViroARScene
        onTrackingUpdated={onTrackingUpdated}
        onCameraTransformUpdate={(cameraTransform) => {
          cameraRef.current = {
            position: new THREE.Vector3(
              cameraTransform.position[0],
              cameraTransform.position[1],
              cameraTransform.position[2]
            ),
            rotation: new THREE.Quaternion(
              cameraTransform.rotation[0],
              cameraTransform.rotation[1],
              cameraTransform.rotation[2]
              // cameraTransform.rotation[3]
            ),
          };
        }}
      >
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
      <ViroARSceneNavigator
        initialScene={{
          scene: ARSceneComponent,
        }}
        style={styles.arView}
        ref={sceneRef}
      />
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
      <Animated.View style={[styles.footer, footerAnimatedStyle]}>
        <SafeAreaView style={styles.footerContent}>
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
