// Core configuration & types
export {
  checkForUpdate,
  configureOta,
  downloadOtaBundle,
  getAppliedOtaMeta,
  getOtaConfig,
  saveOtaMeta,
} from "./core";

export type {
  BuildInfo,
  CheckUpdateResult,
  CompareResponse,
  GitCommit,
  GitRelease,
  GitReleaseAsset,
  OtaConfig,
  OtaManifest,
  UpdateInfo,
} from "./core";

// React hook
export { useGithubOta } from "./useGithubOta";
export type { UseGithubOtaOptions } from "./useGithubOta";

// UI component
export { OtaUpdateBanner } from "./OtaUpdateBanner";
export type { OtaBannerColors, OtaUpdateBannerProps } from "./OtaUpdateBanner";
