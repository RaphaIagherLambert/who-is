@echo off
setlocal
cd /d "%~dp0"
echo === Who is? - commit and push to Render ===
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js not found. Open a terminal where "node" works, or install Node 20+.
  echo Then run: deploy-to-render.cmd
  pause
  exit /b 1
)

node server\scripts\sync-wikidata-index.mjs
if errorlevel 1 (
  echo.
  echo Sync failed. Run an import first if you have not indexed anyone yet.
  pause
  exit /b 1
)

echo.
git status -sb
echo.

git add -A
git reset -- .env .env.* 2>nul
git add -f server\src\data\wikidata-index.json 2>nul

git diff --cached --quiet
if not errorlevel 1 (
  echo Nothing to commit. Working tree already matches the last deploy.
  git status -sb
  pause
  exit /b 0
)

echo Staged files:
git diff --cached --name-only
echo.

git commit -m "Deploy Wikidata index and app updates for production."
if errorlevel 1 (
  echo Commit failed.
  pause
  exit /b 1
)

git push -u origin HEAD
if errorlevel 1 (
  echo Push failed. Check GitHub login / network.
  pause
  exit /b 1
)

echo.
echo Done. Render should start deploying shortly.
echo Check: https://who-is.onrender.com/api/health
git rev-parse HEAD
echo.
pause
