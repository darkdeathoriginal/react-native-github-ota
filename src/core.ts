import * as FileSystem from "expo-file-system/legacy";

// ─── Configuration ──────────────────────────────────────────────────────────

export interface OtaConfig {
  /** GitHub repository owner (e.g. "octocat") */
  owner: string;
  /** GitHub repository name */
  repo: string;
  /** Branch to compare against (default: "main") */
  branch?: string;
  /** Release tag containing the OTA bundle (default: "ota-latest") */
  releaseTag?: string;
  /** Bundle asset filename in the release (default: "index.android.bundle") */
  bundleFileName?: string;
  /** AsyncStorage key for persisted settings (default: "@github_ota_settings") */
  autoSettingsKey?: string;
}

const DEFAULTS = {
  branch: "main",
  releaseTag: "ota-latest",
  bundleFileName: "index.android.bundle",
  autoSettingsKey: "@github_ota_settings",
} as const;

let _config: Required<OtaConfig> | null = null;

/**
 * Set the package-level OTA configuration.
 * Must be called once before using the hook.
 */
export function configureOta(config: OtaConfig): void {
  _config = {
    branch: config.branch ?? DEFAULTS.branch,
    releaseTag: config.releaseTag ?? DEFAULTS.releaseTag,
    bundleFileName: config.bundleFileName ?? DEFAULTS.bundleFileName,
    autoSettingsKey: config.autoSettingsKey ?? DEFAULTS.autoSettingsKey,
    owner: config.owner,
    repo: config.repo,
  };
}

export function getOtaConfig(): Required<OtaConfig> {
  if (!_config) {
    throw new Error(
      "[react-native-github-ota] configureOta() must be called before using the OTA hook.",
    );
  }
  return _config;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BuildInfo {
  commitHash: string;
  commitShort: string;
  branch: string;
  commitDate: string;
  commitMessage: string;
  buildTime: string;
}

export interface GitCommit {
  sha: string;
  commit: {
    message: string;
    author: { date: string };
  };
}

export interface CompareResponse {
  status: "ahead" | "behind" | "identical" | "diverged";
  ahead_by: number;
  behind_by: number;
  total_commits: number;
  commits: GitCommit[];
}

export interface OtaManifest {
  commitHash: string;
  commitShort: string;
  commitMessage: string;
  createdAt: string;
  bundleFile: string;
}

export interface GitReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface GitRelease {
  tag_name: string;
  html_url: string;
  assets: GitReleaseAsset[];
}

export interface UpdateInfo {
  latestCommit: string;
  latestCommitShort: string;
  commitMessage: string;
  commitDate: string;
  newCommitCount: number;
  hasOtaBundle: boolean;
}

// ─── File-system helpers ────────────────────────────────────────────────────

function otaDir(): string {
  return `${FileSystem.documentDirectory}ota/`;
}

function otaBundlePath(): string {
  return `${otaDir()}index.android.bundle`;
}

function otaMetaPath(): string {
  return `${otaDir()}meta.json`;
}

export async function getAppliedOtaMeta(): Promise<OtaManifest | null> {
  try {
    const info = await FileSystem.getInfoAsync(otaMetaPath());
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(otaMetaPath());
      return JSON.parse(content);
    }
  } catch {
    // no meta file
  }
  return null;
}

export async function saveOtaMeta(meta: OtaManifest): Promise<void> {
  await FileSystem.writeAsStringAsync(otaMetaPath(), JSON.stringify(meta));
}

// ─── Core check / download logic ───────────────────────────────────────────

export interface CheckUpdateResult {
  upToDate: boolean;
  updateInfo?: UpdateInfo;
  error?: string;
}

/**
 * Check whether a newer commit exists on the configured branch.
 */
