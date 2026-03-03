#!/usr/bin/env node

/**
 * react-native-github-ota CLI initialiser.
 *
 * Usage:
 *   npx github-ota-init
 *
 * What it does:
 *   1. Copies the OTA GitHub Actions workflow into .github/workflows/ota-bundle.yml
 *   2. Adds the embed-commit script reference to package.json
 *   3. Adds the Expo config plugin to app.json (handles native code automatically)
 *   4. For bare RN projects (no Expo): patches MainApplication.kt directly
 */

const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();

// ─── 1. Copy workflow ────────────────────────────────────────────────────────

const workflowSource = path.join(__dirname, "..", "workflow", "ota-bundle.yml");
const workflowDir = path.join(projectRoot, ".github", "workflows");
const workflowDest = path.join(workflowDir, "ota-bundle.yml");

if (!fs.existsSync(workflowSource)) {
  console.error(
    "❌ Could not find workflow template. Is the package installed correctly?",
  );
  process.exit(1);
}

if (fs.existsSync(workflowDest)) {
  console.log(
    "⚠️  .github/workflows/ota-bundle.yml already exists — skipping.",
  );
} else {
  fs.mkdirSync(workflowDir, { recursive: true });
  fs.copyFileSync(workflowSource, workflowDest);
  console.log("✅ Created .github/workflows/ota-bundle.yml");
}

// ─── 2. Ensure embed-commit script in package.json ───────────────────────────

const pkgPath = path.join(projectRoot, "package.json");
if (fs.existsSync(pkgPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const embedCmd =
      "node node_modules/react-native-github-ota/scripts/embed-commit.js";
    let changed = false;

    if (!pkg.scripts) pkg.scripts = {};

    if (!pkg.scripts["embed-commit"]) {
      pkg.scripts["embed-commit"] = embedCmd;
      changed = true;
      console.log('✅ Added "embed-commit" script to package.json');
    }

    // Prepend to prebuild if it exists and doesn't already include embed-commit
    if (
      pkg.scripts.prebuild &&
      !pkg.scripts.prebuild.includes("embed-commit")
    ) {
      pkg.scripts.prebuild = `${embedCmd} && ${pkg.scripts.prebuild}`;
      changed = true;
      console.log('✅ Prepended embed-commit to "prebuild" script');
    } else if (!pkg.scripts.prebuild) {
      pkg.scripts.prebuild = `${embedCmd} && npx expo prebuild`;
      changed = true;
      console.log('✅ Added "prebuild" script with embed-commit');
    }

    if (changed) {
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
    } else {
      console.log("ℹ️  package.json scripts already configured — no changes.");
    }
  } catch (err) {
    console.error("⚠️  Could not update package.json:", err.message);
  }
} else {
  console.log("⚠️  No package.json found in current directory.");
}

// ─── 3. Add config plugin to app.json (Expo projects) ───────────────────────

const appJsonPath = path.join(projectRoot, "app.json");
const appConfigPath = path.join(projectRoot, "app.config.js");
let pluginAdded = false;

if (fs.existsSync(appJsonPath)) {
  try {
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
    const expo = appJson.expo || appJson;

    if (!expo.plugins) expo.plugins = [];

    const alreadyHasPlugin = expo.plugins.some(
      (p) =>
        p === "react-native-github-ota" ||
        (Array.isArray(p) && p[0] === "react-native-github-ota"),
    );

    if (alreadyHasPlugin) {
      console.log(
        "ℹ️  react-native-github-ota plugin already in app.json — skipping.",
      );
      pluginAdded = true;
    } else {
      expo.plugins.push("react-native-github-ota");
      fs.writeFileSync(
        appJsonPath,
        JSON.stringify(appJson, null, 2) + "\n",
        "utf-8",
      );
      console.log("✅ Added react-native-github-ota plugin to app.json");
      console.log(
        "   The native code will be applied automatically on next `expo prebuild`.",
      );
      pluginAdded = true;
    }
  } catch (err) {
    console.error("⚠️  Could not update app.json:", err.message);
  }
} else if (fs.existsSync(appConfigPath)) {
  console.log(
    '⚠️  Detected app.config.js — please add "react-native-github-ota" to your plugins array manually.',
  );
} else {
  console.log(
    "ℹ️  No app.json found — this may be a bare React Native project.",
  );
}

