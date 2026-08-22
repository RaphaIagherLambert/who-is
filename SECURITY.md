# Security checklist — Who is?

Run before each deploy:

```powershell
cd C:\Users\thais\Projects\public-figure-spotter
npm run security:check
```

---

## 1. Do now

### Strong `ADMIN_SECRET` (Render)

1. Open [dashboard.render.com](https://dashboard.render.com) → **who-is** → **Environment**
2. Set `ADMIN_SECRET` to a **random string of 32+ characters** (password manager or `openssl rand -base64 32`)
3. Do **not** use defaults like `change-me` or `local-dev-secret`
4. Save — Render redeploys. The server **refuses to start in production** with a weak secret.

### Confirm `.env` is never on GitHub

```powershell
npm run security:check
git ls-files .env
```

Both should show nothing tracked. `.env` stays local only.

### AWS billing alarm

1. AWS Console → **Billing and Cost Management** → **Budgets** → **Create budget**
2. Type: **Cost budget** → monthly → e.g. **$15**
3. Alert at **80%** and **100%** → email you
4. This does not block API abuse but warns you early.

Also verify IAM user `who-is-app` has **Rekognition-only** permissions (no S3, no admin).

---

## 2. Before wider sharing (implemented in code)

| Control | What it does |
|---------|----------------|
| **CORS** | Only listed origins can call the API from a browser. Production default: `https://who-is.onrender.com`. Set `CORS_ORIGINS` for custom domains (comma-separated). |
| **Rate limits** | Per IP: identify ~40/15min, admin verify ~10/15min, Wikipedia ~80/15min. Returns HTTP 429 when exceeded. |

Render: add env var if you use a custom domain:

```
CORS_ORIGINS=https://who-is.onrender.com,https://your-domain.com
```

Local dev allows `localhost:5173` automatically when `NODE_ENV` is not `production`.

---

## 3. Nice to have (implemented)

- **Wikipedia URL validation** on teach — only `https://*.wikipedia.org/wiki/...` links accepted
- **Removed** legacy `POST /api/recognize` (unfiltered celebrity endpoint)
- **Timing-safe** admin secret comparison
- **Health endpoint** no longer exposes internal store file paths

---

## Optional env vars

| Variable | Default | Purpose |
|----------|---------|---------|
| `CORS_ORIGINS` | prod: `who-is.onrender.com` | Allowed browser origins |
| `RATE_LIMIT_IDENTIFY_MAX` | 40 | Max identify requests per IP per window |
| `RATE_LIMIT_IDENTIFY_WINDOW_MS` | 900000 (15 min) | Identify rate window |
| `RATE_LIMIT_ADMIN_MAX` | 10 | Admin verify attempts per window |
| `RATE_LIMIT_WIKI_MAX` | 80 | Wikipedia proxy requests per window |
