@echo off
cd /d "%~dp0"
echo.
echo  Starting Who is? ...
echo.
start "Who is? - Server" cmd /k "cd /d %~dp0server && npm.cmd run dev"
timeout /t 2 /nobreak >nul
start "Who is? - Client" cmd /k "cd /d %~dp0client && npm.cmd run dev"
echo  Two windows opened. Wait a few seconds, then open:
echo.
echo    http://localhost:5173
echo.
echo  Preview (no camera): http://localhost:5173/preview.html
echo.
pause
