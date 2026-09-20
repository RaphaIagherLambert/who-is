/**
 * Offline recognition measure: hit@1 / hit@3 against labeled fixtures.
 *
 * Setup:
 *   server/measure/labels.json  → [{ "file": "tom.jpg", "name": "Tom Cruise" }, ...]
 *   server/measure/fixtures/    → image files
 *
 * Run (from server/):
 *   npx tsx scripts/measure-recognition.ts
 *   npx tsx scripts/measure-recognition.ts --limit 20
 *
 * Requires local server at MEASURE_BASE_URL (default http://127.0.0.1:3001)
 * with AWS credentials configured.
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

interface LabelRow {
  file: string;
  name: string;
}

interface IdentifyResponse {
  results?: Array<{ name: string; confidence: number }>;
  rejectReason?: string | null;
  needsPick?: boolean;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesMatch(expected: string, got: string): boolean {
  const a = norm(expected);
  const b = norm(got);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const at = a.split(" ");
  const bt = b.split(" ");
  if (at.length >= 2 && bt.length >= 2) {
    return at[0] === bt[0] && at[at.length - 1] === bt[bt.length - 1];
  }
  return false;
}

async function fileToDataUrl(filePath: string): Promise<string> {
  const bytes = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : "image/jpeg";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function parseArgs(argv: string[]) {
  let limit = Infinity;
  let baseUrl = process.env.MEASURE_BASE_URL ?? "http://127.0.0.1:3001";
  let lang = "en";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") limit = Number(argv[++i] ?? limit);
    else if (argv[i] === "--base-url") baseUrl = String(argv[++i] ?? baseUrl);
    else if (argv[i] === "--lang") lang = String(argv[++i] ?? lang);
  }
  return { limit, baseUrl, lang };
}

const opts = parseArgs(process.argv.slice(2));
const measureDir = path.join(__dirname, "../measure");
const labelsPath = path.join(measureDir, "labels.json");
const fixturesDir = path.join(measureDir, "fixtures");

let labels: LabelRow[] = [];
try {
  labels = JSON.parse(await fs.readFile(labelsPath, "utf8")) as LabelRow[];
} catch {
  console.error(`Missing ${labelsPath}`);
  console.error("Copy measure/labels.example.json → measure/labels.json and add fixtures.");
  process.exit(1);
}

labels = labels.slice(0, Number.isFinite(opts.limit) ? opts.limit : labels.length);

let hit1 = 0;
let hit3 = 0;
let failed = 0;
const misses: string[] = [];

console.log(`Measuring ${labels.length} images against ${opts.baseUrl}`);

for (const row of labels) {
  const filePath = path.join(fixturesDir, row.file);
  try {
    await fs.access(filePath);
  } catch {
    console.warn(`Missing fixture: ${row.file}`);
    failed += 1;
    continue;
  }

  const image = await fileToDataUrl(filePath);
  const res = await fetch(`${opts.baseUrl}/api/identify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image, lang: opts.lang }),
  });

  if (!res.ok) {
    console.warn(`HTTP ${res.status} for ${row.file}`);
    failed += 1;
    continue;
  }

  const data = (await res.json()) as IdentifyResponse;
  const names = (data.results ?? []).map((r) => r.name);
  const top = names[0] ?? "(none)";
  const ok1 = names[0] ? namesMatch(row.name, names[0]) : false;
  const ok3 = names.some((n) => namesMatch(row.name, n));

  if (ok1) hit1 += 1;
  if (ok3) hit3 += 1;
  else misses.push(`${row.file}: expected "${row.name}", got [${names.join(", ") || top}]`);

  console.log(
    `${ok1 ? "HIT1" : ok3 ? "HIT3" : "MISS"}  ${row.file} → ${names.join(" | ") || "(empty)"}`
  );
}

const n = labels.length - failed;
console.log("\n=== Summary ===");
console.log(`Evaluated: ${n}  (missing/failed files: ${failed})`);
if (n > 0) {
  console.log(`hit@1: ${(100 * hit1) / n}%  (${hit1}/${n})`);
  console.log(`hit@3: ${(100 * hit3) / n}%  (${hit3}/${n})`);
}
if (misses.length) {
  console.log("\nMisses:");
  for (const m of misses) console.log(`  - ${m}`);
}