// ─── 4. Patch MainApplication.kt directly (bare RN projects without Expo) ──

if (!pluginAdded) {
  const OTA_IMPORT = "import java.io.File";
  const OTA_METHOD = `          override fun getJSBundleFile(): String? {
            val otaBundle = File(applicationContext.filesDir, "ota/index.android.bundle")
            if (!otaBundle.exists()) return null

            // If the APK was updated after the OTA bundle was downloaded, the OTA is stale
            try {
              val appInfo = applicationContext.packageManager.getPackageInfo(applicationContext.packageName, 0)
              if (appInfo.lastUpdateTime > otaBundle.lastModified()) {
                otaBundle.delete()
                File(applicationContext.filesDir, "ota/meta.json").delete()
                return null
              }
            } catch (_: Exception) {}

            return otaBundle.absolutePath
          }`;

  /**
   * Recursively find MainApplication.kt under android/
   */
  function findMainApplication(dir) {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findMainApplication(full);
        if (found) return found;
      } else if (entry.name === "MainApplication.kt") {
        return full;
      }
    }
    return null;
  }

  const androidDir = path.join(projectRoot, "android");
  const mainAppFile = findMainApplication(androidDir);

  if (mainAppFile) {
    let content = fs.readFileSync(mainAppFile, "utf-8");

    if (content.includes("getJSBundleFile")) {
      console.log(
        "ℹ️  MainApplication.kt already has getJSBundleFile — skipping patch.",
      );
    } else {
      let patched = false;

      // Add import for java.io.File if missing
      if (!content.includes("import java.io.File")) {
        content = content.replace(
          /(import\s+.*\n)(\s*\n*class\s)/,
          `$1${OTA_IMPORT}\n\n$2`,
        );
      }

      // Insert getJSBundleFile() after getUseDeveloperSupport()
      const insertAfterPattern =
        /(override\s+fun\s+getUseDeveloperSupport\(\)\s*:\s*Boolean\s*=\s*BuildConfig\.DEBUG\s*\n)/;
      if (insertAfterPattern.test(content)) {
        content = content.replace(insertAfterPattern, `$1\n${OTA_METHOD}\n`);
        patched = true;
      }

      // Fallback: insert after getJSMainModuleName()
      if (!patched) {
        const fallbackPattern =
          /(override\s+fun\s+getJSMainModuleName\(\)\s*:\s*String\s*=\s*[^\n]+\n)/;
        if (fallbackPattern.test(content)) {
          content = content.replace(fallbackPattern, `$1\n${OTA_METHOD}\n`);
          patched = true;
        }
      }

      if (patched) {
        fs.writeFileSync(mainAppFile, content, "utf-8");
        console.log("✅ Patched MainApplication.kt with OTA bundle loading");
      } else {
        console.log(
          "⚠️  Could not auto-patch MainApplication.kt — see README for manual instructions.",
        );
      }
    }
  } else {
    console.log(
      "⚠️  No android/ directory found. Run `npx expo prebuild` or apply native changes manually.",
    );
  }
} else {
  console.log(
    "ℹ️  Config plugin will handle native setup — skipping direct MainApplication.kt patching.",
  );
}

// ─── 5. Summary ──────────────────────────────────────────────────────────────

console.log(
  "\n🎉 react-native-github-ota initialised!\n" +
    "\nNext steps:\n" +
    (pluginAdded
      ? "  1. Run `npx expo prebuild` to apply the native changes\n"
      : "") +
    '  2. Call configureOta({ owner: "you", repo: "your-repo" }) in your app\n' +
    "  3. Use the useGithubOta hook or OtaUpdateBanner component\n" +
    "  4. Push to main — the workflow will build & upload OTA bundles automatically\n",
);
