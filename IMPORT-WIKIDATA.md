# Wikidata import — actors & musicians (US + Europe)

Import public figures into the AWS face collection so the app can recognize them without admin teach mode.

Four **niches** × two **modes**:

| | **Seed** (default) | **SPARQL** |
|---|---|---|
| **US actors** | Famous names via Wikidata Entity API | US citizens, actor occupation |
| **US musicians** | Famous singers/rappers | US citizens, singer/musician/rapper |
| **European actors** | Famous UK/FR/DE/ES/IT/Nordic actors | European citizenship (excl. US), actor |
| **European musicians** | Famous UK/FR/ES/SE/DE musicians | European citizenship (excl. US), musician |

---

## Before you start

1. **AWS credentials** in `server/.env` (same as production).
2. **Server is optional for import** — import runs as a standalone script.
3. **Server is required for health check** — run it separately to see counts at `http://localhost:3001/api/health`.

```powershell
# Terminal 1 — server (optional, for health / testing scans)
cd C:\Users\thais\Projects\public-figure-spotter\server
npm.cmd run dev

# Terminal 2 — import
cd C:\Users\thais\Projects\public-figure-spotter
npm.cmd run import:eu-actors -- --limit 10
```

---

## Commands (from project root)

**Important:** When passing flags (`--mode`, `--limit`, etc.), put `--` before them so npm forwards them to the script:

```powershell
npm.cmd run import:eu-actors -- --mode sparql --limit 20 --batch-size 5
```

Without `--`, npm treats those flags as its own config and the script runs in **seed** mode with defaults.

**Shortcut:** positional args — `sparql 20 5` means mode=sparql, limit=20, batch-size=5:

```powershell
cd server
npm.cmd run import:eu-actors -- sparql 20 5
```

### US actors

```powershell
npm.cmd run import:actors -- --limit 10
npm.cmd run import:actors:dry-run
npm.cmd run import:actors:sparql
```

### US musicians

```powershell
npm.cmd run import:musicians -- --limit 10
npm.cmd run import:musicians:dry-run
npm.cmd run import:musicians:sparql
```

### European actors (start here)

```powershell
npm.cmd run import:eu-actors -- --limit 10
npm.cmd run import:eu-actors:dry-run
npm.cmd run import:eu-actors:sparql
```

### European musicians

```powershell
npm.cmd run import:eu-musicians -- --limit 10
npm.cmd run import:eu-musicians:dry-run
npm.cmd run import:eu-musicians:sparql
```

---

## Modes explained

### Seed mode (`--mode seed`, default)

- Uses curated famous Q-ids (`*ActorSeed.ts`, `*MusicianSeed.ts`).
- Fetches each person via the **Wikidata Entity API** (light, no SPARQL timeout).
- Skips anyone already indexed.
- Best for daily incremental imports (`--limit 5` or `--limit 10`).

### SPARQL mode (`--mode sparql`)

- **US:** Wikidata query for US citizens (`Q30`).
- **Europe:** citizens of countries on continent Europe (`Q46`), excluding US.
- Processes in small batches; **resumes** from where you left off (per niche, in `server/data/`).
- Wikidata often returns **504 Gateway Timeout** when busy — retry later with smaller `--batch-size`.

---

## CLI flags

| Flag | Default | Description |
|------|---------|-------------|
| `--niche` | set by script | `actors`, `musicians`, `eu-actors`, `eu-musicians` |
| `--mode` | `seed` | `seed` or `sparql` |
| `--limit` | `10` | Max people to process this run |
| `--batch-size` | `3` | SPARQL batch size (keep low: 3–5) |
| `--dry-run` | off | Log actions without indexing faces |

---

## Reading the output

| Result | Meaning |
|--------|---------|
| **imported** | New face indexed in AWS + saved to local JSON |
| **skipped** | Already in the collection — nothing to do |
| **failed** | No usable face photo, bad image, or no English Wikipedia page |

---

## Health check

```json
"wikidata": {
  "totalIndexed": 350,
  "usActorsIndexed": 141,
  "usMusiciansIndexed": 44,
  "euActorsIndexed": 85,
  "euMusiciansIndexed": 80
}
```

---

## Seed files

| File | Niche |
|------|-------|
| `server/src/data/usActorSeed.ts` | US actors (~90 names) |
| `server/src/data/usMusicianSeed.ts` | US musicians (~44 names) |
| `server/src/data/euActorSeed.ts` | European actors (~47 names) |
| `server/src/data/euMusicianSeed.ts` | European musicians (~40 names) |

All records are stored in `server/data/wikidata-us-actors.json` (shared file, tagged by `niche`).

---

## Suggested workflow

1. Finish US (actors + musicians) — done ✓
2. **European actors seed** — `import:eu-actors --limit 10` daily
3. **European actors SPARQL** — when seed is mostly skipped
4. **European musicians seed** — same pattern
5. **European musicians SPARQL** — last

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| npm warns about `--mode` | Add `--` before flags: `npm run import:eu-actors -- --mode sparql` |
| SPARQL 504 | Smaller `--batch-size 3`, retry off-peak hours |
| All skipped | Seed list done — use SPARQL |
| All failed | No clear face photo — normal for some entries |
| SPARQL zeros, "No more rows" | SPARQL cursor exhausted for that niche — use seed mode |

---

See also: `server/scripts/import-wikidata.ts` (shared logic).
