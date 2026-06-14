# Who is? — Full launch walkthrough

Follow these steps in order: **GitHub → Render → Domain → Test**.

---

## Part A — Create the GitHub repository

### A1. Create a GitHub account (if needed)

1. Go to [https://github.com/signup](https://github.com/signup)
2. Complete registration and verify your email

### A2. Create an empty repo on GitHub

1. Go to [https://github.com/new](https://github.com/new)
2. Fill in:
   - **Repository name:** `who-is` (or `who-is-app`)
   - **Description:** `Who is? — identify public figures via camera`
   - **Public** or **Private** (either works with Render)
3. **Do NOT** check “Add a README”, “Add .gitignore”, or “Choose a license”  
   (you already have code locally)
4. Click **Create repository**
5. Keep the page open — you’ll need the URL, e.g.  
   `https://github.com/YOUR_USERNAME/who-is.git`

### A3. Push your project from the notebook

Open **PowerShell** and run (replace `YOUR_USERNAME`):

```powershell
cd C:\Users\thais\Projects\public-figure-spotter

git init
git branch -M main
git add .
git status
```

Confirm **`.env` is NOT listed** (it must stay local only).

Then:

```powershell
git commit -m "Initial commit: Who is? app"
git remote add origin https://github.com/YOUR_USERNAME/who-is.git
git push -u origin main
```

- GitHub may ask you to log in (browser or token).
- If `git` is not installed: [https://git-scm.com/download/win](https://git-scm.com/download/win)

---

## Part B — Choose a domain name

### What makes a good name for this app

| Criteria | Example |
|----------|---------|
| Short & memorable | `whois.app` |
| Matches the brand | `who-is.app` |
| Portuguese market | `queme.app`, `queme.com.br` |
| Clear purpose | `whoisthis.app` |

### How to check availability

1. Go to [https://www.cloudflare.com/products/registrar/](https://www.cloudflare.com/products/registrar/) or [Namecheap](https://www.namecheap.com)
2. Search your ideas
3. Prefer **`.app`** or **`.com`** for international users; **`.com.br`** for Brazil

### Recommendation

| Priority | Domain | Why |
|----------|--------|-----|
| 1st | `who-is.app` | Matches “Who is?” exactly |
| 2nd | `queme.app` | Natural in Portuguese |
| 3rd | `whoisthis.app` | Clear in English |

Buy **one** domain now (~$10–15/year). You can connect it after Render is live.

**Tip:** Buy the domain **after** Render works on the free `.onrender.com` URL, so you’re not waiting on DNS while debugging deploy.

---

## Part C — Deploy on Render (click-by-click)

### C1. Sign up

1. Go to [https://render.com](https://render.com)
2. Click **Get Started**
3. Sign up with **GitHub** (easiest — links your repos)

### C2. Create the web service

1. Dashboard → **New +** (top right) → **Web Service**
2. **Connect a repository**
   - If asked, authorize Render to access GitHub
   - Find **`who-is`** (or your repo name) → **Connect**
3. Configure the service:

| Field | Value |
|-------|--------|
| **Name** | `who-is` |
| **Region** | Choose closest to your users (e.g. Oregon or Frankfurt) |
| **Branch** | `main` |
| **Root Directory** | *(leave empty)* |
| **Runtime** | `Node` |
| **Build Command** | `npm run install:all && npm run build` |
| **Start Command** | `npm start` |
| **Instance type** | `Free` (upgrade later if needed) |

4. Expand **Advanced** → **Health Check Path:** `/api/health`

### C3. Add environment variables

Before clicking **Create Web Service**, open **Environment Variables** → **Add Environment Variable**:

| Key | Value |
|-----|--------|
| `NODE_VERSION` | `20` |
| `RECOGNITION_PROVIDER` | `aws` |
| `AWS_ACCESS_KEY_ID` | *(paste your AWS key)* |
| `AWS_SECRET_ACCESS_KEY` | *(paste your AWS secret)* |
| `AWS_REGION` | `us-east-1` |
| `MIN_CONFIDENCE` | `85` |

Click **Add** for each. Mark secrets as **secret** if Render offers that option.

### C4. Deploy

1. Click **Create Web Service**
2. Render will **Build** then **Deploy** (5–10 minutes first time)
3. Watch the **Logs** tab — wait until status is **Live** (green)
4. Open the URL at the top, e.g.  
   **`https://who-is.onrender.com`**

### C5. Test the live app

1. On your phone, open the Render URL (must be **https**)
2. Tap the **sight** → allow camera
3. Point at a celebrity photo → tap again to identify

If it works, production is live.

### C6. Auto-updates from Cursor

Render redeploys when you push to GitHub:

```powershell
# After changes in Cursor:
git add .
git commit -m "Describe your change"
git push
```

Render → **Events** tab shows the new deploy (2–5 min).

---

## Part D — Connect your custom domain

Do this **after** the `.onrender.com` URL works.

### D1. Add domain in Render

1. Render → your **who-is** service → **Settings**
2. Scroll to **Custom Domains**
3. Click **Add Custom Domain**
4. Enter: `whois.app` (or the domain you bought)
5. Optionally add `www.whois.app` as a second domain
6. Render shows DNS instructions (usually a **CNAME** target like `who-is.onrender.com`)

### D2. Configure DNS at your registrar

**If using Cloudflare:**

1. Cloudflare → your domain → **DNS** → **Records**
2. Add record:

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `@` | `who-is.onrender.com` | DNS only (grey cloud) |
| CNAME | `www` | `who-is.onrender.com` | DNS only |

**If using Namecheap / Registro.br:**

- Use the exact CNAME/A records Render displays (copy from Render UI)

### D3. Wait for SSL

- DNS propagation: **5 minutes to 48 hours** (often under 1 hour)
- Render issues **free HTTPS** automatically
- When ready, **https://yourdomain.app** opens the app

---

## Part E — Keep developing in Cursor

| Task | Where |
|------|--------|
| Edit UI, logic, styles | Cursor → local project |
| Test | `start-all.cmd` or `npm.cmd run dev` → localhost |
| Publish | `git push` → Render redeploys |
| Change AWS keys | Render → Environment |
| Change domain | Registrar DNS + Render Custom Domains |

Your local `.env` stays on the notebook only. Production uses Render’s environment variables.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails on Render | Check **Logs** — often missing `npm run install:all` |
| `provider: mock` on live site | Set `RECOGNITION_PROVIDER=aws` in Render env |
| Camera blocked on phone | URL must be **https** (Render provides this) |
| Site slow first visit | Free tier slept — upgrade to paid or wait ~30s |
| Domain not working | Wait for DNS; verify CNAME matches Render exactly |

---

## Checklist

- [ ] GitHub repo created and code pushed
- [ ] Render web service **Live**
- [ ] `/api/health` shows `"provider":"aws"`
- [ ] Phone test on Render URL works
- [ ] Domain purchased
- [ ] Custom domain connected + HTTPS
- [ ] Share **https://yourdomain.app** with users
