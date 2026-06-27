# Import US actors from Wikidata

Indexes **American actors** (US citizenship, occupation actor, English Wikipedia, portrait) into your AWS Rekognition face collection.

## Prerequisites

- `.env` at project root with AWS credentials (`RECOGNITION_PROVIDER=aws`, keys, region)
- IAM permissions: `IndexFaces`, `CreateCollection`, `DescribeCollection`, `SearchFacesByImage`

## Quick test (no AWS indexing)

```powershell
cd C:\Users\thais\Projects\public-figure-spotter
npm.cmd run import:actors:dry-run
```

Lists ~20 actors from Wikidata without calling AWS.

## Import (recommended first batch)

Start with **50** faces to test cost and quality:

```powershell
cd C:\Users\thais\Projects\public-figure-spotter\server
npm.cmd run import:actors -- --limit 50
```

## Full import (up to 1000 per run)

```powershell
npm.cmd run import:actors -- --limit 1000
```

Continue where you left off:

```powershell
npm.cmd run import:actors -- --limit 500 --offset 500
```

## Options

| Flag | Default | Meaning |
|------|---------|---------|
| `--limit` | `100` | Max new faces to index this run |
| `--offset` | `0` | Wikidata pagination offset |
| `--batch-size` | `50` | SPARQL batch size |
| `--delay-ms` | `350` | Pause between AWS index calls |
| `--dry-run` | off | List candidates only |

## After import

1. Faces live in AWS collection (`REKOGNITION_COLLECTION_ID`, default `who-is-faces`)
2. Metadata saved locally in `server/data/wikidata-us-actors.json`
3. **Production (Render):** faces work immediately; names resolve via Wikidata API using the `Q` id even without the JSON file on the server

Check health locally:

```
http://localhost:3001/api/health
```

Look for `"wikidata": { "usActorsIndexed": 50 }`.

## Scan order in the app

1. Your indexed faces (Wikidata + admin teach)
2. AWS celebrities (strict)
3. No guess

Matches from this import show badge **Ator EUA** / **US actor**.
