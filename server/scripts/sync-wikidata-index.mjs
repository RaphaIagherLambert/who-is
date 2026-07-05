import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const legacy = path.join(__dirname, "../data/wikidata-us-actors.json");
const target = path.join(__dirname, "../src/data/wikidata-index.json");

if (!fs.existsSync(legacy)) {
  console.error("Missing server/data/wikidata-us-actors.json");
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(legacy, target);
console.log(`Wrote ${target}`);
