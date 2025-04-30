import React, { useEffect, useState } from "react";
import { StyleSheet, View, Text, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  Easing,
} from "react-native-reanimated";

import InstructionCard from "../ui/InstructionCard";
import { ScanningStage } from "../../stores/scanStore";
import { TrackingStatus } from "../../hooks/useARTracking";

interface GuidanceOverlayProps {
  scanningStage: ScanningStage;
  trackingStatus: TrackingStatus;
  framesCount: number;
  deviceStability: number;
  showGuidance: boolean;
}

const GuidanceOverlay: React.FC<GuidanceOverlayProps> = ({
  scanningStage,
  trackingStatus,
  framesCount,
  deviceStability,
  showGuidance,
}) => {
  const fadeValue = useSharedValue(showGuidance ? 1 : 0);
  const scaleValue = useSharedValue(1);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    fadeValue.value = withTiming(showGuidance ? 1 : 0, {
      duration: 300,
      easing: Easing.inOut(Easing.ease),
    });
  }, [showGuidance]);

  useEffect(() => {
    if (showGuidance) {
      scaleValue.value = withSequence(
        withTiming(1.05, { duration: 300 }),
        withTiming(1, { duration: 300 })
      );
    }
  }, [scanningStage, currentStep]);

  useEffect(() => {
    // Update current guidance step based on scanning stage and conditions
    if (scanningStage === "initializing") {
      setCurrentStep(0);
    } else if (scanningStage === "ready") {
      setCurrentStep(1);
    } else if (scanningStage === "scanning") {
      if (framesCount < 10) {
        setCurrentStep(2);
      } else if (framesCount < 30) {
        setCurrentStep(3);
      } else {
        setCurrentStep(4);
      }
    } else if (scanningStage === "paused") {
      setCurrentStep(5);
    }

    // Handle specific tracking issues
    if (trackingStatus.state === "TRACKING_LIMITED") {
      if (trackingStatus.reason === "EXCESSIVE_MOTION") {
        setCurrentStep(6);
      } else if (trackingStatus.reason === "INSUFFICIENT_FEATURES") {
        setCurrentStep(7);
      } else if (trackingStatus.reason === "INSUFFICIENT_LIGHT") {
        setCurrentStep(8);
      }
    }
  }, [scanningStage, trackingStatus, framesCount]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: fadeValue.value,
      transform: [{ scale: scaleValue.value }],
    };
  });

  const getInstructions = () => {
    switch (currentStep) {
      case 0: // Initializing
        return {
          title: "Initializing AR",
          instructions: [
            "Hold your device steady",
            "Point at a well-lit area",
            "Avoid featureless surfaces like blank walls",
          ],
        };
      case 1: // Ready to scan
        return {
          title: "Ready to Start",
          instructions: [
            'Tap "Start Scanning" to begin',
            "Move slowly around your space",
            "Keep the device at different heights",
            "Ensure good lighting conditions",
          ],
        };
      case 2: // Initial scanning
        return {
          title: "Starting Scan",
          instructions: [
            "Move slowly in a circular pattern",
            "Keep the device steady",
            "Scan from multiple angles",
            `Captured ${framesCount} frames so far`,
          ],
        };
      case 3: // Mid scanning
        return {
          title: "Continue Scanning",
          instructions: [
            "Move to capture more of the environment",
            "Try different heights - low, mid, and high",
            "Maintain a consistent distance from surfaces",
            `Captured ${framesCount} frames so far`,
          ],
        };
      case 4: // Advanced scanning
        return {
          title: "Almost Complete",
          instructions: [
            "Capture any missed areas",
            'You can tap "Complete" when satisfied',
            "More frames will improve quality",
            `Captured ${framesCount} frames so far`,
          ],
        };
      case 5: // Paused
        return {
          title: "Scanning Paused",
          instructions: [
            'Tap "Resume" to continue scanning',
            `You've captured ${framesCount} frames so far`,
            'Tap "Complete" if you have enough data',
          ],
        };
      case 6: // Excessive motion
        return {
          title: "Too Much Movement",
          instructions: [
            "Hold the device more steady",
            "Move more slowly",
            "Use both hands to stabilize the device",
          ],
        };
      case 7: // Insufficient features
        return {
          title: "Not Enough Visual Features",
          instructions: [
            "Point at areas with more texture or objects",
            "Avoid plain walls and featureless surfaces",
            "Move to a more detailed part of the space",
          ],
        };
      case 8: // Insufficient light
        return {
          title: "Lighting Too Dark",
          instructions: [
            "Move to a better lit environment",
            "Turn on more lights if possible",
            "Avoid very bright direct light that causes glare",
          ],
        };
      default:
        return {
          title: "Scanning Tips",
          instructions: [
            "Move slowly around your space",
            "Maintain a consistent distance from objects",
            "Ensure good lighting conditions",
          ],
        };
    }
  };

  const { title, instructions } = getInstructions();

  // Show specific highlight index based on current step
  const getHighlightIndex = () => {
    if (currentStep === 0) return 0; // Initially highlight first item
    if (currentStep === 2 && deviceStability < 0.5) return 1; // Highlight stability if poor
    if (currentStep === 7) return 0; // Highlight first item for feature issues
    if (currentStep === 8) return 0; // Highlight first item for lighting issues
    return -1; // No highlight
  };

  const getStabilityMessage = () => {
    if (deviceStability > 0.8) {
      return { text: "Excellent stability", color: "#34c759" };
    } else if (deviceStability > 0.6) {
      return { text: "Good stability", color: "#5ac8fa" };
    } else if (deviceStability > 0.4) {
      return { text: "Moderate stability", color: "#ffcc00" };
    } else {
      return { text: "Poor stability - hold steady", color: "#ff3b30" };
    }
  };

  const { text: stabilityText, color: stabilityColor } = getStabilityMessage();

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <InstructionCard
        title={title}
        instructions={instructions}
        highlightIndex={getHighlightIndex()}
        style={styles.instructionCard}
      />

      {scanningStage === "scanning" && (
        <View style={styles.statusInfo}>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Frames</Text>
            <Text style={styles.statusValue}>{framesCount}</Text>
          </View>

          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Stability</Text>
            <Text style={[styles.statusValue, { color: stabilityColor }]}>
              {stabilityText}
            </Text>
          </View>

          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Tracking</Text>
            <Text
              style={[
                styles.statusValue,
                { color: trackingStatus.isTracking ? "#34c759" : "#ff3b30" },
              ]}
            >
              {trackingStatus.isTracking ? "Good" : "Limited"}
            </Text>
          </View>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 120,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 16,
    zIndex: 10,
  },
  instructionCard: {
    width: "100%",
    maxWidth: 450,
  },
  statusInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    width: "100%",
    maxWidth: 450,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  statusItem: {
    alignItems: "center",
    flex: 1,
  },
  statusLabel: {
    color: "#aaa",
    fontSize: 12,
    marginBottom: 4,
  },
  statusValue: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});

export default GuidanceOverlay;
