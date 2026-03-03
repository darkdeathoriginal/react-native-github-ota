# react-native-github-ota

GitHub-based OTA (Over-The-Air) updates for React Native / Expo apps.

Downloads JS bundles from a GitHub Release (`ota-latest` tag) and applies them on next app restart — no app-store review needed.

## How It Works

1. A GitHub Action builds your JS bundle on every push to `main` and uploads it to a GitHub Release tagged `ota-latest`.
2. This library compares the current build commit with the remote branch using the GitHub API.
3. When an update is available, it downloads the bundle to the device and prompts the user to restart.
4. On next launch, your native bootstrap code loads the downloaded bundle instead of the built-in one.

## Installation

```bash
npm install react-native-github-ota
# or
yarn add react-native-github-ota
```

### Peer Dependencies

Make sure these are installed in your project:

- `expo-file-system` (>= 16)
- `react` (>= 18)
- `react-native` (>= 0.72)

## Quick Start

Run the init command to set everything up automatically:

```bash
npx github-ota-init
```

This will:

1. Copy the GitHub Actions workflow into `.github/workflows/ota-bundle.yml`
2. Add `embed-commit` and `prebuild` scripts to your `package.json`
3. **Add the config plugin** to your `app.json` — native code is applied automatically on `expo prebuild`
4. For bare RN projects (no Expo): patches `MainApplication.kt` directly

After running init, rebuild your native project:

```bash
npx expo prebuild --clean
```

### Native Code — Handled Automatically

The library ships an **Expo Config Plugin** that automatically patches `MainApplication.kt` during `expo prebuild`. No manual native code changes needed.

**For Expo projects:** Just add the plugin to your `app.json` (the init command does this for you):

```json
{
  "expo": {
    "plugins": ["react-native-github-ota"]
  }
}
```

**For bare React Native projects:** The init command patches `MainApplication.kt` directly. If you need to do it manually, add this:

```kotlin
import java.io.File

// Inside your DefaultReactNativeHost object, add:
override fun getJSBundleFile(): String? {
    val otaBundle = File(applicationContext.filesDir, "ota/index.android.bundle")
    return if (otaBundle.exists()) otaBundle.absolutePath else null
}
```

This tells React Native: "if an OTA bundle exists on disk, load it; otherwise use the built-in one from the APK."

### Manual Setup

If you prefer to set things up manually:

#### 1. Embed Build Info (required)

Before each build, run the embed-commit script to stamp the current git SHA into your app:

```bash
node node_modules/react-native-github-ota/scripts/embed-commit.js
```

Or add it to your build scripts:

```json
{
  "scripts": {
    "embed-commit": "node node_modules/react-native-github-ota/scripts/embed-commit.js",
    "prebuild": "node node_modules/react-native-github-ota/scripts/embed-commit.js && npx expo prebuild"
  }
}
```

The script creates/updates a `constants/buildInfo.ts` file in your project root.

#### 2. Add the GitHub Actions Workflow

Copy the workflow template to your project:

```bash
mkdir -p .github/workflows
cp node_modules/react-native-github-ota/workflow/ota-bundle.yml .github/workflows/
```

Or create `.github/workflows/ota-bundle.yml` manually — see [workflow/ota-bundle.yml](workflow/ota-bundle.yml) for the full template.

**What the workflow does:**

- Triggers on every push to `main`
- Installs dependencies and embeds the commit hash
- Runs `react-native bundle` to create the JS bundle
- Creates an `ota-manifest.json` with commit metadata
- Uploads both files to a GitHub Release tagged `ota-latest`

> **Note:** The workflow uses `GITHUB_TOKEN` which is automatically provided by GitHub Actions — no extra secrets needed.

## Usage

### Configure

Call `configureOta` once at app startup (e.g. in your root layout):

```ts
import { configureOta } from "react-native-github-ota";

configureOta({
  owner: "your-github-username",
  repo: "your-repo-name",
  branch: "main", // optional, default "main"
  releaseTag: "ota-latest", // optional, default "ota-latest"
  bundleFileName: "index.android.bundle", // optional
});
```

