import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { GLView } from "expo-gl";
import { ViroARSceneNavigator } from "@reactvision/react-viro";
import { createARScene, ARScene } from "../../utils/ar/sceneManager";
import { ScanPoint, Mesh } from "../../stores/scanStore";

interface ARScanViewProps {
  onARSceneCreated: (scene: ARScene) => void;
  onTrackingUpdated?: (state: string, reason: string) => void;
  onPointCloudUpdated?: (points: ScanPoint[]) => void;
  renderARContent: () => JSX.Element;
}

const ARScanView: React.FC<ARScanViewProps> = ({
  onARSceneCreated,
  onTrackingUpdated,
  onPointCloudUpdated,
  renderARContent,
}) => {
  const [isGLReady, setIsGLReady] = useState(false);
  const glViewRef = useRef<GLView>(null);
  const arSceneNavigatorRef = useRef<any>(null);
  const arSceneRef = useRef<ARScene | null>(null);

  // Handle GL context creation
  const handleContextCreate = async (gl: any) => {
    if (!gl) {
      console.error("GL context is null");
      return;
    }

    try {
      // Store GL context
      setIsGLReady(true);

      // When AR scene navigator is ready, create the AR scene
      if (arSceneNavigatorRef.current) {
        const arScene = createARScene(
          gl,
          arSceneNavigatorRef.current,
          onTrackingUpdated,
          onPointCloudUpdated
        );

        // Initialize the scene
        await arScene.initialize();

        // Store the reference
        arSceneRef.current = arScene;

        // Notify parent component
        onARSceneCreated(arScene);
      }
    } catch (error) {
      console.error("Error creating AR scene:", error);
    }
  };

  return (
    <View style={styles.container}>
      {/* GL View for 3D rendering */}
      <GLView
        ref={glViewRef}
        style={styles.glView}
        onContextCreate={handleContextCreate}
      />

      {/* AR Scene Navigator for AR functionality */}
      <ViroARSceneNavigator
        ref={arSceneNavigatorRef}
        style={styles.arView}
        initialScene={{
          scene: renderARContent,
        }}
        autofocus={true}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  glView: {
    flex: 1,
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  arView: {
    flex: 1,
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
});

export default ARScanView;
