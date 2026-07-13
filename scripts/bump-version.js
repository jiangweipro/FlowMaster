const fs = require('fs');
const path = require('path');

/**
 * Bump the patch version in package.json with carry.
 * Format: major.minor.patch
 * 0.1.0 -> 0.1.1, 0.1.9 -> 0.2.0, 0.9.9 -> 1.0.0
 */
function bumpVersion(version) {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid version format: ${version}`);
  }

  let [major, minor, patch] = parts;
  patch += 1;
  if (patch >= 10) {
    patch = 0;
    minor += 1;
  }
  if (minor >= 10) {
    minor = 0;
    major += 1;
  }
  return `${major}.${minor}.${patch}`;
}

function updateJson(filePath, newVersion) {
  if (!fs.existsSync(filePath)) return false;
  const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (content.version === newVersion) return false;
  content.version = newVersion;
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf-8');
  return true;
}

const root = path.join(__dirname, '..');
const packageJsonPath = path.join(root, 'package.json');
const packageLockPath = path.join(root, 'package-lock.json');

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const oldVersion = pkg.version;
const newVersion = bumpVersion(oldVersion);

updateJson(packageJsonPath, newVersion);
updateJson(packageLockPath, newVersion);

console.log(`[FlowMaster] Bumped version: ${oldVersion} -> ${newVersion}`);
