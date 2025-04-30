import { useState, useEffect } from "react";
import { isARSupportedOnDevice } from "@reactvision/react-viro";

export type TrackingState =
  | "UNKNOWN"
  | "TRACKING_NORMAL"
  | "TRACKING_LIMITED"
  | "TRACKING_NOT_AVAILABLE"
  | "ERROR";

export type TrackingReason =
  | "NORMAL"
  | "INITIALIZING"
  | "EXCESSIVE_MOTION"
  | "INSUFFICIENT_FEATURES"
  | "INSUFFICIENT_LIGHT"
  | "RELOCALIZING"
  | "UNSUPPORTED_DEVICE"
  | "ERROR";

export interface TrackingStatus {
  state: TrackingState;
  reason: TrackingReason;
  isTracking: boolean;
  message: string;
}

export function useARTracking() {
  const [isARSupported, setIsARSupported] = useState<boolean | null>(null);
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>({
    state: "UNKNOWN",
    reason: "INITIALIZING",
    isTracking: false,
    message: "Initializing AR tracking...",
  });

  useEffect(() => {
    checkARSupport();
  }, []);

  const checkARSupport = async () => {
    try {
      const supported = await isARSupportedOnDevice();
      setIsARSupported(supported.isARSupported);

      if (!supported) {
        setTrackingStatus({
          state: "TRACKING_NOT_AVAILABLE",
          reason: "UNSUPPORTED_DEVICE",
          isTracking: false,
          message: "AR is not supported on this device",
        });
      }
    } catch (error) {
      setIsARSupported(false);
      setTrackingStatus({
        state: "ERROR",
        reason: "ERROR",
        isTracking: false,
        message: "Error checking AR support",
      });
    }
  };

  const updateTrackingStatus = (state: string, reason: string) => {
    const trackingState = state as TrackingState;
    const trackingReason = reason as TrackingReason;

    const isTracking = trackingState === "TRACKING_NORMAL";

    let message = "";

    switch (trackingState) {
      case "TRACKING_NORMAL":
        message = "Tracking normal";
        break;
      case "TRACKING_LIMITED":
        switch (trackingReason) {
          case "EXCESSIVE_MOTION":
            message = "Please move the device more slowly";
            break;
          case "INSUFFICIENT_FEATURES":
            message =
              "Not enough visual features. Try scanning an area with more texture or objects";
            break;
          case "INSUFFICIENT_LIGHT":
            message = "Not enough light. Please scan in a brighter environment";
            break;
          case "RELOCALIZING":
            message = "Relocating...please hold the device still";
            break;
          default:
            message = "Limited tracking quality";
            break;
        }
        break;
      case "TRACKING_NOT_AVAILABLE":
        message = "Tracking not available";
        break;
      case "UNKNOWN":
        message = "Initializing AR...";
        break;
      case "ERROR":
        message = "Error in AR tracking";
        break;
    }

    setTrackingStatus({
      state: trackingState,
      reason: trackingReason,
      isTracking,
      message,
    });
  };

  const getTrackingTips = (): string[] => {
    const tips: string[] = [];

    switch (trackingStatus.state) {
      case "TRACKING_LIMITED":
        switch (trackingStatus.reason) {
          case "EXCESSIVE_MOTION":
            tips.push("Move the device more slowly");
            tips.push("Hold the device with both hands to reduce shakiness");
            tips.push("Try using a wide stance for better stability");
            break;
          case "INSUFFICIENT_FEATURES":
            tips.push("Scan areas with more visual details or textures");
            tips.push("Avoid plain surfaces like blank walls");
            tips.push("Try scanning objects with distinct edges and details");
            break;
          case "INSUFFICIENT_LIGHT":
            tips.push("Move to a better lit environment");
            tips.push("Turn on more lights if possible");
            tips.push("Avoid direct sunlight which can cause glare");
            break;
          case "RELOCALIZING":
            tips.push("Hold the device still until tracking resumes");
            tips.push("Return to a previously scanned area");
            tips.push("Avoid rapid movements while relocating");
            break;
          default:
            tips.push("Move the device slowly");
            tips.push("Ensure adequate lighting");
            tips.push("Scan areas with distinct visual features");
            break;
        }
        break;
      case "TRACKING_NOT_AVAILABLE":
        tips.push("Restart the scanning process");
        tips.push("Check if your device supports AR functionality");
        tips.push("Ensure you have granted camera permissions");
        break;
      case "UNKNOWN":
      case "TRACKING_NORMAL":
        tips.push("Point the camera at a well-lit area with visual features");
        tips.push("Hold the device steady");
        tips.push("Move the device slowly to allow initialization");
        break;
      default:
        tips.push("Follow on-screen guidance");
        tips.push("Keep the device at a consistent distance from surfaces");
        tips.push("Ensure good lighting conditions");
        break;
    }

    return tips;
  };

  const getRecommendedAction = (): string => {
    switch (trackingStatus.state) {
      case "TRACKING_NORMAL":
        return "Continue scanning";
      case "TRACKING_LIMITED":
        switch (trackingStatus.reason) {
          case "EXCESSIVE_MOTION":
            return "Hold the device more steady";
          case "INSUFFICIENT_FEATURES":
            return "Move to an area with more visual details";
          case "INSUFFICIENT_LIGHT":
            return "Find better lighting";
          case "RELOCALIZING":
            return "Hold still until tracking resumes";
          default:
            return "Check tracking conditions";
        }
      case "TRACKING_NOT_AVAILABLE":
        return "Restart the scanning process";
      case "UNKNOWN":
      case "ERROR":
        return "Error in AR tracking. Please restart the app";
      default:
        return "Follow on-screen guidance";
    }
  };

  return {
    isARSupported,
    trackingStatus,
    updateTrackingStatus,
    getTrackingTips,
    getRecommendedAction,
  };
}
