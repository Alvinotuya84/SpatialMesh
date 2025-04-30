import React, { useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  ViewStyle,
  TextStyle,
  StyleProp,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";

interface ProgressIndicatorProps {
  progress: number;
  label?: string;
  showPercentage?: boolean;
  color?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  backgroundStyle?: StyleProp<ViewStyle>;
}

const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  progress,
  label,
  showPercentage = true,
  color = "#4a80f5",
  height = 6,
  style,
  labelStyle,
  backgroundStyle,
}) => {
  const widthPercentage = useSharedValue(0);

  useEffect(() => {
    const clampedProgress = Math.max(0, Math.min(100, progress));
    widthPercentage.value = withTiming(clampedProgress, {
      duration: 300,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [progress]);

  const progressStyle = useAnimatedStyle(() => {
    return {
      width: `${widthPercentage.value}%`,
    };
  });

  return (
    <View style={[styles.container, style]}>
      {(label || showPercentage) && (
        <View style={styles.labelContainer}>
          {label && <Text style={[styles.label, labelStyle]}>{label}</Text>}
          {showPercentage && (
            <Text style={[styles.percentage, labelStyle]}>
              {Math.round(progress)}%
            </Text>
          )}
        </View>
      )}
      <View style={[styles.progressBackground, { height }, backgroundStyle]}>
        <Animated.View
          style={[
            styles.progressFill,
            { backgroundColor: color, height },
            progressStyle,
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  labelContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  label: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
  },
  percentage: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
  },
  progressBackground: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    borderRadius: 3,
  },
});

export default ProgressIndicator;
