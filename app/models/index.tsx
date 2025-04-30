import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useModelStore, MeshMetadata } from "../../stores/modelStore";

export default function SavedModelsScreen() {
  const router = useRouter();
  const { models, isLoading, error, loadModels, deleteModel } = useModelStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadModels();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadModels();
    setRefreshing(false);
  };

  const handleModelPress = (model: MeshMetadata) => {
    router.push(`/models/${model.id}`);
  };

  const handleDeleteModel = async (id: string) => {
    await deleteModel(id);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderModelItem = ({ item }: { item: MeshMetadata }) => {
    return (
      <TouchableOpacity
        style={styles.modelCard}
        onPress={() => handleModelPress(item)}
      >
        <View style={styles.thumbnailContainer}>
          {item.thumbnailUri ? (
            <Image
              source={{ uri: item.thumbnailUri }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.placeholderThumbnail}>
              <Text style={styles.placeholderText}>No Preview</Text>
            </View>
          )}
        </View>

        <View style={styles.modelInfo}>
          <Text style={styles.modelName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.modelDate}>{formatDate(item.createdAt)}</Text>

          <View style={styles.statsRow}>
            <Text style={styles.modelStats}>
              {item.vertexCount.toLocaleString()} vertices
            </Text>
            <Text style={styles.modelStats}>
              {item.faceCount.toLocaleString()} faces
            </Text>
          </View>

          <Text style={styles.fileSize}>{formatFileSize(item.fileSize)}</Text>
        </View>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteModel(item.id)}
        >
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Text style={styles.header}>Saved 3D Models</Text>

      {isLoading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4a80f5" />
          <Text style={styles.loadingText}>Loading saved models...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error loading models: {error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadModels}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : models.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No saved models yet</Text>
          <TouchableOpacity
            style={styles.newScanButton}
            onPress={() => router.push("/scan")}
          >
            <Text style={styles.newScanButtonText}>Start a New Scan</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={models.sort((a, b) => b.createdAt - a.createdAt)}
          renderItem={renderModelItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.newScanButton}
          onPress={() => router.push("/scan")}
        >
          <Text style={styles.newScanButtonText}>Start a New Scan</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginVertical: 20,
    marginHorizontal: 20,
  },
  listContent: {
    padding: 16,
  },
  modelCard: {
    backgroundColor: "#262626",
    borderRadius: 12,
    marginBottom: 16,
    overflow: "hidden",
    flexDirection: "row",
  },
  thumbnailContainer: {
    width: 100,
    height: 100,
  },
  thumbnail: {
    width: "100%",
    height: "100%",
    backgroundColor: "#333",
  },
  placeholderThumbnail: {
    width: "100%",
    height: "100%",
    backgroundColor: "#333",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    color: "#aaa",
    fontSize: 12,
  },
  modelInfo: {
    flex: 1,
    padding: 12,
    justifyContent: "center",
  },
  modelName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 5,
  },
  modelDate: {
    color: "#aaa",
    fontSize: 12,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  modelStats: {
    color: "#bbb",
    fontSize: 12,
    marginRight: 10,
  },
  fileSize: {
    color: "#7a80f5",
    fontSize: 12,
    fontWeight: "500",
  },
  deleteButton: {
    paddingHorizontal: 15,
    justifyContent: "center",
    backgroundColor: "rgba(255, 59, 48, 0.2)",
  },
  deleteButtonText: {
    color: "#ff3b30",
    fontSize: 12,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#fff",
    marginTop: 10,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    color: "#ff3b30",
    textAlign: "center",
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: "#4a80f5",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyText: {
    color: "#aaa",
    fontSize: 16,
    marginBottom: 20,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  newScanButton: {
    backgroundColor: "#4a80f5",
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  newScanButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
