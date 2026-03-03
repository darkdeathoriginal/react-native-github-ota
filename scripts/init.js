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
  console.log("⚠️  .github/workflows/ota-bundle.yml already exists — skipping.");
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

// ─── 3. Summary ──────────────────────────────────────────────────────────────

console.log(
  "\n🎉 react-native-github-ota initialised!\n" +
    "\nNext steps:\n" +
    '  1. Call configureOta({ owner: "you", repo: "your-repo" }) in your app\n' +
    "  2. Use the useGithubOta hook or OtaUpdateBanner component\n" +
    "  3. Push to main — the workflow will build & upload OTA bundles automatically\n",
);