### Hook

```tsx
import { useGithubOta } from "react-native-github-ota";
import { BUILD_INFO } from "./constants/buildInfo";

function MyComponent() {
  const {
    status,
    error,
    updateInfo,
    isChecking,
    isDownloading,
    checkUpdate,
    downloadAndApplyUpdate,
    buildInfo,
  } = useGithubOta({
    autoCheckOnMount: true,
    buildInfo: BUILD_INFO,
    // Optional: control auto-check with your own settings
    shouldAutoCheck: async () => {
      // e.g. read from AsyncStorage
      return true;
    },
  });

  // ...
}
```

### Pre-built Banner

```tsx
import { OtaUpdateBanner } from "react-native-github-ota";

<OtaUpdateBanner
  visible={bannerVisible}
  status={status}
  error={error}
  updateInfo={updateInfo}
  isDownloading={isDownloading}
  onDownload={downloadAndApplyUpdate}
  onClose={() => setBannerVisible(false)}
  // Optional theme overrides:
  colors={{
    surface: "#1a1a1a",
    text: "#ffffff",
    textSecondary: "#a1a1aa",
    primary: "#3b82f6",
    danger: "#ef4444",
    border: "#27272a",
  }}
/>;
```

## API

### `configureOta(config)`

| Option            | Type     | Default                  | Description                           |
| ----------------- | -------- | ------------------------ | ------------------------------------- |
| `owner`           | `string` | **required**             | GitHub repository owner               |
| `repo`            | `string` | **required**             | GitHub repository name                |
| `branch`          | `string` | `"main"`                 | Branch to compare against             |
| `releaseTag`      | `string` | `"ota-latest"`           | Release tag containing the OTA bundle |
| `bundleFileName`  | `string` | `"index.android.bundle"` | Bundle asset filename in the release  |
| `autoSettingsKey` | `string` | `"@github_ota_settings"` | AsyncStorage key for settings         |

### `useGithubOta(options)`

| Option             | Type                                | Default      | Description                               |
| ------------------ | ----------------------------------- | ------------ | ----------------------------------------- |
| `buildInfo`        | `BuildInfo`                         | **required** | Build info from embed-commit script       |
| `autoCheckOnMount` | `boolean`                           | `true`       | Auto-check for updates on mount           |
| `shouldAutoCheck`  | `() => boolean \| Promise<boolean>` | —            | Guard for auto-check (e.g. user settings) |

**Returns:**

| Field                    | Type                          | Description                        |
| ------------------------ | ----------------------------- | ---------------------------------- |
| `status`                 | `string \| null`              | Current status message             |
| `error`                  | `string \| null`              | Error message if any               |
| `isAvailable`            | `boolean`                     | Whether an update is available     |
| `isChecking`             | `boolean`                     | Currently checking for updates     |
| `isDownloading`          | `boolean`                     | Currently downloading              |
| `downloadProgress`       | `number`                      | Download progress (0-100)          |
| `updateInfo`             | `UpdateInfo \| null`          | Details about the available update |
| `lastChecked`            | `number \| null`              | Timestamp of last check            |
| `checkUpdate`            | `(manual?: boolean) => void`  | Trigger an update check            |
| `downloadAndApplyUpdate` | `() => void`                  | Download and install the update    |
| `setStatus`              | `(s: string \| null) => void` | Override status message            |
| `buildInfo`              | `BuildInfo`                   | The build info passed in           |

### `OtaUpdateBanner`

A ready-made banner component. Accepts theme `colors` for dark/light mode support.

### `npx github-ota-init`

CLI command that scaffolds the GitHub Actions workflow, build scripts, config plugin, and native setup into your project. For Expo projects it adds the config plugin to `app.json`; for bare RN projects it patches `MainApplication.kt` directly.

## License

MIT
