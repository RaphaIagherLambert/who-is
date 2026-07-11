import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { ASIA_ACTOR_SEED_UNIQUE } from "../src/data/asiaActorSeed.js";
import { ASIA_MUSICIAN_SEED_UNIQUE } from "../src/data/asiaMusicianSeed.js";
import { LATAM_ACTOR_SEED_UNIQUE } from "../src/data/latamActorSeed.js";
import { LATAM_MUSICIAN_SEED_UNIQUE } from "../src/data/latamMusicianSeed.js";
import { BR_ACTOR_SEED_UNIQUE } from "../src/data/brActorSeed.js";
import { BR_MUSICIAN_SEED_UNIQUE } from "../src/data/brMusicianSeed.js";
import { EU_ACTOR_SEED_UNIQUE } from "../src/data/euActorSeed.js";
import { EU_MUSICIAN_SEED_UNIQUE } from "../src/data/euMusicianSeed.js";
import { US_ACTOR_SEED_UNIQUE } from "../src/data/usActorSeed.js";
import { US_MUSICIAN_SEED_UNIQUE } from "../src/data/usMusicianSeed.js";
import { ensureFaceCollection, indexFaceBytes } from "../src/services/faceCollection.js";
import {
  fetchAsiaActorsBatch,
  fetchAsiaMusiciansBatch,
  fetchLatamActorsBatch,
  fetchLatamMusiciansBatch,
  fetchBrActorsBatch,
  fetchBrMusiciansBatch,
  fetchEuActorsBatch,
  fetchEuMusiciansBatch,
  fetchUsActorsBatch,
  fetchUsMusiciansBatch,
  fetchWikidataEntityMetadata,
  fetchWikidataPersonForImport,
  pickLatestQid,
  sleep,
} from "../src/services/wikidataImport.js";
import type { WikidataNiche } from "../src/services/wikidataStore.js";
import {
  hasWikidataPerson,
  invalidateWikidataCache,
  listWikidataPersonIdsByNiche,
  saveWikidataPerson,
} from "../src/services/wikidataStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

const USER_AGENT =
  "WhoIsApp/1.0 (public-figure-spotter; wikidata import script)";

type ImportMode = "seed" | "sparql";

interface ImportOptions {
  niche: WikidataNiche;
  mode: ImportMode;
  limit: number;
  batchSize: number;
  dryRun: boolean;
  delayMs: number;
}

const NICHE_CONFIG = {
  "us-actor": {
    label: "US actors",
    seedIds: US_ACTOR_SEED_UNIQUE,
    fetchBatch: fetchUsActorsBatch,
    sparqlHint: "npm.cmd run import:actors -- --mode sparql --limit 5 --batch-size 3",
  },
  "us-musician": {
    label: "US musicians",
    seedIds: US_MUSICIAN_SEED_UNIQUE,
    fetchBatch: fetchUsMusiciansBatch,
    sparqlHint: "npm.cmd run import:musicians -- --mode sparql --limit 5 --batch-size 3",
  },
  "eu-actor": {
    label: "European actors",
    seedIds: EU_ACTOR_SEED_UNIQUE,
    fetchBatch: fetchEuActorsBatch,
    sparqlHint: "npm.cmd run import:eu-actors -- --mode sparql --limit 5 --batch-size 3",
  },
  "eu-musician": {
    label: "European musicians",
    seedIds: EU_MUSICIAN_SEED_UNIQUE,
    fetchBatch: fetchEuMusiciansBatch,
    sparqlHint: "npm.cmd run import:eu-musicians -- --mode sparql --limit 5 --batch-size 3",
  },
  "br-actor": {
    label: "Brazilian actors",
    seedIds: BR_ACTOR_SEED_UNIQUE,
    fetchBatch: fetchBrActorsBatch,
    sparqlHint: "npm.cmd run import:br-actors -- --mode sparql --limit 5 --batch-size 3",
  },
  "br-musician": {
    label: "Brazilian musicians",
    seedIds: BR_MUSICIAN_SEED_UNIQUE,
    fetchBatch: fetchBrMusiciansBatch,
    sparqlHint: "npm.cmd run import:br-musicians -- --mode sparql --limit 5 --batch-size 3",
  },
  "latam-actor": {
    label: "Latin American actors (South America + Mexico)",
    seedIds: LATAM_ACTOR_SEED_UNIQUE,
    fetchBatch: fetchLatamActorsBatch,
    sparqlHint: "npm.cmd run import:latam-actors -- --mode sparql --limit 5 --batch-size 3",
  },
  "latam-musician": {
    label: "Latin American musicians (South America + Mexico)",
    seedIds: LATAM_MUSICIAN_SEED_UNIQUE,
    fetchBatch: fetchLatamMusiciansBatch,
    sparqlHint: "npm.cmd run import:latam-musicians -- --mode sparql --limit 5 --batch-size 3",
  },
  "asia-actor": {
    label: "Asian actors",
    seedIds: ASIA_ACTOR_SEED_UNIQUE,
    fetchBatch: fetchAsiaActorsBatch,
    sparqlHint: "npm.cmd run import:asia-actors -- --mode sparql --limit 5 --batch-size 3",
  },
  "asia-musician": {
    label: "Asian musicians",
    seedIds: ASIA_MUSICIAN_SEED_UNIQUE,
    fetchBatch: fetchAsiaMusiciansBatch,
    sparqlHint: "npm.cmd run import:asia-musicians -- --mode sparql --limit 5 --batch-size 3",
  },
} as const;

