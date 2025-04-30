import React from "react";
import { StyleSheet, View, Text, ActivityIndicator } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";

import Button from "../ui/Button";
import ProgressIndicator from "../ui/ProgressIndicator";
import { ProcessingStatus } from "../../stores/scanStore";

interface ProcessingOverlayProps {
  status: ProcessingStatus;
  onCancel?: () => void;
  visible: boolean;
}

const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({
  status,
  onCancel,
  visible,
}) => {
  const fadeValue = useSharedValue(visible ? 1 : 0);
  const scaleValue = useSharedValue(1);
  const pulseValue = useSharedValue(1);

  React.useEffect(() => {
    fadeValue.value = withTiming(visible ? 1 : 0, {
      duration: 300,
      easing: Easing.inOut(Easing.ease),
    });

    if (visible) {
      scaleValue.value = withSequence(
        withTiming(1.05, { duration: 300 }),
        withTiming(1, { duration: 300 })
      );

      pulseValue.value = withRepeat(
        withSequence(
          withTiming(1.1, {
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
        ),
        -1, // Infinite repeat
        true // Reverse
      );
    }
  }, [visible]);

  const containerStyle = useAnimatedStyle(() => {
    return {
      opacity: fadeValue.value,
      transform: [{ scale: scaleValue.value }],
    };
  });

  const iconStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: pulseValue.value }],
    };
  });

  const getStageTitle = () => {
    switch (status.stage) {
      case "pointcloud":
        return "Processing Point Cloud";
      case "meshing":
        return "Generating 3D Mesh";
      case "texturing":
        return "Creating Texture Maps";
      case "optimizing":
        return "Optimizing Model";
      case "completed":
        return "Processing Complete";
      default:
        return "Processing Scan Data";
    }
  };

  const getStageDescription = () => {
    switch (status.stage) {
      case "pointcloud":
        return "Merging and filtering captured points...";
      case "meshing":
        return "Creating a 3D surface from point cloud...";
      case "texturing":
        return "Generating and applying textures...";
      case "optimizing":
        return "Optimizing mesh for better performance...";
      case "completed":
        return "Your 3D model is ready!";
      default:
        return "Please wait while we process your scan...";
    }
  };

  const renderStageIcon = () => {
    return (
      <Animated.View style={[styles.iconContainer, iconStyle]}>
        <ActivityIndicator size="large" color="#4a80f5" />
      </Animated.View>
    );
  };

  if (!visible) return null;

  return (
    <View style={styles.backdrop}>
      <Animated.View style={[styles.container, containerStyle]}>
        {renderStageIcon()}

        <Text style={styles.title}>{getStageTitle()}</Text>
        <Text style={styles.description}>{getStageDescription()}</Text>

        <View style={styles.progressContainer}>
          <ProgressIndicator
            progress={status.progress}
            showPercentage={true}
            height={8}
            style={styles.progressBar}
            labelStyle={styles.progressLabel}
          />
        </View>

        <Text style={styles.statusMessage}>{status.message}</Text>

        {onCancel && status.progress < 90 && (
          <Button
            title="Cancel"
            onPress={onCancel}
            variant="outline"
            style={styles.cancelButton}
          />
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 50,
  },
  container: {
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    padding: 24,
    width: "85%",
    maxWidth: 400,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  iconContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(74, 128, 245, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
    textAlign: "center",
  },
  description: {
    fontSize: 14,
    color: "#aaa",
    textAlign: "center",
    marginBottom: 24,
  },
  progressContainer: {
    width: "100%",
    marginBottom: 16,
  },
  progressBar: {
    marginBottom: 8,
  },
  progressLabel: {
    color: "#bbb",
  },
  statusMessage: {
    fontSize: 13,
    color: "#bbb",
    textAlign: "center",
    marginBottom: 20,
  },
  cancelButton: {
    marginTop: 10,
  },
});

export default ProcessingOverlay;
