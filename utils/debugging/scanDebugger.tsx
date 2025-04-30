import {
  useScanStore,
  ScanFrame,
  ScanPoint,
  Mesh,
} from "../../stores/scanStore";
import * as FileSystem from "expo-file-system";

export interface ScanDebugStats {
  frames: number;
  pointCloudSize: number;
  meshStats: {
    vertices: number;
    faces: number;
    hasNormals: boolean;
    hasUVs: boolean;
  } | null;
  deviceStability: number;
  trackingQuality: string;
  captureTimeRange: {
    start: number;
    end: number;
    durationMs: number;
  };
  averageFrameInterval: number;
}

/**
 * Utility to extract debugging information from the scan store
 */
export const getScanDebugStats = (): ScanDebugStats => {
  const { frames, pointCloud, mesh, lastDeviceStability, lastTrackingStatus } =
    useScanStore.getState();

  // Calculate capture time range
  const timestamps = frames.map((frame) => frame.timestamp);
  const startTime = timestamps.length > 0 ? Math.min(...timestamps) : 0;
  const endTime = timestamps.length > 0 ? Math.max(...timestamps) : 0;
  const durationMs = endTime - startTime;

  // Calculate average interval between frames
  let averageFrameInterval = 0;
  if (frames.length > 1) {
    let totalIntervals = 0;
    for (let i = 1; i < timestamps.length; i++) {
      totalIntervals += timestamps[i] - timestamps[i - 1];
    }
    averageFrameInterval = totalIntervals / (timestamps.length - 1);
  }

  // Get mesh stats if available
  const meshStats = mesh
    ? {
        vertices: mesh.vertices.length / 3,
        faces: mesh.faces.length / 3,
        hasNormals: !!mesh.normals && mesh.normals.length > 0,
        hasUVs: !!mesh.uvs && mesh.uvs.length > 0,
      }
    : null;

  // Get tracking quality description
  let trackingQuality = "Unknown";
  if (lastTrackingStatus) {
    if (lastTrackingStatus.isTracking) {
      trackingQuality = "Normal";
    } else {
      switch (lastTrackingStatus.reason) {
        case "EXCESSIVE_MOTION":
          trackingQuality = "Limited - Excessive Motion";
          break;
        case "INSUFFICIENT_FEATURES":
          trackingQuality = "Limited - Insufficient Features";
          break;
        case "INSUFFICIENT_LIGHT":
          trackingQuality = "Limited - Insufficient Light";
          break;
        case "INITIALIZING":
          trackingQuality = "Initializing";
          break;
        default:
          trackingQuality = `Limited - ${lastTrackingStatus.reason}`;
      }
    }
  }

  return {
    frames: frames.length,
    pointCloudSize: pointCloud.length,
    meshStats,
    deviceStability: lastDeviceStability,
    trackingQuality,
    captureTimeRange: {
      start: startTime,
      end: endTime,
      durationMs,
    },
    averageFrameInterval,
  };
};

/**
 * Export scan data to a JSON file for debugging
 */
export const exportScanDebugData = async (): Promise<string | null> => {
  try {
    const state = useScanStore.getState();

    // Create a simplified version of the state to avoid circular references
    const debugData = {
      stage: state.stage,
      frameCount: state.frames.length,
      pointCloudSize: state.pointCloud.length,
      meshStats: state.mesh
        ? {
            id: state.mesh.id,
            vertexCount: state.mesh.vertices.length / 3,
            faceCount: state.mesh.faces.length / 3,
            hasNormals: !!state.mesh.normals,
            hasUVs: !!state.mesh.uvs,
            name: state.mesh.name,
            createdAt: state.mesh.createdAt,
          }
        : null,
      processingStatus: state.processingStatus,
      error: state.error,
      scanQuality: state.scanQuality,
      captureInterval: state.captureInterval,
      maxFrames: state.maxFrames,
      lastDeviceStability: state.lastDeviceStability,
      lastTrackingStatus: state.lastTrackingStatus,
      stats: getScanDebugStats(),
    };

    // Save to file
    const fileName = `scan_debug_${Date.now()}.json`;
    const fileUri = `${FileSystem.documentDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(
      fileUri,
      JSON.stringify(debugData, null, 2),
      { encoding: FileSystem.EncodingType.UTF8 }
    );

    console.log(`Debug data saved to: ${fileUri}`);
    return fileUri;
  } catch (error) {
    console.error("Failed to export scan debug data:", error);
    return null;
  }
};

/**
 * Log detailed scan information to console
 */
export const logScanDebugInfo = (): void => {
  const state = useScanStore.getState();
  const stats = getScanDebugStats();

  console.log("=== SCAN DEBUG INFO ===");
  console.log(`Stage: ${state.stage}`);
  console.log(`Frames: ${stats.frames}`);
  console.log(`Point Cloud: ${stats.pointCloudSize} points`);

  if (stats.meshStats) {
    console.log("Mesh:");
    console.log(`- Vertices: ${stats.meshStats.vertices}`);
    console.log(`- Faces: ${stats.meshStats.faces}`);
    console.log(`- Has Normals: ${stats.meshStats.hasNormals}`);
    console.log(`- Has UVs: ${stats.meshStats.hasUVs}`);
  } else {
    console.log("Mesh: None");
  }

  console.log(`Device Stability: ${stats.deviceStability.toFixed(2)}`);
  console.log(`Tracking Quality: ${stats.trackingQuality}`);
  console.log(
    `Scan Duration: ${(stats.captureTimeRange.durationMs / 1000).toFixed(2)}s`
  );
  console.log(`Avg Frame Interval: ${stats.averageFrameInterval.toFixed(2)}ms`);
  console.log("======================");
};
