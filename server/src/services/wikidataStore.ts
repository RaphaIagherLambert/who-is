import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { WikipediaPage } from "./wikipedia.js";

export type WikidataNiche =
  | "us-actor"
  | "us-musician"
  | "eu-actor"
  | "eu-musician"
  | "br-actor"
  | "br-musician"
  | "latam-actor"
  | "latam-musician";

export interface WikidataPersonRecord {
  id: string;
  name: string;
  niche: WikidataNiche;
  wikipedia: WikipediaPage;
  imageUrl: string;
  faceId?: string;
  indexedAt: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_FILENAME = "wikidata-index.json";

function candidateStorePaths(): string[] {
  const configured = process.env.WIKIDATA_ACTORS_FILE;
  const paths: string[] = [];

  if (configured) {
    paths.push(
      path.isAbsolute(configured)
        ? configured
        : path.join(process.cwd(), configured)
    );
  }

  // Bundled with compiled server (Render production)
  paths.push(path.join(__dirname, "../data", INDEX_FILENAME));
  // Legacy local import path
  paths.push(path.join(__dirname, "../../data/wikidata-us-actors.json"));
  // Dev / tsx when running from server/src/services
  paths.push(path.join(process.cwd(), "src/data", INDEX_FILENAME));
  paths.push(path.join(process.cwd(), "data/wikidata-us-actors.json"));

  return paths;
}

let resolvedStorePath: string | null = null;

function getStorePath(): string {
  if (resolvedStorePath) return resolvedStorePath;

  for (const candidate of candidateStorePaths()) {
    if (existsSync(candidate)) {
      resolvedStorePath = candidate;
      return candidate;
    }
  }

  // Default write target for imports (local dev)
  resolvedStorePath = path.join(__dirname, "../data", INDEX_FILENAME);
  return resolvedStorePath;
}

export function getWikidataStorePath(): string {
  return getStorePath();
}

export async function wikidataStoreFileExists(): Promise<boolean> {
  const storePath = getStorePath();
  try {
    await fs.access(storePath);
    return true;
  } catch {
    return false;
  }
}

let cache: Map<string, WikidataPersonRecord> | null = null;

async function readFileStore(): Promise<WikidataPersonRecord[]> {
  const storePath = getStorePath();
  try {
    const raw = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as WikidataPersonRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [];
    }
    console.warn(`Wikidata index unreadable (${storePath}), using empty list:`, err);
    return [];
  }
}

async function writeFileStore(records: WikidataPersonRecord[]): Promise<void> {
  const storePath = getStorePath();
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(records, null, 2), "utf8");
}

async function loadCache(): Promise<Map<string, WikidataPersonRecord>> {
  if (cache) return cache;
  const records = await readFileStore();
  cache = new Map(records.map((record) => [record.id, record]));
  return cache;
}

export async function getWikidataPersonById(
  id: string
): Promise<WikidataPersonRecord | null> {
  const store = await loadCache();
  return store.get(id) ?? null;
}

export async function saveWikidataPerson(
  record: WikidataPersonRecord
): Promise<void> {
  const store = await loadCache();
  store.set(record.id, record);
  await writeFileStore([...store.values()]);
}

export async function countWikidataActors(): Promise<number> {
  return countWikidataByNiche("us-actor");
}

export async function countWikidataMusicians(): Promise<number> {
  return countWikidataByNiche("us-musician");
}

export async function countWikidataEuActors(): Promise<number> {
  return countWikidataByNiche("eu-actor");
}

export async function countWikidataEuMusicians(): Promise<number> {
  return countWikidataByNiche("eu-musician");
}

export async function countWikidataBrActors(): Promise<number> {
  return countWikidataByNiche("br-actor");
}

export async function countWikidataBrMusicians(): Promise<number> {
  return countWikidataByNiche("br-musician");
}

export async function countWikidataLatamActors(): Promise<number> {
  return countWikidataByNiche("latam-actor");
}

export async function countWikidataLatamMusicians(): Promise<number> {
  return countWikidataByNiche("latam-musician");
}

export async function countWikidataIndexed(): Promise<number> {
  const store = await loadCache();
  return store.size;
}

export async function countWikidataByNiche(niche: WikidataNiche): Promise<number> {
  const store = await loadCache();
  return [...store.values()].filter((r) => r.niche === niche).length;
}

export async function listWikidataPersonIds(): Promise<string[]> {
  const store = await loadCache();
  return [...store.keys()];
}

export async function listWikidataPersonIdsByNiche(
  niche: WikidataNiche
): Promise<string[]> {
  const store = await loadCache();
  return [...store.values()].filter((r) => r.niche === niche).map((r) => r.id);
}

export async function hasWikidataPerson(id: string): Promise<boolean> {
  const store = await loadCache();
  return store.has(id);
}

export function invalidateWikidataCache(): void {
  cache = null;
}
