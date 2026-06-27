import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { WikipediaPage } from "./wikipedia.js";

export type WikidataNiche = "us-actor" | "us-musician";

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
const DEFAULT_FILE = path.join(__dirname, "../../data/wikidata-us-actors.json");

let cache: Map<string, WikidataPersonRecord> | null = null;

function getStorePath(): string {
  const configured = process.env.WIKIDATA_ACTORS_FILE;
  if (!configured) return DEFAULT_FILE;
  return path.isAbsolute(configured)
    ? configured
    : path.join(__dirname, "../..", configured);
}

async function readFileStore(): Promise<WikidataPersonRecord[]> {
  const storePath = getStorePath();
  try {
    const raw = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as WikidataPersonRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
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
  const store = await loadCache();
  return store.size;
}

export async function hasWikidataPerson(id: string): Promise<boolean> {
  const store = await loadCache();
  return store.has(id);
}

export function invalidateWikidataCache(): void {
  cache = null;
}
