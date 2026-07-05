@echo off

cd /d "%~dp0server"

echo.

echo  Who is? - API Server

echo  ====================

echo.

echo  Starting on http://localhost:3001

echo  Health check: http://localhost:3001/api/health

echo.

echo  KEEP THIS WINDOW OPEN while using the app.

echo  Press Ctrl+C to stop the server.

echo.

npm.cmd run dev

if errorlevel 1 (

  echo.

  echo  ERROR: Server failed to start.

  echo  Try: cd server ^&^& npm.cmd install ^&^& npm.cmd run dev

  echo.

)

pause

