import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  useWindowDimensions,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GLView } from "expo-gl";
import { THREE } from "expo-three";
import { Renderer } from "expo-three";
import BottomSheet from "@gorhom/bottom-sheet";

import { MeshMetadata, useModelStore } from "../../stores/modelStore";
import { Mesh } from "../../stores/scanStore";
import { useMeshProcessing } from "../../hooks/useMeshProcessing";

export default function ModelDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { width, height } = useWindowDimensions();

  const { models, getModelById, renameModel, deleteModel } = useModelStore();
  const {
    isProcessing,
    progress,
    exportFormat,
    setExportFormat,
    exportMesh,
    shareMesh,
  } = useMeshProcessing();

  const [model, setModel] = useState<MeshMetadata | null>(null);
  const [meshData, setMeshData] = useState<Mesh | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState("");
  const [viewMode, setViewMode] = useState<"solid" | "wireframe" | "points">(
    "solid"
  );
  const [isRotating, setIsRotating] = useState(true);

  const glViewRef = useRef<GLView>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const requestAnimationFrameRef = useRef<number | null>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);

  useEffect(() => {
    if (!id || typeof id !== "string") {
      router.back();
      return;
    }

    loadModelData(id);

    return () => {
      if (requestAnimationFrameRef.current) {
        cancelAnimationFrame(requestAnimationFrameRef.current);
      }
    };
  }, [id]);

  const loadModelData = async (modelId: string) => {
    try {
      setIsLoading(true);

      // Get metadata
      const modelMeta = models.find((m) => m.id === modelId);

      if (!modelMeta) {
        throw new Error("Model not found");
      }

      setModel(modelMeta);
      setNewName(modelMeta.name);

      // Load full mesh data
      const meshData = await getModelById(modelId);

      if (!meshData) {
        throw new Error("Failed to load mesh data");
      }

      setMeshData(meshData);
    } catch (error) {
      console.error("Error loading model:", error);
      Alert.alert("Error", "Failed to load model data");
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  const onContextCreate = async (gl: WebGLRenderingContext) => {
    // Create renderer
    const renderer = new Renderer({ gl });
    renderer.setSize(width, height);
    renderer.setClearColor("#000000");
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
    if (meshData) {
      renderMesh(meshData);
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
  };

  const renderMesh = (mesh: Mesh) => {
    if (!sceneRef.current) return;

    const scene = sceneRef.current;

    // Remove existing mesh if any
    if (meshRef.current) {
      scene.remove(meshRef.current);
      meshRef.current = null;
    }

    const geometry = new THREE.BufferGeometry();

    // Add vertices
    const positions = new Float32Array(mesh.vertices);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    // Add normals if available
    if (mesh.normals) {
      const normals = new Float32Array(mesh.normals);
      geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    }

    // Add UVs if available
    if (mesh.uvs) {
      const uvs = new Float32Array(mesh.uvs);
      geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    }

    // Add face indices
    geometry.setIndex(Array.from(mesh.faces));

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
      const points = new THREE.Points(
        geometry,
        material as THREE.PointsMaterial
      );
      scene.add(points);
      meshRef.current = points as unknown as THREE.Mesh;
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
  };

  const handleDeleteModel = async () => {
    if (!model) return;

    Alert.alert(
      "Delete Model",
      `Are you sure you want to delete "${model.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteModel(model.id);
              router.back();
            } catch (error) {
              Alert.alert("Error", "Failed to delete model");
            }
          },
        },
      ]
    );
  };

  const handleRenameModel = async () => {
    if (!model || !newName.trim()) return;

    try {
      await renameModel(model.id, newName.trim());
      setIsEditing(false);
    } catch (error) {
      Alert.alert("Error", "Failed to rename model");
    }
  };

  const handleExport = async () => {
    if (!meshData) return;

    try {
      const path = await exportMesh(meshData, exportFormat);
      Alert.alert("Success", `Model exported as ${exportFormat.toUpperCase()}`);
      console.log("Model exported to:", path);
    } catch (error) {
      Alert.alert("Error", "Failed to export model");
    }
  };

  const handleShare = async () => {
    if (!meshData) return;

    try {
      await shareMesh(meshData, exportFormat);
    } catch (error) {
      Alert.alert("Error", "Failed to share model");
    }
  };

  const changeViewMode = (mode: "solid" | "wireframe" | "points") => {
    setViewMode(mode);

    if (meshData) {
      renderMesh(meshData);
    }
  };

  const toggleRotation = () => {
    setIsRotating(!isRotating);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#4a80f5" />
        <Text style={styles.loadingText}>Loading model...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Model name header */}
      <View style={styles.header}>
        {isEditing ? (
          <View style={styles.editNameContainer}>
            <TextInput
              style={styles.nameInput}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={handleRenameModel}
            />
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleRenameModel}
            >
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setNewName(model?.name || "");
                setIsEditing(false);
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.titleContainer}>
            <Text style={styles.modelName}>{model?.name}</Text>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setIsEditing(true)}
            >
              <Text style={styles.editButtonText}>Rename</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* GL View for mesh rendering */}
      <GLView
        ref={glViewRef}
        style={styles.glView}
        onContextCreate={onContextCreate}
      />

      {/* Loading overlay during export */}
      {isProcessing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#4a80f5" />
          <Text style={styles.loadingText}>
            {`${exportFormat.toUpperCase()} Export: ${progress}%`}
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

      {/* Bottom info panel */}
      <View style={styles.infoPanel}>
        {model && (
          <>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Created:</Text>
              <Text style={styles.infoValue}>
                {formatDate(model.createdAt)}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Vertices:</Text>
              <Text style={styles.infoValue}>
                {model.vertexCount.toLocaleString()}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Faces:</Text>
              <Text style={styles.infoValue}>
                {model.faceCount.toLocaleString()}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>File Size:</Text>
              <Text style={styles.infoValue}>
                {formatFileSize(model.fileSize)}
              </Text>
            </View>

            <View style={styles.exportOptions}>
              <Text style={styles.exportLabel}>Export Format:</Text>
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
                style={[styles.actionButton, styles.exportButton]}
                onPress={handleExport}
                disabled={isProcessing}
              >
                <Text style={styles.actionButtonText}>Export</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.shareButton]}
                onPress={handleShare}
                disabled={isProcessing}
              >
                <Text style={styles.actionButtonText}>Share</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.deleteButton]}
                onPress={handleDeleteModel}
                disabled={isProcessing}
              >
                <Text style={styles.actionButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#121212",
  },
  loadingText: {
    color: "#fff",
    marginTop: 15,
    fontSize: 16,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    zIndex: 10,
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    zIndex: 5,
  },
  titleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modelName: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    flex: 1,
  },
  editButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  editButtonText: {
    color: "#fff",
    fontSize: 14,
  },
  editNameContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  nameInput: {
    flex: 1,
    color: "#fff",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
    marginRight: 10,
  },
  saveButton: {
    backgroundColor: "#4a80f5",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginRight: 10,
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  cancelButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  cancelButtonText: {
    color: "#fff",
  },
  glView: {
    flex: 1,
  },
  viewControls: {
    position: "absolute",
    top: 100,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "center",
    zIndex: 2,
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
  infoPanel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    padding: 20,
    paddingBottom: 40,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  infoLabel: {
    color: "#aaa",
    fontSize: 14,
  },
  infoValue: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  exportOptions: {
    marginTop: 15,
    marginBottom: 10,
  },
  exportLabel: {
    color: "#aaa",
    fontSize: 14,
    marginBottom: 8,
  },
  formatButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  formatButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingVertical: 8,
    paddingHorizontal: 0,
    borderRadius: 5,
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
    marginTop: 15,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 5,
    alignItems: "center",
    marginHorizontal: 5,
  },
  exportButton: {
    backgroundColor: "#50c878",
  },
  shareButton: {
    backgroundColor: "#f5a742",
  },
  deleteButton: {
    backgroundColor: "#ff3b30",
  },
  actionButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
});