export async function checkForUpdate(
  currentSha: string,
): Promise<CheckUpdateResult> {
  const cfg = getOtaConfig();

  try {
    const appliedOta = await getAppliedOtaMeta();

    let latestSha: string;
    let commitMessage: string;
    let commitDate: string;
    let newCommitCount = 0;

    const compareRes = await fetch(
      `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/compare/${currentSha}...${cfg.branch}`,
      { headers: { Accept: "application/vnd.github.v3+json" } },
    );

    if (compareRes.ok) {
      const data: CompareResponse = await compareRes.json();
      if (data.status !== "ahead" && data.status !== "diverged") {
        return { upToDate: true };
      }
      const latest = data.commits[data.commits.length - 1];
      latestSha = latest.sha;
      commitMessage = latest.commit.message.split("\n")[0];
      commitDate = latest.commit.author.date;
      newCommitCount = data.ahead_by;
    } else {
      // Fallback: HEAD check
      const headRes = await fetch(
        `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/commits/${cfg.branch}`,
        { headers: { Accept: "application/vnd.github.v3+json" } },
      );
      if (!headRes.ok) {
        throw new Error(`GitHub API error: ${headRes.status}`);
      }
      const headData: GitCommit = await headRes.json();
      if (headData.sha === currentSha) {
        return { upToDate: true };
      }
      latestSha = headData.sha;
      commitMessage = headData.commit.message.split("\n")[0];
      commitDate = headData.commit.author.date;
    }

    // Already applied?
    if (appliedOta && appliedOta.commitHash === latestSha) {
      return { upToDate: true };
    }

    // Check whether an OTA bundle exists in the release
    let hasOtaBundle = false;
    try {
      const releaseRes = await fetch(
        `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases/tags/${cfg.releaseTag}`,
        { headers: { Accept: "application/vnd.github.v3+json" } },
      );
      if (releaseRes.ok) {
        const releaseData: GitRelease = await releaseRes.json();
        hasOtaBundle = releaseData.assets.some(
          (a) => a.name === cfg.bundleFileName,
        );
      }
    } catch {
      // no release
    }

    return {
      upToDate: false,
      updateInfo: {
        latestCommit: latestSha,
        latestCommitShort: latestSha.slice(0, 7),
        commitMessage,
        commitDate,
        newCommitCount,
        hasOtaBundle,
      },
    };
  } catch (err: any) {
    return { upToDate: false, error: err?.message ?? "Unknown error" };
  }
}

/**
 * Download the OTA bundle & manifest from the configured GitHub Release.
 */
export async function downloadOtaBundle(updateInfo: UpdateInfo): Promise<void> {
  const cfg = getOtaConfig();

  const releaseRes = await fetch(
    `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases/tags/${cfg.releaseTag}`,
    { headers: { Accept: "application/vnd.github.v3+json" } },
  );
  if (!releaseRes.ok) {
    throw new Error("OTA release not found. Push to main to trigger a build.");
  }

  const releaseData: GitRelease = await releaseRes.json();
  const bundleAsset = releaseData.assets.find(
    (a) => a.name === cfg.bundleFileName,
  );
  const manifestAsset = releaseData.assets.find(
    (a) => a.name === "ota-manifest.json",
  );

  if (!bundleAsset) {
    throw new Error("No bundle found in OTA release");
  }

  // Ensure directory
  const dirInfo = await FileSystem.getInfoAsync(otaDir());
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(otaDir(), { intermediates: true });
  }

  // Download bundle
  const downloadResult = await FileSystem.downloadAsync(
    bundleAsset.browser_download_url,
    otaBundlePath(),
  );
  if (downloadResult.status !== 200) {
    throw new Error(`Bundle download failed: HTTP ${downloadResult.status}`);
  }

  // Download or create manifest
  if (manifestAsset) {
    const manifestResult = await FileSystem.downloadAsync(
      manifestAsset.browser_download_url,
      otaMetaPath(),
    );
    if (manifestResult.status !== 200) {
      await saveBasicMeta(updateInfo);
    }
  } else {
    await saveBasicMeta(updateInfo);
  }
}

async function saveBasicMeta(updateInfo: UpdateInfo): Promise<void> {
  const meta: OtaManifest = {
    commitHash: updateInfo.latestCommit,
    commitShort: updateInfo.latestCommitShort,
    commitMessage: updateInfo.commitMessage,
    createdAt: new Date().toISOString(),
    bundleFile: "index.android.bundle",
  };
  await saveOtaMeta(meta);
}
