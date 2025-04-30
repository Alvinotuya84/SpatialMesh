import { useState, useEffect, useRef } from "react";
import { Camera } from "expo-camera";
import { DeviceMotion } from "expo-sensors";
import { THREE } from "expo-three";
import { v4 as uuidv4 } from "uuid";

import { useScanStore, ScanFrame, ScanPoint } from "../stores/scanStore";
import { createARScene, ARScene } from "../utils/ar/sceneManager";
import {
  extractFeaturesFromFrame,
  matchFeaturesAcrossFrames,
  calculatePointCloudNormals,
} from "../utils/ar/pointCloudProcessing";
import { generateMeshFromFrames } from "../utils/ar/meshGeneration";

interface UseScanningProps {
  onScanComplete?: (meshId: string) => void;
  onError?: (error: string) => void;
}

export function useScanning({
  onScanComplete,
  onError,
}: UseScanningProps = {}) {
  const {
    stage,
    frames,
    setStage,
    addFrame,
    clearFrames,
    pointCloud,
    setPointCloud,
    setMesh,
    setProcessingStatus,
    scanQuality,
    captureInterval,
    resetScan,
    setError,
  } = useScanStore();

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isARReady, setIsARReady] = useState(false);

  const cameraRef = useRef<typeof Camera>(null);
  const arSceneRef = useRef<ARScene | null>(null);
  const glRef = useRef<any>(null);
  const arSessionRef = useRef<any>(null);

  const captureTimerRef = useRef<NodeJS.Timeout | null>(null);

  const lastCaptureTime = useRef<number>(0);
  const processingFrameRef = useRef<boolean>(false);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === "granted");

      if (status !== "granted") {
        setError("Camera permission is required for scanning");
      }
    })();

    DeviceMotion.setUpdateInterval(100);

    return () => {
      if (captureTimerRef.current) {
        clearTimeout(captureTimerRef.current);
      }
      resetScan();
    };
  }, [resetScan, setError]);

  const initializeAR = async (gl: any, arSession: any) => {
    try {
      glRef.current = gl;
      arSessionRef.current = arSession;

      arSceneRef.current = createARScene(
        gl,
        arSession,
        handleTrackingUpdated,
        handlePointCloudUpdated
      );

      await arSceneRef.current.initialize();

      setIsARReady(true);
      setStage("ready");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to initialize AR";
      setError(errorMessage);
      setStage("error");
      onError?.(errorMessage);
    }
  };

  const handleTrackingUpdated = (state: string, reason: string) => {
    if (state === "TRACKING_NORMAL" && stage === "initializing") {
      setStage("ready");
    } else if (state !== "TRACKING_NORMAL" && stage === "scanning") {
      pauseScanning();
    }
  };

  const handlePointCloudUpdated = (points: ScanPoint[]) => {
    setPointCloud(points);
  };

  const startScanning = () => {
    if (stage !== "ready" && stage !== "paused") return;

    if (!arSceneRef.current) {
      setError("AR scene not initialized");
      return;
    }

    setStage("scanning");
    arSceneRef.current.startScanning();

    lastCaptureTime.current = Date.now();
    scheduleCaptureFrame();
  };

  const pauseScanning = () => {
    if (stage !== "scanning") return;

    setStage("paused");

    if (arSceneRef.current) {
      arSceneRef.current.pauseScanning();
    }

    if (captureTimerRef.current) {
      clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }
  };

  const stopScanning = () => {
    if (stage !== "scanning" && stage !== "paused") return;

    if (arSceneRef.current) {
      arSceneRef.current.stopScanning();
    }

    if (captureTimerRef.current) {
      clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }
  };

  const scheduleCaptureFrame = () => {
    if (stage !== "scanning") return;

    const now = Date.now();
    const elapsed = now - lastCaptureTime.current;

    if (elapsed >= captureInterval && !processingFrameRef.current) {
      captureFrame();
      lastCaptureTime.current = now;
    }

    captureTimerRef.current = setTimeout(scheduleCaptureFrame, 10);
  };

  const captureFrame = async () => {
    if (!cameraRef.current || !arSceneRef.current || processingFrameRef.current)
      return;

    processingFrameRef.current = true;

    try {
      const cameraData = arSceneRef.current.getCamera();

      // This would be a real implementation using camera feed
      // Since we're simulating for this demo, we'll create synthetic data
      const newFrame: ScanFrame = {
        id: uuidv4(),
        timestamp: Date.now(),
        points: generateSyntheticPoints(cameraData.position, 50),
        cameraPosition: cameraData.position.clone(),
        cameraRotation: cameraData.rotation.clone(),
      };

      addFrame(newFrame);

      // Render the current point cloud for visualizing the scan
      if (arSceneRef.current && pointCloud.length > 0) {
        arSceneRef.current.renderPointCloud(pointCloud);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Error capturing frame";
      console.error(errorMessage);
    } finally {
      processingFrameRef.current = false;
    }
  };

  const generateSyntheticPoints = (
    cameraPosition: THREE.Vector3,
    count: number
  ): ScanPoint[] => {
    const points: ScanPoint[] = [];

    for (let i = 0; i < count; i++) {
      // Generate random points within view frustum
      const distance = 0.5 + Math.random() * 4.5;
      const angle = Math.random() * Math.PI * 2;
      const height = -1 + Math.random() * 2;

      const x = cameraPosition.x + Math.cos(angle) * distance;
      const y = cameraPosition.y + height;
      const z = cameraPosition.z + Math.sin(angle) * distance;

      points.push({
        position: new THREE.Vector3(x, y, z),
        confidence: 0.5 + Math.random() * 0.5,
      });
    }

    return points;
  };

  const completeScan = async () => {
    if (frames.length < 10) {
      setError("Not enough frames captured for processing");
      return;
    }

    stopScanning();
    setStage("processing");

    try {
      setProcessingStatus({
        stage: "pointcloud",
        progress: 0,
        message: "Processing point cloud...",
      });

      // Generate a mesh from the captured frames
      const mesh = await generateMeshFromFrames(frames, {
        onStatusUpdate: setProcessingStatus,
        onError: (error) => {
          setError(error);
          setStage("error");
          onError?.(error);
        },
        resolution:
          scanQuality === "high" ? 0.02 : scanQuality === "medium" ? 0.05 : 0.1,
        smoothingIterations:
          scanQuality === "high" ? 3 : scanQuality === "medium" ? 2 : 1,
        simplifyRatio:
          scanQuality === "high" ? 0.9 : scanQuality === "medium" ? 0.8 : 0.6,
      });

      setMesh(mesh);
      setStage("completed");

      if (arSceneRef.current) {
        arSceneRef.current.renderMesh(mesh);
      }

      onScanComplete?.(mesh.id);

      return mesh.id;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Error processing scan";
      setError(errorMessage);
      setStage("error");
      onError?.(errorMessage);
      return null;
    }
  };

  const takeScreenshot = async (): Promise<string | null> => {
    if (!arSceneRef.current) return null;

    try {
      return await arSceneRef.current.takeScreenshot();
    } catch (error) {
      console.error("Failed to take screenshot:", error);
      return null;
    }
  };

  const resetScanSession = () => {
    stopScanning();
    clearFrames();
    setPointCloud([]);

    if (arSceneRef.current) {
      arSceneRef.current.clearScene();
    }

    setStage("ready");
  };

  return {
    hasPermission,
    isARReady,
    stage,
    frames,
    pointCloud,
    initializeAR,
    startScanning,
    pauseScanning,
    stopScanning,
    completeScan,
    resetScanSession,
    takeScreenshot,
    cameraRef,
  };
}
