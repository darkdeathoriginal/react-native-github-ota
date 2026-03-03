/**
 * Expo Config Plugin for react-native-github-ota.
 *
 * Automatically patches MainApplication.kt during `expo prebuild`
 * to load downloaded OTA bundles on app startup.
 *
 * Usage in app.json / app.config.js:
 *   "plugins": ["react-native-github-ota"]
 */

const { withMainApplication } = require("@expo/config-plugins");

const OTA_IMPORT = "import java.io.File";

const OTA_METHOD = [
  "",
  "          override fun getJSBundleFile(): String? {",
  '            val otaBundle = File(applicationContext.filesDir, "ota/index.android.bundle")',
  "            return if (otaBundle.exists()) otaBundle.absolutePath else null",
  "          }",
].join("\n");

function withOtaBundleLoader(config) {
  return withMainApplication(config, (mod) => {
    let contents = mod.modResults.contents;

    // Skip if already patched
    if (contents.includes("getJSBundleFile")) {
      return mod;
    }

    // Add import for java.io.File if missing
    if (!contents.includes(OTA_IMPORT)) {
      contents = contents.replace(
        /(import\s+[^\n]+\n)(\s*\n*class\s)/,
        `$1${OTA_IMPORT}\n\n$2`,
      );
    }

    // Insert getJSBundleFile() after getUseDeveloperSupport()
    const primaryPattern =
      /(override\s+fun\s+getUseDeveloperSupport\(\)\s*:\s*Boolean\s*=\s*BuildConfig\.DEBUG\s*\n)/;
    if (primaryPattern.test(contents)) {
      contents = contents.replace(primaryPattern, `$1${OTA_METHOD}\n`);
    } else {
      // Fallback: insert after getJSMainModuleName()
      const fallbackPattern =
        /(override\s+fun\s+getJSMainModuleName\(\)\s*:\s*String\s*=\s*[^\n]+\n)/;
      if (fallbackPattern.test(contents)) {
        contents = contents.replace(fallbackPattern, `$1${OTA_METHOD}\n`);
      } else {
        console.warn(
          "[react-native-github-ota] Could not auto-patch MainApplication.kt — see README for manual instructions.",
        );
        return mod;
      }
    }

    mod.modResults.contents = contents;
    return mod;
  });
}

module.exports = withOtaBundleLoader;
