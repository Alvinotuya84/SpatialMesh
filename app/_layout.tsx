import "react-native-get-random-values";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { isARSupportedOnDevice } from "@reactvision/react-viro";

export default function RootLayout() {
  useEffect(() => {
    checkARSupport();
  }, []);

  const checkARSupport = async () => {
    try {
      const isSupported = await isARSupportedOnDevice();
      if (!isSupported) {
        console.log("AR is  supported on this device");
      }
    } catch (error) {
      console.error("Error checking AR support:", error);
    }
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: "#1a1a1a",
          },
          headerTintColor: "#fff",
          headerTitleStyle: {
            fontWeight: "bold",
          },
          contentStyle: {
            backgroundColor: "#121212",
          },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: "3D Space Scanner",
          }}
        />
        <Stack.Screen
          name="scan/index"
          options={{
            title: "Scan Environment",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="scan/preview"
          options={{
            title: "Mesh Preview",
          }}
        />
        <Stack.Screen
          name="scan/export"
          options={{
            title: "Export Model",
          }}
        />
        <Stack.Screen
          name="models/index"
          options={{
            title: "Saved Models",
          }}
        />
        <Stack.Screen
          name="models/[id]"
          options={{
            title: "Model Details",
          }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
