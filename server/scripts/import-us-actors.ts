import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { ensureFaceCollection, indexFaceBytes } from "../src/services/faceCollection.js";
import {
  fetchUsActorsBatch,
  sleep,
  toWikipediaPage,
} from "../src/services/wikidataImport.js";
import {
  hasWikidataPerson,
  invalidateWikidataCache,
  saveWikidataPerson,
} from "../src/services/wikidataStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

const USER_AGENT =
  "WhoIsApp/1.0 (public-figure-spotter; wikidata import script)";

interface ImportOptions {
  limit: number;
  offset: number;
  batchSize: number;
  dryRun: boolean;
  delayMs: number;
}

function parseArgs(argv: string[]): ImportOptions {
  const opts: ImportOptions = {
    limit: 100,
    offset: 0,
    batchSize: 50,
    dryRun: false,
    delayMs: 350,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--limit") opts.limit = Number(argv[++i] ?? opts.limit);
    else if (arg === "--offset") opts.offset = Number(argv[++i] ?? opts.offset);
    else if (arg === "--batch-size") opts.batchSize = Number(argv[++i] ?? opts.batchSize);
    else if (arg === "--delay-ms") opts.delayMs = Number(argv[++i] ?? opts.delayMs);
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

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log("Who is? — US actors Wikidata import");
  console.log(opts);

  if (!opts.dryRun) {
    const ready = await ensureFaceCollection();
    if (!ready) {
      throw new Error(
        "Face collection unavailable. Check AWS credentials and IAM permissions."
      );
    }
  }

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let offset = opts.offset;

  while (imported < opts.limit) {
    const remaining = opts.limit - imported;
    const batchLimit = Math.min(opts.batchSize, remaining);
    const rows = await fetchUsActorsBatch(batchLimit, offset);

    if (rows.length === 0) {
      console.log("No more rows from Wikidata.");
      break;
    }

    console.log(`Batch offset ${offset}: ${rows.length} candidates`);

    for (const row of rows) {
      if (imported >= opts.limit) break;

      if (await hasWikidataPerson(row.id)) {
        skipped++;
        continue;
      }

      if (opts.dryRun) {
        console.log(`[dry-run] ${row.id} ${row.name}`);
        imported++;
        continue;
      }

      try {
        const imageBytes = await downloadImage(row.imageUrl);
        if (!imageBytes) {
          console.warn(`Skip (image): ${row.name}`);
          failed++;
          continue;
        }

        const faceId = await indexFaceBytes(imageBytes, row.id);
        if (!faceId) {
          console.warn(`Skip (no face): ${row.name}`);
          failed++;
          continue;
        }

        await saveWikidataPerson({
          id: row.id,
          name: row.name,
          niche: "us-actor",
          wikipedia: toWikipediaPage(row),
          imageUrl: row.imageUrl,
          faceId,
          indexedAt: new Date().toISOString(),
        });

        imported++;
        console.log(`Indexed ${imported}/${opts.limit}: ${row.name} (${row.id})`);
        await sleep(opts.delayMs);
      } catch (err) {
        failed++;
        console.warn(`Failed ${row.name}:`, err instanceof Error ? err.message : err);
      }
    }

    offset += rows.length;
    invalidateWikidataCache();
    await sleep(1000);
  }

  console.log("\nDone.");
  console.log({ imported, skipped, failed, nextOffset: offset });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
