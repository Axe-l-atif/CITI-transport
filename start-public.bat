@echo off
cd /d "%~dp0"
echo.
echo  CTI Transport Abidjan — tunnel public (Cloudflare)
echo  =============================================
echo.

set "CF=%~dp0cloudflared.exe"
if not exist "%CF%" (
  where cloudflared >nul 2>&1
  if errorlevel 1 (
    echo cloudflared introuvable. Telechargement en cours...
    powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%CF%' -UseBasicParsing"
    if not exist "%CF%" (
      echo Echec du telechargement. Installez manuellement :
      echo https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/download/
      pause
      exit /b 1
    )
    echo Telechargement termine.
    echo.
  ) else (
    set "CF=cloudflared"
  )
) else (
  set "CF=%~dp0cloudflared.exe"
)

set CITI_HOST=127.0.0.1
set CITI_PORT=5002
set CITI_DEBUG=0
set CITI_SERVER=waitress

netstat -ano | findstr ":5002 " | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
  echo Demarrage du serveur CTI...
  start "CTI Server" /MIN cmd /c "cd /d "%~dp0" && set CITI_PORT=5002 && py app.py"
  echo Attente du serveur...
  timeout /t 4 /nobreak >nul
) else (
  echo Serveur deja actif sur le port 5002.
)

echo.
echo ====================================================
echo  Copiez l'URL https://....trycloudflare.com ci-dessous
echo  Partagez-la pour acceder a CTI Transport depuis Internet.
echo  Ctrl+C = arreter le tunnel (le serveur reste actif)
echo ====================================================
echo.
"%CF%" tunnel --url http://127.0.0.1:5002
