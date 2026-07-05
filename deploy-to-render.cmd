@echo off
cd /d "%~dp0"
echo === Who is? — commit and push to Render ===
echo.

node server\scripts\sync-wikidata-index.mjs
if errorlevel 1 (
  echo Could not sync Wikidata index. Is server\data\wikidata-us-actors.json present?
  exit /b 1
)

git status -sb
echo.

git add -A
git reset -- .env .env.* 2>nul
git add -f server\src\data\wikidata-index.json 2>nul

echo Staged files:
git status -sb
echo.

git diff --cached --name-only | findstr /i "wikidata-index.json" >nul
if errorlevel 1 (
  echo ERROR: server\src\data\wikidata-index.json is NOT staged. Aborting.
  exit /b 1
)

git commit -m "Include Wikidata face index for production health and name lookup."
if errorlevel 1 (
  echo No commit created ^(maybe nothing changed^).
)

git push -u origin HEAD
if errorlevel 1 (
  echo Push failed. Check your GitHub connection.
  exit /b 1
)

echo.
echo Done. Render should start deploying shortly.
echo After deploy, check: https://who-is.onrender.com/api/health
git rev-parse HEAD
