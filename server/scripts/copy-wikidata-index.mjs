import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..");
const legacy = path.join(serverRoot, "data", "wikidata-us-actors.json");
const target = path.join(serverRoot, "src", "data", "wikidata-index.json");
const distTarget = path.join(serverRoot, "dist", "data", "wikidata-index.json");

const source = fs.existsSync(target)
  ? target
  : fs.existsSync(legacy)
    ? legacy
    : null;

if (!source) {
  console.error(
    "BUILD FAILED: Wikidata index missing.\n" +
      "  Run: node server/scripts/sync-wikidata-index.mjs\n" +
      "  Then commit server/src/data/wikidata-index.json"
  );
  process.exit(1);
}

fs.mkdirSync(path.dirname(distTarget), { recursive: true });
fs.copyFileSync(source, distTarget);

if (source === legacy && !fs.existsSync(target)) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(legacy, target);
  console.log("Synced legacy import file to src/data/wikidata-index.json");
}

console.log(`Copied Wikidata index to ${distTarget}`);
