# Deploy guide — Who is?

Publish the app on the internet with HTTPS and a custom domain (e.g. `https://whois.app`).

## What you need

| Item | Purpose |
|------|---------|
| **Hosting** | Runs your app 24/7 (Render, Railway, etc.) |
| **Domain name** | Commercial URL (`whois.app`, `queme.app`, …) |
| **AWS keys** | Real celebrity recognition (already configured) |
| **HTTPS** | Required for camera on phones — hosts provide this free |

---

## Recommended path: Render + custom domain

### Step 1 — Put code on GitHub

1. Create a repo at [github.com/new](https://github.com/new)
2. In PowerShell:

```powershell
cd C:\Users\thais\Projects\public-figure-spotter
git add .
git commit -m "Prepare Who is? for production deploy"
git remote add origin https://github.com/YOUR_USER/who-is.git
git push -u origin main
```

Do **not** commit `.env` (it is in `.gitignore`).

---

### Step 2 — Deploy on Render

1. Go to [render.com](https://render.com) → sign up (free)
2. **New** → **Blueprint** → connect GitHub → select your repo  
   (Or **New Web Service** manually)
3. Render reads `render.yaml` and creates the service
4. In **Environment**, add secrets:

| Key | Value |
|-----|--------|
| `RECOGNITION_PROVIDER` | `aws` |
| `AWS_ACCESS_KEY_ID` | your key |
| `AWS_SECRET_ACCESS_KEY` | your secret |
| `AWS_REGION` | `us-east-1` |
| `MIN_CONFIDENCE` | `85` |

5. Deploy. You get a URL like: `https://who-is-xxxx.onrender.com`

Test: open that URL on your phone → tap the sight → camera should work (HTTPS).

**Note:** Free tier sleeps after inactivity (~50s cold start on first visit).

---

### Step 3 — Buy a domain (commercial URL)

Registrars (pick one):

- [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/) — at-cost pricing, easy DNS
- [Namecheap](https://www.namecheap.com)
- [Registro.br](https://registro.br) — for `.com.br` (Brazil)

Name ideas for **Who is?**:

- `whois.app` / `who-is.app`
- `queme.app` / `queme.com.br` (Portuguese)
- `whoisthis.app`
- `spotwho.app`

Search availability and buy the one you like (~$10–15/year for `.com`, `.app` varies).

---

### Step 4 — Connect domain to Render

1. Render dashboard → your service → **Settings** → **Custom Domains**
2. Add `whois.app` and `www.whois.app`
3. Render shows DNS records (usually a **CNAME**)
4. In your domain registrar (or Cloudflare DNS):

| Type | Name | Value |
|------|------|--------|
| CNAME | `@` or `www` | `who-is-xxxx.onrender.com` |

(Exact values come from Render’s UI.)

5. Wait 5–60 minutes for DNS + free SSL certificate
6. Your app is live at **`https://whois.app`**

---

## Alternative hosts

| Host | Pros | Custom domain |
|------|------|----------------|
| [Render](https://render.com) | Simple, free tier | Yes |
| [Railway](https://railway.app) | Easy Node deploy | Yes |
| [Fly.io](https://fly.io) | Global edge | Yes |
| [DigitalOcean App Platform](https://www.cloudflare.com/products/registrar/) | Stable | Yes |

All support Node.js + env vars + HTTPS.

---

## Costs (rough)

| Service | Cost |
|---------|------|
| Domain | ~$10–15 / year |
| Render free | $0 (sleeps when idle) |
| Render paid | ~$7 / month (always on) |
| AWS Rekognition | Pay per image (~$0.001 each) |

Set **AWS Budgets** alerts in AWS Console to avoid surprises.

---

## Before going public

- [ ] `RECOGNITION_PROVIDER=aws` on host (not `mock`)
- [ ] Privacy note: users’ camera frames go to your server + AWS
- [ ] Terms / privacy policy (recommended for a public app)
- [ ] Test on **iPhone Safari** and **Android Chrome**

---

## Local production test

```powershell
cd C:\Users\thais\Projects\public-figure-spotter
npm run install:all
npm run build
npm start
```

Open **http://localhost:3001** (single port — app + API together).
