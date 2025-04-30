import React, { useEffect } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleProp,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?:
    | "primary"
    | "secondary"
    | "danger"
    | "success"
    | "warning"
    | "outline";
  size?: "small" | "medium" | "large";
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = "primary",
  size = "medium",
  loading = false,
  disabled = false,
  fullWidth = false,
  icon,
  style,
  textStyle,
}) => {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(disabled ? 0.6 : 1);

  useEffect(() => {
    opacity.value = withTiming(disabled ? 0.6 : 1, {
      duration: 150,
      easing: Easing.ease,
    });
  }, [disabled]);

  const handlePressIn = () => {
    if (!disabled && !loading) {
      scale.value = withSpring(0.96, {
        damping: 10,
        stiffness: 300,
      });
    }
  };

  const handlePressOut = () => {
    if (!disabled && !loading) {
      scale.value = withSpring(1, {
        damping: 10,
        stiffness: 300,
      });
    }
  };

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    };
  });

  const getVariantStyle = (): ViewStyle => {
    switch (variant) {
      case "secondary":
        return styles.secondaryButton;
      case "danger":
        return styles.dangerButton;
      case "success":
        return styles.successButton;
      case "warning":
        return styles.warningButton;
      case "outline":
        return styles.outlineButton;
      case "primary":
      default:
        return styles.primaryButton;
    }
  };

  const getSizeStyle = (): ViewStyle => {
    switch (size) {
      case "small":
        return styles.smallButton;
      case "large":
        return styles.largeButton;
      case "medium":
      default:
        return styles.mediumButton;
    }
  };

  const getTextStyle = (): TextStyle => {
    switch (size) {
      case "small":
        return styles.smallText;
      case "large":
        return styles.largeText;
      case "medium":
      default:
        return styles.mediumText;
    }
  };

  const getTextColorStyle = (): TextStyle => {
    if (variant === "outline") {
      return styles.outlineText;
    }
    return styles.buttonText;
  };

  return (
    <Animated.View style={[animatedStyle, fullWidth && styles.fullWidth]}>
      <TouchableOpacity
        style={[
          styles.button,
          getVariantStyle(),
          getSizeStyle(),
          fullWidth && styles.fullWidth,
          style,
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator
            color={variant === "outline" ? "#4a80f5" : "#ffffff"}
            size={size === "small" ? "small" : "small"}
          />
        ) : (
          <>
            {icon && icon}
            <Text
              style={[
                getTextColorStyle(),
                getTextStyle(),
                icon && styles.textWithIcon,
                textStyle,
              ]}
            >
              {title}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  fullWidth: {
    width: "100%",
  },
  primaryButton: {
    backgroundColor: "#4a80f5",
  },
  secondaryButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  dangerButton: {
    backgroundColor: "#ff3b30",
  },
  successButton: {
    backgroundColor: "#34c759",
  },
  warningButton: {
    backgroundColor: "#ffcc00",
  },
  outlineButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#4a80f5",
  },
  smallButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  mediumButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  largeButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "600",
    textAlign: "center",
  },
  outlineText: {
    color: "#4a80f5",
    fontWeight: "600",
    textAlign: "center",
  },
  smallText: {
    fontSize: 12,
  },
  mediumText: {
    fontSize: 16,
  },
  largeText: {
    fontSize: 18,
  },
  textWithIcon: {
    marginLeft: 8,
  },
});

export default Button;
