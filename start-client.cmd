@echo off
cd /d "%~dp0client"
echo.
echo  Who is? - Client
echo  http://localhost:5173
echo.
npm.cmd run dev
pause
