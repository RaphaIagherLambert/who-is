@echo off

echo Checking http://localhost:3001/api/health ...

echo.

curl -s -w "\nHTTP status: %%{http_code}\n" http://localhost:3001/api/health

if errorlevel 1 (

  echo.

  echo Server is NOT running.

  echo Double-click start-server.cmd and wait for "Server running on port 3001"

)

echo.

pause