function parseNiche(value: string | undefined): WikidataNiche {
  switch (value) {
    case "musicians":
    case "us-musician":
      return "us-musician";
    case "eu-actors":
    case "eu-actor":
    case "european-actors":
      return "eu-actor";
    case "eu-musicians":
    case "eu-musician":
    case "european-musicians":
      return "eu-musician";
    case "br-actors":
    case "br-actor":
    case "brazilian-actors":
      return "br-actor";
    case "br-musicians":
    case "br-musician":
    case "brazilian-musicians":
      return "br-musician";
    case "latam-actors":
    case "latam-actor":
    case "south-america-actors":
    case "sa-actors":
      return "latam-actor";
    case "latam-musicians":
    case "latam-musician":
    case "south-america-musicians":
    case "sa-musicians":
      return "latam-musician";
    case "asia-actors":
    case "asia-actor":
    case "asian-actors":
      return "asia-actor";
    case "asia-musicians":
    case "asia-musician":
    case "asian-musicians":
      return "asia-musician";
    case "actors":
    case "us-actor":
    default:
      return "us-actor";
  }
}

function parseArgs(argv: string[]): ImportOptions {
  const opts: ImportOptions = {
    niche: "us-actor",
    mode: "seed",
    limit: 10,
    batchSize: 3,
    dryRun: false,
    delayMs: 400,
  };

  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--niche") {
      opts.niche = parseNiche(argv[++i]);
    } else if (arg === "--mode") opts.mode = argv[++i] === "sparql" ? "sparql" : "seed";
    else if (arg === "--limit") opts.limit = Number(argv[++i] ?? opts.limit);
    else if (arg === "--batch-size") opts.batchSize = Number(argv[++i] ?? opts.batchSize);
    else if (arg === "--delay-ms") opts.delayMs = Number(argv[++i] ?? opts.delayMs);
    else if (!arg.startsWith("-")) positional.push(arg);
  }

  // Shorthand when npm strips flags: `npm run import:musicians sparql 20 5`
  if (positional[0] === "sparql" || positional[0] === "seed") {
    opts.mode = positional[0] === "sparql" ? "sparql" : "seed";
    if (positional[1] && !Number.isNaN(Number(positional[1]))) {
      opts.limit = Number(positional[1]);
    }
    if (positional[2] && !Number.isNaN(Number(positional[2]))) {
      opts.batchSize = Number(positional[2]);
    }
  }

  return opts;
}

async function downloadImage(url: string): Promise<Buffer | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });
  if (!res.ok) return null;

  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 5000) return null;
  return bytes;
}

async function indexRow(
  row: { id: string; name: string; imageUrl: string },
  wikipedia: { title: string; url: string; lang: string },
  niche: WikidataNiche,
  opts: ImportOptions
): Promise<"imported" | "skipped" | "failed"> {
  if (await hasWikidataPerson(row.id)) return "skipped";

  if (opts.dryRun) {
    console.log(`[dry-run] ${row.id} ${row.name}`);
    return "imported";
  }

  try {
    const imageBytes = await downloadImage(row.imageUrl);
    if (!imageBytes) {
      console.warn(`Skip (image): ${row.name}`);
      return "failed";
    }

    const faceId = await indexFaceBytes(imageBytes, row.id);
    if (!faceId) {
      console.warn(`Skip (no face): ${row.name}`);
      return "failed";
    }

    await saveWikidataPerson({
      id: row.id,
      name: row.name,
      niche,
      wikipedia,
      imageUrl: row.imageUrl,
      faceId,
      indexedAt: new Date().toISOString(),
    });

    return "imported";
  } catch (err) {
    console.warn(`Failed ${row.name}:`, err instanceof Error ? err.message : err);
    return "failed";
  }
}

