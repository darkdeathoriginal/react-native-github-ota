import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { UpdateInfo } from "./core";

export interface OtaBannerColors {
  surface?: string;
  text?: string;
  textSecondary?: string;
  primary?: string;
  danger?: string;
  border?: string;
}

export interface OtaUpdateBannerProps {
  status: string | null;
  error: string | null;
  updateInfo: UpdateInfo | null;
  isDownloading?: boolean;
  onDownload: () => void;
  onClose: () => void;
  visible: boolean;
  /** Optional colour overrides for theming. */
  colors?: OtaBannerColors;
}

const DEFAULTS: Required<OtaBannerColors> = {
  surface: "#1a1a1a",
  text: "#ffffff",
  textSecondary: "#a1a1aa",
  primary: "#3b82f6",
  danger: "#ef4444",
  border: "#27272a",
};

export function OtaUpdateBanner({
  status,
  error,
  updateInfo,
  isDownloading,
  onDownload,
  onClose,
  visible,
  colors: colorsProp,
}: OtaUpdateBannerProps) {
  if (!status || !visible) return null;

  const c = { ...DEFAULTS, ...colorsProp };

  const isDownloadingOrApplying =
    isDownloading ||
    status === "Downloading update..." ||
    status === "Downloading bundle..." ||
    status === "Update downloaded! Restarting..." ||
    status === "Update installed! Restart to apply.";

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: c.surface, borderColor: c.border },
      ]}
    >
      {/* Close Button */}
      {!isDownloadingOrApplying && (
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={[styles.closeButtonText, { color: c.textSecondary }]}>
            ✕
          </Text>
        </TouchableOpacity>
      )}

      <Text style={[styles.statusText, { color: c.text }]}>{status}</Text>

      {updateInfo && !isDownloadingOrApplying && (
        <>
          <Text
            style={[styles.commitText, { color: c.primary }]}
            numberOfLines={1}
          >
            {updateInfo.latestCommitShort}: {updateInfo.commitMessage}
          </Text>
          <Text style={[styles.metaText, { color: c.textSecondary }]}>
            {updateInfo.newCommitCount > 0
              ? `${updateInfo.newCommitCount} new commit${updateInfo.newCommitCount > 1 ? "s" : ""}`
              : "New changes available"}
            {updateInfo.hasOtaBundle ? " · OTA ready" : ""}
          </Text>
        </>
      )}

      {isDownloadingOrApplying && (
        <ActivityIndicator
          color={c.primary}
          size="small"
          style={{ marginTop: 8 }}
        />
      )}

      {error && (
        <Text style={[styles.errorText, { color: c.danger }]}>{error}</Text>
      )}

      {status === "Update Available" && (
        <TouchableOpacity
          onPress={onDownload}
          style={[styles.reloadButton, { backgroundColor: c.primary }]}
          disabled={isDownloading}
        >
          <Text style={styles.reloadButtonText}>
            {updateInfo?.hasOtaBundle
              ? "Install Update (OTA)"
              : "Install Update"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 30,
    left: 20,
    right: 20,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  closeButton: {
    position: "absolute",
    top: 8,
    right: 10,
    padding: 4,
    zIndex: 1,
  },
  closeButtonText: {
    fontSize: 16,
  },
  statusText: {
    fontWeight: "bold",
    marginBottom: 4,
  },
  commitText: {
    fontSize: 12,
    marginTop: 2,
  },
  metaText: {
    fontSize: 11,
    marginTop: 2,
  },
  errorText: {
    fontSize: 11,
    marginTop: 6,
  },
  reloadButton: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  reloadButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
});
