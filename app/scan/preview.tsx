import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GLView } from "expo-gl";
import { THREE } from "expo-three";
import { Renderer } from "expo-three";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import { useScanStore } from "../../stores/scanStore";
import { useModelStore } from "../../stores/modelStore";
import { useMeshProcessing } from "../../hooks/useMeshProcessing";
import BottomSheet from "@gorhom/bottom-sheet";

export default function MeshPreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { width, height } = useWindowDimensions();

  const { mesh, processingStatus, stage, setStage } = useScanStore();
  const { saveModel } = useModelStore();
  const {
    isProcessing,
    progress,
    exportFormat,
    optimizeMesh,
    setExportFormat,
    exportMesh,
    shareMesh,
  } = useMeshProcessing({
    onExportComplete: (path) => {
      console.log("Export completed:", path);
    },
    onError: (error) => {
      console.error("Export error:", error);
    },
  });

  const [isMeshLoaded, setIsMeshLoaded] = useState(false);
  const [viewMode, setViewMode] = useState("solid");
  const [isRotating, setIsRotating] = useState(true);
  const [meshStats, setMeshStats] = useState({ vertices: 0, faces: 0 });

  const glViewRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const meshRef = useRef(null);
  const requestAnimationFrameRef = useRef(null);
  const bottomSheetRef = useRef(null);

  const sheetHeight = useSharedValue(250);

  const bottomSheetAnimatedStyle = useAnimatedStyle(() => {
    return {
      height: sheetHeight.value,
    };
  });

  useEffect(() => {
    if (stage !== "completed") {
      setStage("completed");
    }

    return () => {
      if (requestAnimationFrameRef.current) {
        cancelAnimationFrame(requestAnimationFrameRef.current);
      }
    };
  }, []);

  const onContextCreate = async (gl) => {
    try {
      // Create renderer with proper configuration
      const renderer = new Renderer({
        gl,
        width,
        height,
        clearColor: "#000000",
        pixelRatio: gl.scale || 1, // Use the device's pixel ratio if available
      });
      rendererRef.current = renderer;

      // Create scene
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog("#000000", 1, 10000);
      sceneRef.current = scene;

      // Create camera
      const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      camera.position.z = 5;
      cameraRef.current = camera;

      // Add lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(1, 1, 1);
      scene.add(directionalLight);

      const backLight = new THREE.DirectionalLight(0xffffff, 0.2);
      backLight.position.set(-1, -1, -1);
      scene.add(backLight);

      // Load mesh if available
      if (mesh) {
        renderMesh(mesh);
      }

      // Start rendering loop
      const render = () => {
        if (meshRef.current && isRotating) {
          meshRef.current.rotation.y += 0.01;
        }

        renderer.render(scene, camera);

        requestAnimationFrameRef.current = requestAnimationFrame(render);
        gl.endFrameEXP();
      };

      render();
    } catch (error) {
      console.error("Error creating GL context:", error);
    }
  };

  const renderMesh = (meshData) => {
    if (!sceneRef.current || !meshData) {
      console.warn("Scene or mesh data not available");
      return;
    }

    try {
      const scene = sceneRef.current;

      // Remove existing mesh if any
      if (meshRef.current) {
        scene.remove(meshRef.current);
        meshRef.current.geometry.dispose();
        if (meshRef.current.material) {
          if (Array.isArray(meshRef.current.material)) {
            meshRef.current.material.forEach((material) => material.dispose());
          } else {
            meshRef.current.material.dispose();
          }
        }
        meshRef.current = null;
      }

      const geometry = new THREE.BufferGeometry();

      // Add vertices
      if (!meshData.vertices || meshData.vertices.length === 0) {
        throw new Error("No vertices found in mesh data");
      }

      const positions = new Float32Array(meshData.vertices);
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3)
      );

      // Add normals if available
      if (meshData.normals && meshData.normals.length > 0) {
        const normals = new Float32Array(meshData.normals);
        geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
      } else {
        // Compute normals if not provided
        geometry.computeVertexNormals();
      }

      // Add UVs if available
      if (meshData.uvs && meshData.uvs.length > 0) {
        const uvs = new Float32Array(meshData.uvs);
        geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
      }

      // Add face indices
      if (meshData.faces && meshData.faces.length > 0) {
        geometry.setIndex(Array.from(meshData.faces));
      }

      // Create materials based on view mode
      let material;

      switch (viewMode) {
        case "wireframe":
          material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            wireframe: true,
          });
          break;
        case "points":
          material = new THREE.PointsMaterial({
            color: 0x00ffff,
            size: 0.05,
            sizeAttenuation: true,
          });
          break;
        case "solid":
        default:
          material = new THREE.MeshStandardMaterial({
            color: 0x4a80f5,
            flatShading: true,
            roughness: 0.7,
            metalness: 0.2,
          });
          break;
      }

      // Create mesh or points based on view mode
      if (viewMode === "points") {
        const points = new THREE.Points(geometry, material);
        scene.add(points);
        meshRef.current = points;
      } else {
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        meshRef.current = mesh;
      }

      // Center the mesh
      geometry.computeBoundingSphere();

      if (geometry.boundingSphere) {
        const center = geometry.boundingSphere.center;
        const radius = geometry.boundingSphere.radius;

        // Offset the mesh to center it
        if (meshRef.current) {
          meshRef.current.position.set(-center.x, -center.y, -center.z);
        }

        // Position camera based on bounding sphere
        if (cameraRef.current) {
          const distance = radius * 2.5;
          cameraRef.current.position.z = distance;
        }
      }

      // Update mesh statistics
      setMeshStats({
        vertices: meshData.vertices.length / 3,
        faces: meshData.faces ? meshData.faces.length / 3 : 0,
      });

      setIsMeshLoaded(true);
    } catch (error) {
      console.error("Error rendering mesh:", error);
      setIsMeshLoaded(false);
    }
  };

  const changeViewMode = (mode) => {
    setViewMode(mode);

    if (mesh) {
      renderMesh(mesh);
    }
  };

  const toggleRotation = () => {
    setIsRotating(!isRotating);
  };

  const handleExport = async () => {
    if (!mesh) {
      console.warn("No mesh available to export");
      return;
    }

    try {
      const path = await exportMesh(mesh, exportFormat);
      console.log("Mesh exported to:", path);
    } catch (error) {
      console.error("Failed to export mesh:", error);
    }
  };

  const handleShare = async () => {
    if (!mesh) {
      console.warn("No mesh available to share");
      return;
    }

    try {
      await shareMesh(mesh, exportFormat);
    } catch (error) {
      console.error("Failed to share mesh:", error);
    }
  };

  const handleSave = async () => {
    if (!mesh) {
      console.warn("No mesh available to save");
      return;
    }

    try {
      const screenshot = await takeScreenshot();
      if (screenshot) {
        const meshId = await saveModel(mesh, screenshot);

        if (meshId) {
          router.push(`/models/${meshId}`);
        }
      } else {
        console.warn("Failed to take screenshot for thumbnail");
      }
    } catch (error) {
      console.error("Failed to save mesh:", error);
    }
  };

  const takeScreenshot = async () => {
    if (!glViewRef.current) {
      console.warn("GLView ref not available");
      return null;
    }

    try {
      // Using the GLView's takeSnapshotAsync method
      // (documentation shows this is properly implemented)
      const snapshot = await glViewRef.current.takeSnapshotAsync({
        format: "jpg",
        quality: 0.8,
      });

      return snapshot.uri;
    } catch (error) {
      console.error("Failed to take screenshot:", error);
      return null;
    }
  };

  const expandBottomSheet = () => {
    sheetHeight.value = withTiming(400, { duration: 300 });
    if (bottomSheetRef.current) {
      bottomSheetRef.current.expand();
    }
  };

  const collapseBottomSheet = () => {
    sheetHeight.value = withTiming(250, { duration: 300 });
    if (bottomSheetRef.current) {
      bottomSheetRef.current.collapse();
    }
  };

  const resetScan = () => {
    router.push("/");
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* GL View for mesh rendering */}
      <GLView
        ref={glViewRef}
        style={styles.glView}
        onContextCreate={onContextCreate}
      />

      {/* Loading overlay */}
      {(!isMeshLoaded || isProcessing) && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#4a80f5" />
          <Text style={styles.loadingText}>
            {isProcessing
              ? `${exportFormat.toUpperCase()} Export: ${progress}%`
              : "Loading Mesh..."}
          </Text>
        </View>
      )}

      {/* View mode controls */}
      <View style={styles.viewControls}>
        <TouchableOpacity
          style={[
            styles.viewButton,
            viewMode === "solid" && styles.activeViewButton,
          ]}
          onPress={() => changeViewMode("solid")}
        >
          <Text style={styles.viewButtonText}>Solid</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.viewButton,
            viewMode === "wireframe" && styles.activeViewButton,
          ]}
          onPress={() => changeViewMode("wireframe")}
        >
          <Text style={styles.viewButtonText}>Wireframe</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.viewButton,
            viewMode === "points" && styles.activeViewButton,
          ]}
          onPress={() => changeViewMode("points")}
        >
          <Text style={styles.viewButtonText}>Points</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.viewButton, isRotating && styles.activeViewButton]}
          onPress={toggleRotation}
        >
          <Text style={styles.viewButtonText}>Rotate</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom sheet for export options */}
      <BottomSheet
        ref={bottomSheetRef}
        index={0}
        snapPoints={["25%", "50%"]}
        handleHeight={30}
        handleComponent={() => (
          <View style={styles.bottomSheetHandle}>
            <View style={styles.handleBar} />
          </View>
        )}
      >
        <Animated.View
          style={[styles.bottomSheetContent, bottomSheetAnimatedStyle]}
        >
          <Text style={styles.bottomSheetTitle}>Mesh Options</Text>

          {mesh && (
            <View style={styles.meshInfo}>
              <Text style={styles.meshInfoText}>
                Vertices: {meshStats.vertices.toLocaleString()}
              </Text>
              <Text style={styles.meshInfoText}>
                Faces: {meshStats.faces.toLocaleString()}
              </Text>
            </View>
          )}

          <View style={styles.exportOptions}>
            <Text style={styles.exportTitle}>Export Format:</Text>
            <View style={styles.formatButtons}>
              <TouchableOpacity
                style={[
                  styles.formatButton,
                  exportFormat === "obj" && styles.activeFormatButton,
                ]}
                onPress={() => setExportFormat("obj")}
              >
                <Text style={styles.formatButtonText}>OBJ</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.formatButton,
                  exportFormat === "stl" && styles.activeFormatButton,
                ]}
                onPress={() => setExportFormat("stl")}
              >
                <Text style={styles.formatButtonText}>STL</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.formatButton,
                  exportFormat === "glb" && styles.activeFormatButton,
                ]}
                onPress={() => setExportFormat("glb")}
              >
                <Text style={styles.formatButtonText}>GLB</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.saveButton,
                isProcessing && styles.disabledButton,
              ]}
              onPress={handleSave}
              disabled={isProcessing}
            >
              <Text style={styles.actionButtonText}>Save</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.exportButton,
                isProcessing && styles.disabledButton,
              ]}
              onPress={handleExport}
              disabled={isProcessing}
            >
              <Text style={styles.actionButtonText}>Export</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.shareButton,
                isProcessing && styles.disabledButton,
              ]}
              onPress={handleShare}
              disabled={isProcessing}
            >
              <Text style={styles.actionButtonText}>Share</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.resetButton} onPress={resetScan}>
            <Text style={styles.resetButtonText}>New Scan</Text>
          </TouchableOpacity>
        </Animated.View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  glView: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  loadingText: {
    color: "#fff",
    marginTop: 10,
    fontSize: 16,
  },
  viewControls: {
    position: "absolute",
    top: 50,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "center",
    zIndex: 10,
  },
  viewButton: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  activeViewButton: {
    backgroundColor: "#4a80f5",
    borderColor: "#4a80f5",
  },
  viewButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  bottomSheetHandle: {
    backgroundColor: "#262626",
    paddingVertical: 10,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    alignItems: "center",
  },
  handleBar: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#666",
  },
  bottomSheetContent: {
    flex: 1,
    backgroundColor: "#262626",
    padding: 20,
  },
  bottomSheetTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
  },
  meshInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 10,
    padding: 15,
  },
  meshInfoText: {
    color: "#ddd",
    fontSize: 14,
  },
  exportOptions: {
    marginBottom: 15,
  },
  exportTitle: {
    color: "#fff",
    fontSize: 16,
    marginBottom: 10,
  },
  formatButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  formatButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 5,
    alignItems: "center",
  },
  activeFormatButton: {
    backgroundColor: "#4a80f5",
  },
  formatButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  actionButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginHorizontal: 5,
  },
  saveButton: {
    backgroundColor: "#4a80f5",
  },
  exportButton: {
    backgroundColor: "#50c878",
  },
  shareButton: {
    backgroundColor: "#f5a742",
  },
  disabledButton: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
  resetButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  resetButtonText: {
    color: "#fff",
    fontSize: 14,
  },
});
