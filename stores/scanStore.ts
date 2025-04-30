import { create } from "zustand";
import { THREE } from "expo-three";

export interface ScanPoint {
  position: THREE.Vector3;
  normal?: THREE.Vector3;
  color?: THREE.Color;
  confidence?: number;
}

export interface ScanFrame {
  id: string;
  timestamp: number;
  points: ScanPoint[];
  cameraPosition: THREE.Vector3;
  cameraRotation: THREE.Quaternion;
}

export interface Mesh {
  id: string;
  vertices: number[];
  faces: number[];
  normals?: number[];
  uvs?: number[];
  name: string;
  createdAt: number;
}

export type ScanningStage =
  | "initializing"
  | "ready"
  | "scanning"
  | "paused"
  | "processing"
  | "completed"
  | "error";

export type ProcessingStatus = {
  stage:
    | "idle"
    | "pointcloud"
    | "meshing"
    | "texturing"
    | "optimizing"
    | "completed";
  progress: number;
  message: string;
};

interface ScanState {
  // Scanning state
  stage: ScanningStage;
  frames: ScanFrame[];
  pointCloud: ScanPoint[];
  mesh: Mesh | null;
  processingStatus: ProcessingStatus;
  error: string | null;

  // Scanning settings
  scanQuality: "low" | "medium" | "high";
  captureInterval: number; // ms between frame captures
  maxFrames: number;

  // Device status tracking
  lastDeviceStability: number;
  lastTrackingStatus: { isTracking: boolean; reason: string };

  // Actions
  setStage: (stage: ScanningStage) => void;
  addFrame: (frame: ScanFrame) => void;
  clearFrames: () => void;
  setPointCloud: (points: ScanPoint[]) => void;
  setMesh: (mesh: Mesh) => void;
  setProcessingStatus: (status: Partial<ProcessingStatus>) => void;
  setScanQuality: (quality: "low" | "medium" | "high") => void;
  setError: (error: string | null) => void;
  updateDeviceStatus: (
    stability: number,
    trackingStatus: { isTracking: boolean; reason: string }
  ) => void;
  resetScan: () => void;
}

export const useScanStore = create<ScanState>((set) => ({
  // Initial state
  stage: "initializing",
  frames: [],
  pointCloud: [],
  mesh: null,
  processingStatus: {
    stage: "idle",
    progress: 0,
    message: "",
  },
  error: null,

  // Default settings
  scanQuality: "medium",
  captureInterval: 300, // 300ms between frames by default
  maxFrames: 100,

  // Device status tracking
  lastDeviceStability: 1.0,
  lastTrackingStatus: { isTracking: false, reason: "INITIALIZING" },

  // Actions
  setStage: (stage) => set({ stage }),

  addFrame: (frame) =>
    set((state) => {
      // Don't add more frames if we've reached the maximum
      if (state.frames.length >= state.maxFrames) {
        return state;
      }
      return {
        frames: [...state.frames, frame],
      };
    }),

  clearFrames: () => set({ frames: [] }),

  setPointCloud: (points) => set({ pointCloud: points }),

  setMesh: (mesh) => set({ mesh }),

  setProcessingStatus: (status) =>
    set((state) => ({
      processingStatus: {
        ...state.processingStatus,
        ...status,
      },
    })),

  setScanQuality: (quality) =>
    set((state) => {
      // Adjust scan parameters based on quality
      let captureInterval = state.captureInterval;
      let maxFrames = state.maxFrames;

      switch (quality) {
        case "low":
          captureInterval = 500;
          maxFrames = 60;
          break;
        case "medium":
          captureInterval = 300;
          maxFrames = 100;
          break;
        case "high":
          captureInterval = 150;
          maxFrames = 200;
          break;
      }

      return {
        scanQuality: quality,
        captureInterval,
        maxFrames,
      };
    }),

  setError: (error) => set({ error }),

  updateDeviceStatus: (stability, trackingStatus) =>
    set({
      lastDeviceStability: stability,
      lastTrackingStatus: trackingStatus,
    }),

  resetScan: () =>
    set({
      stage: "ready",
      frames: [],
      pointCloud: [],
      mesh: null,
      processingStatus: {
        stage: "idle",
        progress: 0,
        message: "",
      },
      error: null,
      lastDeviceStability: 1.0,
      lastTrackingStatus: { isTracking: false, reason: "INITIALIZING" },
    }),
}));
