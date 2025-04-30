import React, { useState } from "react";
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import ScanningInterface from "../../components/scanning/ScanningInterface";
import ScanDebugView from "../../components/debugging/ScanDebugView";
import { logScanDebugInfo } from "../../utils/debugging/scanDebugger";

export default function ScanningScreen() {
  const router = useRouter();
  const [showDebugView, setShowDebugView] = useState(false);

  // Handle scan completion
  const handleScanComplete = (meshId: string) => {
    // Log debug info for completed scan
    logScanDebugInfo();

    // Navigate to preview
    router.push("/scan/preview");
  };

  // Handle debugging request
  const toggleDebugView = () => {
    setShowDebugView(!showDebugView);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Main scanning interface component */}
      <ScanningInterface
        onScanComplete={handleScanComplete}
        onBack={() => router.back()}
      />

      {/* Debug action */}
      {__DEV__ && (
        <TouchableOpacity style={styles.debugButton} onPress={toggleDebugView}>
          <Text style={styles.debugButtonText}>Debug Data</Text>
        </TouchableOpacity>
      )}

      {/* Debug data view */}
      <ScanDebugView
        visible={showDebugView}
        onClose={() => setShowDebugView(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  debugButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 100 : 60,
    right: 20,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#4a80f5",
    zIndex: 100,
  },
  debugButtonText: {
    color: "#4a80f5",
    fontSize: 12,
  },
});
