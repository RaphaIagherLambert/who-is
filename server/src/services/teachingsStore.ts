import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { WikipediaPage } from "./wikipedia.js";

export interface TeachingRecord {
  id: string;
  name: string;
  wikipedia: WikipediaPage;
  createdAt: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.join(__dirname, "../../data/teachings.json");

let cache: Map<string, TeachingRecord> | null = null;

function getStorePath(): string {
  const configured = process.env.TEACHINGS_FILE;
  if (!configured) return DEFAULT_FILE;
  return path.isAbsolute(configured)
    ? configured
    : path.join(__dirname, "../..", configured);
}

async function readFileStore(): Promise<TeachingRecord[]> {
  const storePath = getStorePath();
  try {
    const raw = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as TeachingRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

async function writeFileStore(records: TeachingRecord[]): Promise<void> {
  const storePath = getStorePath();
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(records, null, 2), "utf8");
}

async function loadCache(): Promise<Map<string, TeachingRecord>> {
  if (cache) return cache;

  const records = await readFileStore();
  cache = new Map(records.map((record) => [record.id, record]));
  return cache;
}

export async function getTeachingById(
  id: string
): Promise<TeachingRecord | null> {
  const store = await loadCache();
  return store.get(id) ?? null;
}

export async function saveTeaching(record: TeachingRecord): Promise<void> {
  const store = await loadCache();
  store.set(record.id, record);
  await writeFileStore([...store.values()]);
}

export async function countTeachings(): Promise<number> {
  const store = await loadCache();
  return store.size;
}

export function isTeachingsEnabled(): boolean {
  return (
    process.env.CUSTOM_TEACH_ENABLED !== "false" &&
    Boolean(process.env.ADMIN_SECRET)
  );
}
