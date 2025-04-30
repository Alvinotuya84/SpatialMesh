import React from "react";
import {
  StyleSheet,
  View,
  Text,
  ViewStyle,
  TextStyle,
  StyleProp,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
  Easing,
  useSharedValue,
  withSequence,
  withDelay,
} from "react-native-reanimated";

interface InstructionCardProps {
  title: string;
  instructions: string[];
  highlightIndex?: number;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const InstructionCard: React.FC<InstructionCardProps> = ({
  title,
  instructions,
  highlightIndex = -1,
  icon,
  style,
}) => {
  // For highlight animation
  const animatedHighlightValues = instructions.map(() => useSharedValue(0));

  React.useEffect(() => {
    if (highlightIndex >= 0 && highlightIndex < instructions.length) {
      // Reset all
      animatedHighlightValues.forEach((val, index) => {
        if (index !== highlightIndex) {
          val.value = withTiming(0, { duration: 200 });
        }
      });

      // Animate the highlighted one
      animatedHighlightValues[highlightIndex].value = withSequence(
        withTiming(1, { duration: 300 }), // Fixed O300 -> 300
        withDelay(2000, withTiming(0.5, { duration: 300 }))
      );
    }
  }, [highlightIndex]);

  const getAnimatedStyle = (index: number) =>
    useAnimatedStyle(() => {
      return {
        backgroundColor: `rgba(74, 128, 245, ${
          animatedHighlightValues[index].value * 0.3
        })`,
        transform: [{ scale: 1 + animatedHighlightValues[index].value * 0.02 }],
      };
    });

  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        {icon && <View style={styles.iconContainer}>{icon}</View>}
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.instructionsContainer}>
        {instructions.map((instruction, index) => (
          <Animated.View
            key={index}
            style={[
              styles.instructionItem,
              getAnimatedStyle(index),
              highlightIndex === index && styles.highlightedInstruction,
            ]}
          >
            <View style={styles.bulletPoint}>
              <Text style={styles.bulletText}>{index + 1}</Text>
            </View>
            <Text
              style={[
                styles.instructionText,
                highlightIndex === index && styles.highlightedText,
              ]}
            >
              {instruction}
            </Text>
          </Animated.View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  iconContainer: {
    marginRight: 10,
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  instructionsContainer: {
    marginLeft: 4,
  },
  instructionItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 6,
    marginVertical: 4,
  },
  highlightedInstruction: {
    backgroundColor: "rgba(74, 128, 245, 0.15)",
  },
  bulletPoint: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#4a80f5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 2,
  },
  bulletText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  instructionText: {
    color: "#ccc",
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  highlightedText: {
    color: "#fff",
    fontWeight: "500",
  },
});

export default InstructionCard;
