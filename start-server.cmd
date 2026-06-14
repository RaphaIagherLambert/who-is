@echo off
cd /d "%~dp0server"
echo.
echo  Who is? - API Server
echo  http://localhost:3001
echo.
npm.cmd run dev
pause
