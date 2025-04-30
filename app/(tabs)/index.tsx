import { StyleSheet, View, Text, TouchableOpacity, Image } from "react-native";
import { Link, useRouter } from "expo-router";
import { useState, useEffect } from "react";
import { isARSupportedOnDevice } from "@reactvision/react-viro";
import { StatusBar } from "expo-status-bar";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

export default function HomeScreen() {
  const router = useRouter();
  const [isARSupported, setIsARSupported] = useState<boolean | null>(null);
  const buttonScale = useSharedValue(1);

  useEffect(() => {
    const checkARSupport = async () => {
      try {
        const supported = await isARSupportedOnDevice();
        setIsARSupported(supported.isARSupported);
      } catch (error) {
        console.error("Error checking AR support:", error);
        setIsARSupported(false);
      }
    };

    checkARSupport();
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: buttonScale.value }],
    };
  });

  const handlePressIn = () => {
    buttonScale.value = withSpring(0.95);
  };

  const handlePressOut = () => {
    buttonScale.value = withSpring(1);
  };

  const startScanning = () => {
    router.push("/scan");
  };

  const viewSavedModels = () => {
    router.push("/models");
  };

  if (isARSupported === false) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <Text style={styles.title}>AR Not Supported</Text>
        <Text style={styles.subtitle}>
          Your device does not support the AR features required for this
          application.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>3D Space Scanner</Text>
        <Text style={styles.subtitle}>
          Transform your environment into interactive 3D models
        </Text>
      </View>

      <View style={styles.buttonsContainer}>
        <Animated.View style={[animatedStyle]}>
          <TouchableOpacity
            style={styles.scanButton}
            onPress={startScanning}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            activeOpacity={0.8}
          >
            <Text style={styles.scanButtonText}>Start Scanning</Text>
          </TouchableOpacity>
        </Animated.View>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={viewSavedModels}
        >
          <Text style={styles.secondaryButtonText}>View Saved Models</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.infoTitle}>How it works:</Text>
        <View style={styles.infoItem}>
          <Text style={styles.infoNumber}>1</Text>
          <Text style={styles.infoText}>
            Scan your environment by moving your device around
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoNumber}>2</Text>
          <Text style={styles.infoText}>
            Our app processes the scan to create a 3D mesh
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoNumber}>3</Text>
          <Text style={styles.infoText}>
            Edit, save, and export your 3D model
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    padding: 20,
  },
  header: {
    marginTop: 40,
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: "#b0b0b0",
    marginBottom: 20,
  },
  buttonsContainer: {
    marginBottom: 40,
  },
  scanButton: {
    backgroundColor: "#4a80f5",
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 15,
    shadowColor: "#4a80f5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  scanButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "bold",
  },
  secondaryButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
  },
  infoContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 10,
    padding: 20,
  },
  infoTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  infoNumber: {
    backgroundColor: "#4a80f5",
    color: "#ffffff",
    width: 26,
    height: 26,
    borderRadius: 13,
    textAlign: "center",
    lineHeight: 26,
    marginRight: 15,
    fontWeight: "bold",
  },
  infoText: {
    color: "#e0e0e0",
    fontSize: 14,
    flex: 1,
  },
});
