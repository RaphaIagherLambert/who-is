/**
 * Phase A scale import — grow the actor face index (multi-region SPARQL).
 *
 * Runs high-signal actor niches with 3 faces/person. Resume-safe (skips already indexed).
 *
 * Usage (from repo root):
 *   npm.cmd run import:scale-actors -- --limit 200 --batch-size 8
 *   npm.cmd run import:scale-actors -- --dry-run --limit 20
 *   npm.cmd run import:scale-actors -- --niches us-actor,br-actor --limit 100
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..");

const DEFAULT_NICHES = [
  "us-actor",
  "eu-actor",
  "br-actor",
  "latam-actor",
  "asia-actor",
] as const;

function parseArgs(argv: string[]) {
  let limit = 200;
  let batchSize = 8;
  let delayMs = 350;
  let facesPerPerson = 3;
  let dryRun = false;
  let niches: string[] = [...DEFAULT_NICHES];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--limit") limit = Number(argv[++i] ?? limit);
    else if (arg === "--batch-size") batchSize = Number(argv[++i] ?? batchSize);
    else if (arg === "--delay-ms") delayMs = Number(argv[++i] ?? delayMs);
    else if (arg === "--faces-per-person") {
      facesPerPerson = Math.min(3, Math.max(1, Number(argv[++i] ?? 3)));
    } else if (arg === "--niches") {
      niches = String(argv[++i] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  return { limit, batchSize, delayMs, facesPerPerson, dryRun, niches };
}

function runNiche(niche: string, opts: ReturnType<typeof parseArgs>): Promise<number> {
  const script = path.join(serverRoot, "scripts", "import-wikidata.ts");
  const args = [
    script,
    "--niche",
    niche,
    "--mode",
    "sparql",
    "--limit",
    String(opts.limit),
    "--batch-size",
    String(opts.batchSize),
    "--delay-ms",
    String(opts.delayMs),
    "--faces-per-person",
    String(opts.facesPerPerson),
  ];
  if (opts.dryRun) args.push("--dry-run");

  return new Promise((resolve) => {
    console.log(`\n======== SCALE: ${niche} (limit ${opts.limit}) ========`);
    const child = spawn("npx", ["tsx", ...args], {
      cwd: serverRoot,
      stdio: "inherit",
      shell: true,
      env: process.env,
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

const opts = parseArgs(process.argv.slice(2));
console.log("Who is? — scale actor index");
console.log(JSON.stringify(opts, null, 2));

let failed = 0;
for (const niche of opts.niches) {
  const code = await runNiche(niche, opts);
  if (code !== 0) {
    console.warn(`Niche ${niche} exited with code ${code}`);
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`\nFinished with ${failed} niche failure(s). Re-run to resume.`);
  process.exit(1);
}

console.log("\nScale pass complete. Sync index into the server build and redeploy:");
console.log("  npm.cmd run build --prefix server");
console.log("  Check /api/health → wikidata.totalIndexed");
