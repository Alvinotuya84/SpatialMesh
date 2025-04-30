import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  Dimensions,
  Platform,
} from "react-native";
import { useScanStore } from "../../stores/scanStore";
import {
  getScanDebugStats,
  ScanDebugStats,
} from "../../utils/debugging/scanDebugger";
import Button from "../ui/Button";

interface ScanDebugViewProps {
  visible: boolean;
  onClose: () => void;
}

const ScanDebugView: React.FC<ScanDebugViewProps> = ({ visible, onClose }) => {
  const { stage, frames, pointCloud, mesh, processingStatus, error } =
    useScanStore();
  const [stats, setStats] = useState<ScanDebugStats | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Update stats when visible or when data changes
  useEffect(() => {
    if (visible) {
      updateStats();

      if (autoRefresh) {
        timerRef.current = setInterval(updateStats, 1000);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [visible, autoRefresh, frames.length, pointCloud.length, mesh, stage]);

  const updateStats = () => {
    setStats(getScanDebugStats());
  };

  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Scan Debug Data</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Current State */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Current State</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Stage:</Text>
              <Text style={styles.infoValue}>{stage}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Processing:</Text>
              <Text style={styles.infoValue}>
                {processingStatus.stage} ({processingStatus.progress}%)
              </Text>
            </View>
            {error && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Error:</Text>
                <Text style={[styles.infoValue, styles.errorText]}>
                  {error}
                </Text>
              </View>
            )}
          </View>

          {/* Frame Data */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Capture Data</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Frames:</Text>
              <Text style={styles.infoValue}>{frames.length}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Point Cloud:</Text>
              <Text style={styles.infoValue}>{pointCloud.length} points</Text>
            </View>

            {stats && (
              <>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Duration:</Text>
                  <Text style={styles.infoValue}>
                    {(stats.captureTimeRange.durationMs / 1000).toFixed(2)}s
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Avg Frame Interval:</Text>
                  <Text style={styles.infoValue}>
                    {stats.averageFrameInterval.toFixed(2)}ms
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Device Stability:</Text>
                  <Text style={styles.infoValue}>
                    {stats.deviceStability.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Tracking Quality:</Text>
                  <Text style={styles.infoValue}>{stats.trackingQuality}</Text>
                </View>
              </>
            )}
          </View>

          {/* Mesh Data */}
          {mesh && stats?.meshStats && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Mesh Data</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Vertices:</Text>
                <Text style={styles.infoValue}>
                  {stats.meshStats.vertices.toLocaleString()}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Faces:</Text>
                <Text style={styles.infoValue}>
                  {stats.meshStats.faces.toLocaleString()}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Has Normals:</Text>
                <Text style={styles.infoValue}>
                  {stats.meshStats.hasNormals ? "Yes" : "No"}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Has UVs:</Text>
                <Text style={styles.infoValue}>
                  {stats.meshStats.hasUVs ? "Yes" : "No"}
                </Text>
              </View>
            </View>
          )}

          {/* Frame Sample */}
          {frames.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Last Frame Sample</Text>
              <View style={styles.codeBlock}>
                <Text style={styles.codeText}>
                  {`Frame ID: ${frames[frames.length - 1].id}\n`}
                  {`Timestamp: ${new Date(
                    frames[frames.length - 1].timestamp
                  ).toLocaleTimeString()}\n`}
                  {`Points: ${frames[frames.length - 1].points.length}\n`}
                  {`Camera Position: (${frames[
                    frames.length - 1
                  ].cameraPosition.x.toFixed(2)}, ${frames[
                    frames.length - 1
                  ].cameraPosition.y.toFixed(2)}, ${frames[
                    frames.length - 1
                  ].cameraPosition.z.toFixed(2)})\n`}
                </Text>
              </View>
            </View>
          )}

          {/* Point Cloud Sample */}
          {pointCloud.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Point Cloud Sample</Text>
              <View style={styles.codeBlock}>
                <Text style={styles.codeText}>
                  {`Total Points: ${pointCloud.length}\n`}
                  {pointCloud
                    .slice(0, 3)
                    .map(
                      (point, i) =>
                        `Point ${i}: (${point.position.x.toFixed(
                          2
                        )}, ${point.position.y.toFixed(
                          2
                        )}, ${point.position.z.toFixed(2)})\n` +
                        `${
                          point.normal
                            ? `Normal: (${point.normal.x.toFixed(
                                2
                              )}, ${point.normal.y.toFixed(
                                2
                              )}, ${point.normal.z.toFixed(2)})\n`
                            : ""
                        }` +
                        `${
                          point.confidence
                            ? `Confidence: ${point.confidence.toFixed(2)}\n`
                            : ""
                        }`
                    )
                    .join("\n")}
                  {pointCloud.length > 3 ? "..." : ""}
                </Text>
              </View>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            title="Refresh"
            onPress={updateStats}
            variant="secondary"
            size="small"
            style={styles.footerButton}
          />
          <Button
            title={autoRefresh ? "Auto-Refresh: ON" : "Auto-Refresh: OFF"}
            onPress={toggleAutoRefresh}
            variant={autoRefresh ? "primary" : "secondary"}
            size="small"
            style={styles.footerButton}
          />
        </View>
      </View>
    </Modal>
  );
};

const { width, height } = Dimensions.get("window");

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    marginTop: Platform.OS === "ios" ? 40 : 0,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    color: "#4a80f5",
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  section: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#333",
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  infoLabel: {
    color: "#aaa",
    fontSize: 14,
  },
  infoValue: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
    maxWidth: width * 0.5,
  },
  errorText: {
    color: "#ff3b30",
  },
  codeBlock: {
    backgroundColor: "#000",
    padding: 12,
    borderRadius: 6,
  },
  codeText: {
    color: "#ddd",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 12,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(18, 18, 18, 0.9)",
    flexDirection: "row",
    justifyContent: "space-around",
    padding: 16,
    paddingBottom: Platform.OS === "ios" ? 30 : 16,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  footerButton: {
    flex: 1,
    marginHorizontal: 8,
  },
});

export default ScanDebugView;
