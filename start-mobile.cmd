@echo off
cd /d "%~dp0"
echo.
echo  Who is? - Mobile access
echo  =====================
echo.
echo  1. Phone and notebook must be on the SAME Wi-Fi
echo  2. Starting server + client...
echo.
start "Who is? - Server" cmd /k "cd /d %~dp0server && npm.cmd run dev"
timeout /t 2 /nobreak >nul
start "Who is? - Client" cmd /k "cd /d %~dp0client && npm.cmd run dev"
echo.
echo  3. Find your notebook IP (look for IPv4, e.g. 192.168.1.42):
echo.
ipconfig | findstr /i "IPv4"
echo.
echo  4. On your phone browser, open:
echo.
echo       http://YOUR_IP:5173
echo.
echo     Example: http://192.168.1.42:5173
echo.
echo  5. If the camera does not work on phone, use HTTPS (see guide below).
echo.
echo  Also check the Client window for:  Network: http://192.168.x.x:5173/
echo.
pause
