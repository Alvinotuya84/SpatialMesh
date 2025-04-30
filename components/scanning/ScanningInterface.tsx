import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  BackHandler,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Camera } from "expo-camera";
import {
  ViroARScene,
  ViroARSceneNavigator,
  ViroNode,
  ViroText,
  ViroARPlaneSelector,
  ViroBox,
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

interface ScanningInterfaceProps {
  onScanComplete?: (meshId: string) => void;
  onBack?: () => void;
}

const ScanningInterface: React.FC<ScanningInterfaceProps> = ({
  onScanComplete,
  onBack,
}) => {
  const router = useRouter();

  const { stage, frames, processingStatus, setStage, resetScan } =
    useScanStore();

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

  const arSceneNavigatorRef = useRef(null);

  // UI animations
  const headerHeight = useSharedValue(120);
  const footerHeight = useSharedValue(100);
  const guidanceOpacity = useSharedValue(1);

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

  // AR Scene component
  const ARSceneComponent = () => (
    <ViroARScene
      onTrackingUpdated={(state, reason) => {
        updateTrackingStatus(state, reason);
      }}
    >
      {/* Debug info - this would be hidden in production */}
      <ViroNode position={[0, -1, -2]}>
        <ViroText
          text={`Frames: ${frames.length} | Tracking: ${
            trackingStatus.isTracking ? "OK" : "Limited"
          }`}
          scale={[0.5, 0.5, 0.5]}
          position={[0, 0, 0]}
          style={{ color: "white", fontFamily: "Arial", fontSize: 12 }}
        />
      </ViroNode>

      {/* Visualization of detected planes */}
      <ViroARPlaneSelector>
        <ViroBox
          position={[0, 0, 0]}
          scale={[0.1, 0.1, 0.1]}
          materials={["grid"]}
        />
      </ViroARPlaneSelector>
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

      {/* AR Scene Navigator */}
      <ViroARSceneNavigator
        initialScene={{
          scene: ARSceneComponent,
        }}
        style={styles.arView}
        ref={arSceneNavigatorRef}
        autofocus={true}
        onInitialized={(state, reason) => {
          if (state === "INITIALIZED") {
            initializeAR(null, arSceneNavigatorRef.current);
          }
        }}
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
          {/* Scan progress indicator */}
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

          {/* Action buttons */}
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
          </View>

          {/* Movement quality indicator */}
          {stage === "scanning" && (
            <View style={styles.qualityIndicator}>
              <Text style={styles.qualityText}>
                {getMovementQuality().recommendation}
              </Text>
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
    paddingTop: 40,
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
    paddingBottom: 30,
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
    marginBottom: 10,
  },
  actionButton: {
    minWidth: 150,
  },
  completeButton: {
    marginLeft: 10,
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
