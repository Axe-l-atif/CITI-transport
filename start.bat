@echo off
cd /d "%~dp0"
echo Demarrage CITI sur le reseau local...
set CITI_HOST=0.0.0.0
set CITI_PORT=5000
set CITI_DEBUG=0
set CITI_SERVER=waitress
py app.py
