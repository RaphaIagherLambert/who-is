import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..");
const legacy = path.join(serverRoot, "data", "wikidata-us-actors.json");
const target = path.join(serverRoot, "src", "data", "wikidata-index.json");

function recordCount(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}

function pickSource() {
  const hasLegacy = fs.existsSync(legacy);
  const hasTarget = fs.existsSync(target);

  if (!hasLegacy && !hasTarget) return null;
  if (!hasLegacy) return target;
  if (!hasTarget) return legacy;

  const legacyCount = recordCount(legacy);
  const targetCount = recordCount(target);

  if (legacyCount > targetCount) return legacy;
  if (targetCount > legacyCount) return target;

  const legacyMtime = fs.statSync(legacy).mtimeMs;
  const targetMtime = fs.statSync(target).mtimeMs;
  return legacyMtime >= targetMtime ? legacy : target;
}

const source = pickSource();
if (!source) {
  console.error(
    "Missing Wikidata index.\n" +
      "  Run an import first, or ensure one of these exists:\n" +
      `  - ${target}\n` +
      `  - ${legacy}`
  );
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
if (source !== target) {
  fs.copyFileSync(source, target);
  console.log(`Synced ${source} -> ${target} (${recordCount(target)} records)`);
} else {
  console.log(`Using ${target} (${recordCount(target)} records)`);
}
