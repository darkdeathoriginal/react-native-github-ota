import { useCallback, useEffect, useState } from "react";
import { Alert, BackHandler } from "react-native";
import {
  BuildInfo,
  checkForUpdate,
  downloadOtaBundle,
  UpdateInfo,
} from "./core";

export interface UseGithubOtaOptions {
  /** Whether to auto-check when the hook mounts (default: true). */
  autoCheckOnMount?: boolean;
  /**
   * Build info containing the current commit hash.
   * Generate this with the provided `embed-commit.js` script.
   */
  buildInfo: BuildInfo;
  /**
   * Optional callback to determine whether auto-update is enabled.
   * When provided, the hook calls this on mount and skips auto-check if it
   * returns `false`. Return a promise if reading from AsyncStorage / etc.
   */
  shouldAutoCheck?: () => boolean | Promise<boolean>;
}

export function useGithubOta(options: UseGithubOtaOptions) {
  const { autoCheckOnMount = true, buildInfo, shouldAutoCheck } = options;

  const activeBuildInfo = buildInfo;

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  // ── Check ───────────────────────────────────────────────────────────────

  const checkUpdate = useCallback(
    async (manual = false) => {
      try {
        setIsChecking(true);
        setError(null);
        if (manual) setStatus("Checking for updates...");

        const result = await checkForUpdate(activeBuildInfo.commitHash);

        setLastChecked(Date.now());

        if (result.error) {
          throw new Error(result.error);
        }

        if (result.upToDate) {
          handleUpToDate(manual);
          return;
        }

        if (result.updateInfo) {
          setUpdateInfo(result.updateInfo);
          setStatus("Update Available");
          setIsAvailable(true);
        }
      } catch (err: any) {
        const msg = err?.message ?? "Unknown error";
        console.log("[github-ota] check error:", msg);
        if (manual) setStatus(`Update check failed: ${msg}`);
        setError(msg);
        setTimeout(() => {
          setStatus(null);
          setError(null);
        }, 5000);
      } finally {
        setIsChecking(false);
      }
    },
    [activeBuildInfo.commitHash],
  );

  const handleUpToDate = (manual: boolean) => {
    if (manual) {
      setStatus("You're up to date!");
      setTimeout(() => setStatus(null), 3000);
    } else {
      setStatus(null);
    }
    setIsAvailable(false);
    setUpdateInfo(null);
  };

  // ── Download & Apply ────────────────────────────────────────────────────

  const downloadAndApplyUpdate = useCallback(async () => {
    if (!updateInfo) return;

    try {
      setIsDownloading(true);
      setDownloadProgress(0);
      setStatus("Downloading update...");

      await downloadOtaBundle(updateInfo);

      setDownloadProgress(100);
      setIsDownloading(false);
      setStatus("Update installed! Restart to apply.");
      setIsAvailable(false);

      Alert.alert(
        "Update Installed",
        "The update has been downloaded. Close and reopen the app to apply the changes.",
        [
          { text: "Later", style: "cancel" },
          { text: "Close App", onPress: () => BackHandler.exitApp() },
        ],
      );
    } catch (err: any) {
      const msg = err?.message ?? "Download failed";
      console.log("[github-ota] download error:", msg);
      setStatus(`Download failed: ${msg}`);
      setError(msg);
      setIsDownloading(false);
      setTimeout(() => {
        setStatus(updateInfo ? "Update Available" : null);
        setError(null);
      }, 5000);
    }
  }, [updateInfo]);

  // ── Auto-check on mount ─────────────────────────────────────────────────

  useEffect(() => {
    if (!autoCheckOnMount) return;

    async function init() {
      if (shouldAutoCheck) {
        const ok = await shouldAutoCheck();
        if (!ok) return;
      }
      checkUpdate(false);
    }

    init();
  }, [checkUpdate, autoCheckOnMount, shouldAutoCheck]);

  return {
    status,
    error,
    isAvailable,
    lastChecked,
    isChecking,
    isDownloading,
    downloadProgress,
    updateInfo,
    checkUpdate,
    downloadAndApplyUpdate,
    setStatus,
    buildInfo: activeBuildInfo,
  };
}
