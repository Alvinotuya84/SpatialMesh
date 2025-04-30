import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  BackHandler,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Camera } from "expo-camera";
import {
  ViroARScene,
  ViroNode,
  ViroText,
  ViroTrackingStateConstants,
  ViroARTrackingReasonConstants,
} from "@reactvision/react-viro";
import { THREE } from "expo-three";
import { useRouter } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import { useScanStore } from "../../stores/scanStore";
import { useScanning } from "../../hooks/useScanning";
import { useSensors } from "../../hooks/useSensors";
import { useARTracking } from "../../hooks/useARTracking";
import Button from "../ui/Button";
import GuidanceOverlay from "./GuidanceOverlay";
import ProcessingOverlay from "./ProcessingOverlay";
import ProgressIndicator from "../ui/ProgressIndicator";
import ARScanView from "./ArScanView";
import { ARScene } from "../../utils/ar/sceneManager";
import {
  logScanDebugInfo,
  exportScanDebugData,
} from "../../utils/debugging/scanDebugger";

interface ScanningInterfaceProps {
  onScanComplete?: (meshId: string) => void;
  onBack?: () => void;
}

const ScanningInterface: React.FC<ScanningInterfaceProps> = ({
  onScanComplete,
  onBack,
}) => {
  const router = useRouter();

  const {
    stage,
    frames,
    processingStatus,
    setStage,
    resetScan,
    updateDeviceStatus,
  } = useScanStore();

  const {
    hasPermission,
    isARReady,
    cameraRef,
    initializeAR,
    startScanning,
    pauseScanning,
    stopScanning,
    completeScan,
    resetScanSession,
  } = useScanning({
    onScanComplete: (meshId) => {
      onScanComplete?.(meshId);

      // Log debug info after scan completion
      logScanDebugInfo();
    },
    onError: (error) => {
      Alert.alert("Error", error);
    },
  });

  const { deviceStability, getMovementQuality } = useSensors({
    useDeviceMotion: true,
    updateInterval: 100,
  });

  const {
    isARSupported,
    trackingStatus,
    updateTrackingStatus,
    getTrackingTips,
  } = useARTracking();

  const [showGuidance, setShowGuidance] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showDebugInfo, setShowDebugInfo] = useState(__DEV__);

  const cameraTransformRef = useRef<{
    position: THREE.Vector3;
    rotation: THREE.Quaternion;
  }>({
    position: new THREE.Vector3(),
    rotation: new THREE.Quaternion(),
  });

  // UI animations
  const headerHeight = useSharedValue(120);
  const footerHeight = useSharedValue(100);
  const guidanceOpacity = useSharedValue(1);

  // Android back button handler
  useEffect(() => {
    const handleBackPress = () => {
      handleBackButton();
      return true;
    };

    BackHandler.addEventListener("hardwareBackPress", handleBackPress);

    return () => {
      BackHandler.removeEventListener("hardwareBackPress", handleBackPress);
    };
  }, [stage]);

  // Update device status in store when stability or tracking changes
  useEffect(() => {
    updateDeviceStatus(deviceStability, {
      isTracking: trackingStatus.isTracking,
      reason: getTrackingReasonString(trackingStatus.reason),
    });
  }, [deviceStability, trackingStatus]);

  // UI animations based on scanning state
  useEffect(() => {
    if (stage === "scanning") {
      headerHeight.value = withTiming(80, { duration: 300 });
      footerHeight.value = withTiming(80, { duration: 300 });
      guidanceOpacity.value = withTiming(showGuidance ? 1 : 0, {
        duration: 200,
      });
    } else {
      headerHeight.value = withTiming(120, { duration: 300 });
      footerHeight.value = withTiming(100, { duration: 300 });
      guidanceOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [stage, showGuidance]);

  // Helper to convert tracking reason codes to readable strings
  const getTrackingReasonString = (reason: number): string => {
    switch (reason) {
      case ViroARTrackingReasonConstants.TRACKING_REASON_EXCESSIVE_MOTION:
        return "EXCESSIVE_MOTION";
      case ViroARTrackingReasonConstants.TRACKING_REASON_INSUFFICIENT_FEATURES:
        return "INSUFFICIENT_FEATURES";
      case ViroARTrackingReasonConstants.TRACKING_REASON_NONE:
      default:
        return "NONE";
    }
  };

  const handleBackButton = () => {
    if (stage === "scanning" || stage === "paused") {
      Alert.alert(
        "Cancel Scan",
        "Are you sure you want to cancel this scan? All captured data will be lost.",
        [
          { text: "Continue Scanning", style: "cancel" },
          {
            text: "Cancel Scan",
            style: "destructive",
            onPress: () => {
              setIsCancelling(true);
              resetScan();
              resetScanSession();
              onBack ? onBack() : router.back();
            },
          },
        ]
      );
    } else if (stage === "processing") {
      Alert.alert(
        "Cancel Processing",
        "Are you sure you want to cancel processing? Your scan data will be lost.",
        [
          { text: "Continue Processing", style: "cancel" },
          {
            text: "Cancel",
            style: "destructive",
            onPress: () => {
              setIsCancelling(true);
              resetScan();
              resetScanSession();
              onBack ? onBack() : router.back();
            },
          },
        ]
      );
    } else {
      resetScan();
      resetScanSession();
      onBack ? onBack() : router.back();
    }
  };

  const handleToggleScanning = () => {
    if (stage === "ready" || stage === "paused") {
      startScanning();
    } else if (stage === "scanning") {
      pauseScanning();
    }
  };

  const handleCompleteScanning = () => {
    if (frames.length < 10) {
      Alert.alert(
        "Not Enough Data",
        "You need to capture more frames for a good quality scan. Continue scanning?",
        [
          { text: "Continue Scanning", style: "cancel" },
          {
            text: "Complete Anyway",
            onPress: () => {
              completeScan();
            },
          },
        ]
      );
    } else {
      completeScan();
    }
  };

  const toggleGuidance = () => {
    setShowGuidance(!showGuidance);
  };

  const toggleDebugInfo = () => {
    setShowDebugInfo(!showDebugInfo);
  };

  const exportDebugData = async () => {
    const fileUri = await exportScanDebugData();
    if (fileUri) {
      Alert.alert("Debug Data Exported", `Data saved to: ${fileUri}`);
    } else {
      Alert.alert("Export Failed", "Could not export debug data");
    }
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

  // Initialize AR when tracking is available
  const handleARInitialized = (state: number, reason: number) => {
    updateTrackingStatus(state, reason);

    if (state === ViroTrackingStateConstants.TRACKING_NORMAL) {
      if (stage === "initializing") {
        setStage("ready");
      }
    }
  };

  // Update camera transform
  const handleCameraTransformUpdate = (cameraTransform: any) => {
    if (
      cameraTransform &&
      cameraTransform.position &&
      cameraTransform.rotation
    ) {
      cameraTransformRef.current = {
        position: new THREE.Vector3(
          cameraTransform.position[0],
          cameraTransform.position[1],
          cameraTransform.position[2]
        ),
        rotation: new THREE.Quaternion(
          cameraTransform.rotation[0],
          cameraTransform.rotation[1],
          cameraTransform.rotation[2],
          // Quaternion w component may not be provided by Viro
          cameraTransform.rotation[3] || 0
        ),
      };

      // Update the camera reference with current transform
      if (cameraRef && cameraRef.current) {
        // Use a safe copying mechanism instead of direct assignment
        Object.assign(cameraRef.current, {
          position: cameraTransformRef.current.position.clone(),
          rotation: cameraTransformRef.current.rotation.clone(),
        });
      }
    }
  };

  // AR Scene component
  const ARSceneComponent = () => (
    <ViroARScene
      onTrackingUpdated={handleARInitialized}
      onCameraTransformUpdate={handleCameraTransformUpdate}
    >
      {/* Debug info display */}
      {showDebugInfo && (
        <ViroNode position={[0, -0.5, -2]}>
          <ViroText
            text={`Frames: ${frames.length} | Tracking: ${
              trackingStatus.isTracking ? "OK" : "Limited"
            }`}
            scale={[0.5, 0.5, 0.5]}
            position={[0, 0, 0]}
            style={{ color: "white", fontFamily: "Arial", fontSize: 12 }}
          />
          <ViroText
            text={`State: ${trackingStatus.state} | Reason: ${trackingStatus.reason}`}
            scale={[0.5, 0.5, 0.5]}
            position={[0, -0.1, 0]}
            style={{ color: "white", fontFamily: "Arial", fontSize: 12 }}
          />
          <ViroText
            text={`Stability: ${deviceStability.toFixed(2)} | Stage: ${stage}`}
            scale={[0.5, 0.5, 0.5]}
            position={[0, -0.2, 0]}
            style={{ color: "white", fontFamily: "Arial", fontSize: 12 }}
          />
        </ViroNode>
      )}
    </ViroARScene>
  );

  if (!hasPermission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>
          Camera permission is required for AR scanning
        </Text>
        <Button
          title="Request Permission"
          onPress={async () => {
            const { status } = await Camera.requestCameraPermissionsAsync();
            if (status !== "granted") {
              Alert.alert(
                "Permission Required",
                "Camera access is needed for AR. Please enable camera access in your device settings."
              );
            }
          }}
          style={styles.permissionButton}
        />
      </View>
    );
  }

  if (!isARSupported) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>
          AR is not supported on this device
        </Text>
        <Button
          title="Go Back"
          onPress={() => (onBack ? onBack() : router.back())}
          style={styles.permissionButton}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* AR Scan View with integrated GL and ARScene */}
      <ARScanView
        onARSceneCreated={(scene: ARScene) => {
          initializeAR(scene, null);
        }}
        onTrackingUpdated={handleARInitialized}
        onPointCloudUpdated={(points) => {}}
        renderARContent={ARSceneComponent}
      />

      {/* Header */}
      <Animated.View style={[styles.header, headerAnimatedStyle]}>
        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBackButton}
            disabled={isCancelling}
          >
            <Text style={styles.backButtonText}>Cancel</Text>
          </TouchableOpacity>

          <View style={styles.statusContainer}>
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
          </View>

          <TouchableOpacity
            style={styles.guidanceButton}
            onPress={toggleGuidance}
          >
            <Text style={styles.guidanceButtonText}>
              {showGuidance ? "Hide Tips" : "Show Tips"}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Guidance overlay */}
      <GuidanceOverlay
        scanningStage={stage}
        trackingStatus={trackingStatus}
        framesCount={frames.length}
        deviceStability={deviceStability}
        showGuidance={showGuidance && stage !== "processing"}
      />

      {/* Processing overlay */}
      <ProcessingOverlay
        status={processingStatus}
        visible={stage === "processing"}
        onCancel={handleBackButton}
      />

      {/* Footer with controls */}
      <Animated.View style={[styles.footer, footerAnimatedStyle]}>
        <View style={styles.footerContent}>
          <View style={styles.progressContainer}>
            <ProgressIndicator
              progress={Math.min(100, (frames.length / 50) * 100)}
              label="Scan Progress"
              height={6}
            />
            <Text style={styles.progressText}>
              {frames.length} frames captured
            </Text>
          </View>

          <View style={styles.controlsContainer}>
            <Button
              title={
                stage === "ready"
                  ? "Start Scanning"
                  : stage === "scanning"
                  ? "Pause"
                  : "Resume"
              }
              onPress={handleToggleScanning}
              disabled={stage === "initializing" || stage === "processing"}
              variant={stage === "scanning" ? "warning" : "primary"}
              size="large"
              style={styles.actionButton}
            />

            {frames.length > 10 &&
              (stage === "paused" || stage === "scanning") && (
                <Button
                  title="Complete"
                  onPress={handleCompleteScanning}
                  variant="success"
                  style={styles.completeButton}
                />
              )}

            {__DEV__ && (
              <TouchableOpacity
                style={styles.debugButton}
                onPress={toggleDebugInfo}
              >
                <Text style={styles.debugButtonText}>
                  {showDebugInfo ? "Hide Debug" : "Debug"}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Movement quality indicator */}
          {stage === "scanning" && (
            <View style={styles.qualityIndicator}>
              <Text style={styles.qualityText}>
                {getMovementQuality().recommendation}
              </Text>
            </View>
          )}

          {/* Debug controls */}
          {__DEV__ && showDebugInfo && stage !== "initializing" && (
            <View style={styles.debugControls}>
              <Button
                title="Log Debug Info"
                onPress={logScanDebugInfo}
                variant="secondary"
                size="small"
                style={styles.debugActionButton}
              />
              <Button
                title="Export Debug Data"
                onPress={exportDebugData}
                variant="secondary"
                size="small"
                style={styles.debugActionButton}
              />
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
};

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
    paddingTop: Platform.OS === "ios" ? 40 : 20,
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
  guidanceButton: {
    padding: 10,
  },
  guidanceButtonText: {
    color: "#4a80f5",
    fontSize: 14,
  },
  footer: {
    position: "absolute",
    bottom: 40,
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
    paddingBottom: Platform.OS === "ios" ? 30 : 20,
  },
  progressContainer: {
    marginBottom: 15,
  },
  progressText: {
    color: "#fff",
    fontSize: 12,
    marginTop: 5,
  },
  controlsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  actionButton: {
    minWidth: 150,
  },
  completeButton: {
    marginLeft: 10,
  },
  debugButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    marginLeft: 10,
  },
  debugButtonText: {
    color: "#ccc",
    fontSize: 12,
  },
  debugControls: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    marginTop: 10,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: 8,
    padding: 8,
  },
  debugActionButton: {
    marginHorizontal: 5,
  },
  qualityIndicator: {
    alignItems: "center",
    marginTop: 5,
  },
  qualityText: {
    color: "#bbb",
    fontSize: 12,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#121212",
    padding: 20,
  },
  permissionText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  permissionButton: {
    width: 200,
  },
});

export default ScanningInterface;
