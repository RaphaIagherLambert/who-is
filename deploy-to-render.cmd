@echo off
cd /d "%~dp0"
echo === Who is? — commit and push to Render ===
echo.

git status -sb
echo.

git add -A
git reset -- .env .env.* 2>nul

echo Staged files:
git status -sb
echo.

git commit -m "Deploy Wikidata index and EU import pipeline for production."
if errorlevel 1 (
  echo No commit created ^(maybe nothing changed or already committed^).
)

git push -u origin HEAD
if errorlevel 1 (
  echo Push failed. Check your GitHub connection.
  exit /b 1
)

echo.
echo Done. Render should start deploying shortly.
echo Check: https://dashboard.render.com
git rev-parse HEAD
