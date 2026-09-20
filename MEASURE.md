# Measure recognition (hit@1 / hit@3)

Track whether Who Is is getting better than ActorDetector/WhoDat on *your* hard cases (paused TV, phone glare, supporting actors).

## Setup

1. Start the API locally with AWS enabled:

```powershell
cd C:\Users\thais\Projects\public-figure-spotter\server
npm.cmd run dev
```

2. Add screenshots under `server/measure/fixtures/` (jpg/png).

3. Copy and edit labels:

```powershell
copy measure\labels.example.json measure\labels.json
```

Each row:

```json
{ "file": "scene-01.jpg", "name": "Actor Name Exactly" }
```

Aim for ~50–200 mixed cases (A-list, supporting, BR/LatAm, dark/blurry).

## Run

```powershell
cd C:\Users\thais\Projects\public-figure-spotter\server
npx tsx scripts/measure-recognition.ts
npx tsx scripts/measure-recognition.ts --limit 20
```

## What good looks like

| Metric | Meaning |
|--------|---------|
| **hit@1** | Top guess is correct |
| **hit@3** | Correct person appears in the top 3 (picker) |

After ensemble + capture upgrades, watch **hit@3** climb first; hit@1 follows as the index grows.

Do not commit private fixture photos if they contain non-public faces.
