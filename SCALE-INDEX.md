# Scale the face index (beat ActorDetector / WhoDat on hit rate)

Who Is loses when recognition depends mainly on AWS `RecognizeCelebrities`.
Competitors win with a **large face gallery**. This is Phase A: grow our Rekognition collection.

## Target

| Milestone | Indexed people (actors first) | Faces / person |
|-----------|-------------------------------|----------------|
| Now | ~500 | 1–3 |
| Phase A | **5,000–10,000** | **3** |
| Phase B | 50,000+ | 2–3 |

## What we shipped in code

1. **Collection-first matching** — search top unique people in the custom index before Celebrity API.
2. **Top candidates** — if scores are close (or Celebrity is soft), the app asks “Who is it?” instead of failing silently.
3. **Popular SPARQL filters** — US/EU actor imports prefer people with IMDb + enough Wikipedia sitelinks.
4. **`import:scale-actors`** — one command to pull large SPARQL batches across regions.

## Run Phase A (local machine with AWS keys)

From the repo root (PowerShell):

```powershell
# Dry run (no AWS index writes)
npm.cmd run import:scale-actors -- --dry-run --limit 20

# Real import — 200 new actors per niche × 5 niches (resume-safe)
npm.cmd run import:scale-actors -- --limit 200 --batch-size 8 --faces-per-person 3

# Focus Brazil + LatAm first
npm.cmd run import:scale-actors -- --niches br-actor,latam-actor --limit 300
```

Repeat until `/api/health` shows `wikidata.totalIndexed` in the thousands.

Then build so the index ships with the server:

```powershell
npm.cmd run build --prefix server
git add server/src/data/wikidata-index.json
# commit + push when ready — large file; confirm size before push
```

## After import

1. Confirm AWS collection grew (Console → Rekognition → Collection `who-is-faces`).
2. Redeploy Render with the new `wikidata-index.json`.
3. Smoke-test supporting actors who used to fail.

## Notes

- Imports **skip** people already in the JSON index — safe to re-run.
- Wikidata SPARQL often 504s when busy — re-run later; progress is kept.
- AWS `IndexFaces` costs money at scale — watch billing alarms.
- Do **not** commit `.env`. Only the index JSON + code.
