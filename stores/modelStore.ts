import { create } from "zustand";
import { Mesh } from "./scanStore";
import * as FileSystem from "expo-file-system";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";

export interface MeshMetadata {
  id: string;
  name: string;
  createdAt: number;
  thumbnailUri?: string;
  vertexCount: number;
  faceCount: number;
  fileSize: number;
  fileUri: string;
}

interface ModelState {
  models: MeshMetadata[];
  isLoading: boolean;
  error: string | null;
  selectedModelId: string | null;

  // Actions
  loadModels: () => Promise<void>;
  saveModel: (mesh: Mesh, thumbnailUri?: string) => Promise<string>;
  deleteModel: (id: string) => Promise<void>;
  renameModel: (id: string, newName: string) => Promise<void>;
  selectModel: (id: string | null) => void;
  getModelById: (id: string) => Promise<Mesh | null>;
}

// Define the directory where we'll store our models
const modelsDirectory = `${FileSystem.documentDirectory}models/`;
const metadataFile = `${modelsDirectory}metadata.json`;

// Helper function to ensure our directory exists
const ensureDirectoryExists = async () => {
  const dirInfo = await FileSystem.getInfoAsync(modelsDirectory);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(modelsDirectory, {
      intermediates: true,
    });
  }
};

export const useModelStore = create<ModelState>((set, get) => ({
  models: [],
  isLoading: false,
  error: null,
  selectedModelId: null,

  loadModels: async () => {
    set({ isLoading: true, error: null });
    try {
      await ensureDirectoryExists();

      // Check if metadata file exists
      const metadataInfo = await FileSystem.getInfoAsync(metadataFile);

      if (metadataInfo.exists) {
        const metadataContent = await FileSystem.readAsStringAsync(
          metadataFile
        );
        const models = JSON.parse(metadataContent) as MeshMetadata[];
        set({ models, isLoading: false });
      } else {
        // Create empty metadata file if it doesn't exist
        await FileSystem.writeAsStringAsync(metadataFile, JSON.stringify([]));
        set({ models: [], isLoading: false });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to load models",
        isLoading: false,
      });
    }
  },

  saveModel: async (mesh, thumbnailUri) => {
    set({ isLoading: true, error: null });
    try {
      await ensureDirectoryExists();

      const modelId = mesh.id || uuidv4();
      const modelFileName = `${modelId}.json`;
      const modelFilePath = `${modelsDirectory}${modelFileName}`;

      // Save mesh data to file
      await FileSystem.writeAsStringAsync(modelFilePath, JSON.stringify(mesh), {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // Save thumbnail if provided
      let thumbnailPath: string | undefined = undefined;
      if (thumbnailUri) {
        thumbnailPath = `${modelsDirectory}${modelId}_thumbnail.jpg`;
        await FileSystem.copyAsync({
          from: thumbnailUri,
          to: thumbnailPath,
        });
      }

      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(modelFilePath);

      // Create metadata
      const metadata: MeshMetadata = {
        id: modelId,
        name: mesh.name || `Scan ${new Date().toLocaleString()}`,
        createdAt: mesh.createdAt || Date.now(),
        thumbnailUri: thumbnailPath,
        vertexCount: mesh.vertices.length / 3,
        faceCount: mesh.faces.length / 3,
        fileSize: fileInfo.size || 0,
        fileUri: modelFilePath,
      };

      // Add to metadata file
      const { models } = get();
      const updatedModels = [
        ...models.filter((m) => m.id !== modelId),
        metadata,
      ];

      await FileSystem.writeAsStringAsync(
        metadataFile,
        JSON.stringify(updatedModels),
        { encoding: FileSystem.EncodingType.UTF8 }
      );

      set({ models: updatedModels, isLoading: false });
      return modelId;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to save model",
        isLoading: false,
      });
      throw error;
    }
  },

  deleteModel: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { models } = get();
      const modelToDelete = models.find((m) => m.id === id);

      if (!modelToDelete) {
        throw new Error("Model not found");
      }

      // Delete model file
      if (modelToDelete.fileUri) {
        await FileSystem.deleteAsync(modelToDelete.fileUri);
      }

      // Delete thumbnail if exists
      if (modelToDelete.thumbnailUri) {
        await FileSystem.deleteAsync(modelToDelete.thumbnailUri);
      }

      // Update metadata
      const updatedModels = models.filter((m) => m.id !== id);
      await FileSystem.writeAsStringAsync(
        metadataFile,
        JSON.stringify(updatedModels),
        { encoding: FileSystem.EncodingType.UTF8 }
      );

      set({ models: updatedModels, isLoading: false });

      // If the deleted model was selected, clear selection
      if (get().selectedModelId === id) {
        set({ selectedModelId: null });
      }
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : "Failed to delete model",
        isLoading: false,
      });
    }
  },

  renameModel: async (id, newName) => {
    set({ isLoading: true, error: null });
    try {
      const { models } = get();
      const updatedModels = models.map((model) =>
        model.id === id ? { ...model, name: newName } : model
      );

      await FileSystem.writeAsStringAsync(
        metadataFile,
        JSON.stringify(updatedModels),
        { encoding: FileSystem.EncodingType.UTF8 }
      );

      set({ models: updatedModels, isLoading: false });
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : "Failed to rename model",
        isLoading: false,
      });
    }
  },

  selectModel: (id) => {
    set({ selectedModelId: id });
  },

  getModelById: async (id) => {
    try {
      const { models } = get();
      const model = models.find((m) => m.id === id);

      if (!model || !model.fileUri) {
        return null;
      }

      const fileContent = await FileSystem.readAsStringAsync(model.fileUri);
      return JSON.parse(fileContent) as Mesh;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to load model",
      });
      return null;
    }
  },
}));
