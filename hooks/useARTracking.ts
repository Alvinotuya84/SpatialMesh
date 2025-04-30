import { useState, useEffect } from "react";
import { isARSupportedOnDevice } from "@reactvision/react-viro";
import {
  ViroTrackingStateConstants,
  ViroARTrackingReasonConstants,
} from "@reactvision/react-viro";

export interface TrackingStatus {
  state: number;
  reason: number;
  isTracking: boolean;
  message: string;
}

export function useARTracking() {
  const [isARSupported, setIsARSupported] = useState<boolean | null>(null);
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>({
    state: ViroTrackingStateConstants.TRACKING_UNAVAILABLE,
    reason: ViroARTrackingReasonConstants.TRACKING_REASON_NONE,
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
          state: ViroTrackingStateConstants.TRACKING_UNAVAILABLE,
          reason: ViroARTrackingReasonConstants.TRACKING_REASON_NONE,
          isTracking: false,
          message: "AR is not supported on this device",
        });
      }
    } catch (error) {
      setIsARSupported(false);
      setTrackingStatus({
        state: ViroTrackingStateConstants.TRACKING_UNAVAILABLE,
        reason: ViroARTrackingReasonConstants.TRACKING_REASON_NONE,
        isTracking: false,
        message: "Error checking AR support",
      });
    }
  };

  const updateTrackingStatus = (state: number, reason: number) => {
    const isTracking = state === ViroTrackingStateConstants.TRACKING_NORMAL;

    let message = "";

    switch (state) {
      case ViroTrackingStateConstants.TRACKING_NORMAL:
        message = "Tracking normal";
        break;
      case ViroTrackingStateConstants.TRACKING_LIMITED:
        switch (reason) {
          case ViroARTrackingReasonConstants.TRACKING_REASON_EXCESSIVE_MOTION:
            message = "Please move the device more slowly";
            break;
          case ViroARTrackingReasonConstants.TRACKING_REASON_INSUFFICIENT_FEATURES:
            message =
              "Not enough visual features. Try scanning an area with more texture or objects";
            break;
          default:
            message = "Limited tracking quality";
            break;
        }
        break;
      case ViroTrackingStateConstants.TRACKING_UNAVAILABLE:
        message = "Tracking not available";
        break;
      default:
        message = "Initializing AR...";
        break;
    }

    setTrackingStatus({
      state,
      reason,
      isTracking,
      message,
    });
  };

  const getTrackingTips = (): string[] => {
    const tips: string[] = [];

    switch (trackingStatus.state) {
      case ViroTrackingStateConstants.TRACKING_LIMITED:
        switch (trackingStatus.reason) {
          case ViroARTrackingReasonConstants.TRACKING_REASON_EXCESSIVE_MOTION:
            tips.push("Move the device more slowly");
            tips.push("Hold the device with both hands to reduce shakiness");
            tips.push("Try using a wide stance for better stability");
            break;
          case ViroARTrackingReasonConstants.TRACKING_REASON_INSUFFICIENT_FEATURES:
            tips.push("Scan areas with more visual details or textures");
            tips.push("Avoid plain surfaces like blank walls");
            tips.push("Try scanning objects with distinct edges and details");
            break;
          default:
            tips.push("Move the device slowly");
            tips.push("Ensure adequate lighting");
            tips.push("Scan areas with distinct visual features");
            break;
        }
        break;
      case ViroTrackingStateConstants.TRACKING_UNAVAILABLE:
        tips.push("Restart the scanning process");
        tips.push("Check if your device supports AR functionality");
        tips.push("Ensure you have granted camera permissions");
        break;
      case ViroTrackingStateConstants.TRACKING_NORMAL:
        tips.push("Continue scanning your environment");
        tips.push("Move around to capture different angles");
        tips.push("Keep a steady pace for best results");
        break;
      default:
        tips.push("Point the camera at a well-lit area with visual features");
        tips.push("Hold the device steady");
        tips.push("Move the device slowly to allow initialization");
        break;
    }

    return tips;
  };

  const getRecommendedAction = (): string => {
    switch (trackingStatus.state) {
      case ViroTrackingStateConstants.TRACKING_NORMAL:
        return "Continue scanning";
      case ViroTrackingStateConstants.TRACKING_LIMITED:
        switch (trackingStatus.reason) {
          case ViroARTrackingReasonConstants.TRACKING_REASON_EXCESSIVE_MOTION:
            return "Hold the device more steady";
          case ViroARTrackingReasonConstants.TRACKING_REASON_INSUFFICIENT_FEATURES:
            return "Move to an area with more visual details";
          default:
            return "Check tracking conditions";
        }
      case ViroTrackingStateConstants.TRACKING_UNAVAILABLE:
        return "Restart the scanning process";
      default:
        return "Wait for tracking to initialize";
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
