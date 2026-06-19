# Phase 2 — Teach mode (admin only)

When the app fails to recognize someone, **you** (admin) can teach it the correct person. The face is saved in your private AWS collection and matched on future scans **before** the celebrity API runs.

## How to use (admin)

1. Open **https://who-is.onrender.com** on your phone
2. Tap the title **"Who is?"** **5 times quickly**
3. Enter your **admin password** (`ADMIN_SECRET` from Render)
4. You’ll see a small **Admin** badge in the header
5. Scan someone who isn’t recognized
6. Tap **"Ensinar o sistema"** / **"Teach the system"**
7. Type their name → **Buscar** → confirm Wikipedia page → **Salvar**

Next time you scan a similar face, the app should show **Aprendido** / **Learned**.

---

## Render setup (one time)

### 1. IAM — add collection permissions

In AWS → IAM → your `who-is-app` user → add this policy (or merge into existing):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "rekognition:RecognizeCelebrities",
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "rekognition:CreateCollection",
        "rekognition:DescribeCollection",
        "rekognition:IndexFaces",
        "rekognition:SearchFacesByImage"
      ],
      "Resource": "*"
    }
  ]
}
```

### 2. Render environment variables

| Key | Example | Notes |
|-----|---------|--------|
| `ADMIN_SECRET` | `my-long-random-password-2026` | **Required** — pick a strong password only you know |
| `REKOGNITION_COLLECTION_ID` | `who-is-faces` | AWS face collection name |
| `MIN_FACE_SIMILARITY` | `95` | How similar a face must be to match (0–100) |
| `CUSTOM_TEACH_ENABLED` | `true` | Set `false` to disable teach mode |

Keep existing vars: `AWS_*`, `MIN_CONFIDENCE`, `MIN_MATCH_MARGIN`, etc.

### 3. Deploy

```powershell
cd C:\Users\thais\Projects\public-figure-spotter
git add .
git commit -m "Phase 2: admin teach mode for learned faces"
git push
```

Check **https://who-is.onrender.com/api/health** — should include:

```json
"teach": { "enabled": true, "count": 0, "collectionReady": true }
```

---

## Important notes

| Topic | Detail |
|-------|--------|
| **Who can teach?** | Only someone with `ADMIN_SECRET` (you) |
| **Data storage** | Faces in AWS Rekognition collection; names/Wikipedia links in `server/data/teachings.json` on the server |
| **Render free tier** | Teachings file may reset on redeploy — faces stay in AWS, but names may need re-linking later (Phase 2b: S3 persistence) |
| **Quality** | Best results: clear front-facing face, good light, face large in frame |
| **Multiple photos** | Teaching the same person 2–3 times from different angles improves matching |

---

## Scan order

1. **Learned faces** (your collection) — if similarity ≥ `MIN_FACE_SIMILARITY`
2. **AWS celebrities** — strict confidence rules (Phase 1)
3. **No guess** — show “not confident” instead of a wrong name

---

## Local testing

Add to your `.env`:

```env
ADMIN_SECRET=local-dev-secret
REKOGNITION_COLLECTION_ID=who-is-faces
MIN_FACE_SIMILARITY=95
CUSTOM_TEACH_ENABLED=true
```

Restart server, unlock admin (5× tap title), teach a face, scan again.