async function runSeedImport(opts: ImportOptions) {
  const config = NICHE_CONFIG[opts.niche];
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let pendingInSeed = 0;

  for (const id of config.seedIds) {
    if (!(await hasWikidataPerson(id))) pendingInSeed++;
  }

  console.log(
    `Seed list (${config.label}): ${config.seedIds.length} famous names, ${pendingInSeed} not yet indexed.`
  );

  if (pendingInSeed === 0) {
    console.log("\nAll seed-list names are already imported (or failed in a past run).");
    console.log("Continue with SPARQL mode:");
    console.log(`  ${config.sparqlHint}`);
    console.log("  (Best early morning — Wikidata may 504 when busy.)");
  }

  for (const id of config.seedIds) {
    if (imported >= opts.limit) break;

    if (await hasWikidataPerson(id)) {
      skipped++;
      continue;
    }

    const row = await fetchWikidataPersonForImport(id);
    if (!row) {
      console.warn(`Skip (metadata/image): ${id}`);
      failed++;
      await sleep(300);
      continue;
    }

    const meta = await fetchWikidataEntityMetadata(id);
    if (!meta) {
      failed++;
      continue;
    }

    const result = await indexRow(row, meta.wikipedia, opts.niche, opts);
    if (result === "imported") {
      imported++;
      console.log(`Indexed ${imported}/${opts.limit}: ${row.name} (${row.id})`);
      await sleep(opts.delayMs);
    } else if (result === "skipped") skipped++;
    else failed++;

    invalidateWikidataCache();
  }

  console.log(`\nDone (seed — ${config.label}).`);
  console.log({ imported, skipped, failed });
}

async function runSparqlImport(opts: ImportOptions) {
  const config = NICHE_CONFIG[opts.niche];
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let afterQid = pickLatestQid(await listWikidataPersonIdsByNiche(opts.niche));
  if (afterQid) {
    console.log(`Resuming SPARQL (${config.label}) after ${afterQid}`);
  }

  while (imported < opts.limit) {
    const remaining = opts.limit - imported;
    const batchLimit = Math.min(opts.batchSize, remaining, 5);
    const rows = await config.fetchBatch(batchLimit, 0, afterQid);

    if (rows.length === 0) {
      console.log("No more rows from Wikidata SPARQL.");
      break;
    }

    console.log(`SPARQL batch after ${afterQid ?? "start"}: ${rows.length} candidates`);

    for (const row of rows) {
      if (imported >= opts.limit) break;

      const meta = await fetchWikidataEntityMetadata(row.id);
      if (!meta) {
        failed++;
        continue;
      }

      const result = await indexRow(
        { ...row, name: meta.name },
        meta.wikipedia,
        opts.niche,
        opts
      );

      if (result === "imported") {
        imported++;
        console.log(`Indexed ${imported}/${opts.limit}: ${meta.name} (${row.id})`);
        await sleep(opts.delayMs);
      } else if (result === "skipped") skipped++;
      else failed++;

      afterQid = row.id;
    }

    invalidateWikidataCache();
    await sleep(4000);
  }

  console.log(`\nDone (SPARQL — ${config.label}).`);
  console.log({ imported, skipped, failed, resumeAfter: afterQid });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const config = NICHE_CONFIG[opts.niche];

  console.log(`Who is? — ${config.label} import`);
  console.log(opts);
  console.log(
    opts.mode === "seed"
      ? "Mode: seed list (reliable, one API call per person)."
      : "Mode: SPARQL bulk query (may timeout when Wikidata is busy)."
  );

  if (!opts.dryRun) {
    const ready = await ensureFaceCollection();
    if (!ready) {
      throw new Error(
        "Face collection unavailable. Check AWS credentials and IAM permissions."
      );
    }
  }

  if (opts.mode === "seed") {
    await runSeedImport(opts);
  } else {
    await runSparqlImport(opts);
  }
}

main().catch((err) => {
  console.error(err);
  console.error(
    "\nTip: If SPARQL times out, use seed mode (default):\n" +
      "  npm.cmd run import:musicians -- --limit 10\n"
  );
  process.exit(1);
});
