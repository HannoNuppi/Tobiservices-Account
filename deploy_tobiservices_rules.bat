@echo off
setlocal
title TobiServices - Firestore Rules Deployment
cd /d "%~dp0"

echo.
echo ==================================================
echo  TobiServices - Firestore-Regeln veroeffentlichen
echo ==================================================
echo.
echo Projekt: tobiservices
echo Es werden NUR Firestore-Regeln veroeffentlicht.
echo Firebase Functions, Hosting und andere Projekte bleiben unberuehrt.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo FEHLER: Node.js wurde nicht gefunden.
  echo Installiere Node.js LTS und starte diese Datei erneut.
  pause
  exit /b 1
)

where firebase >nul 2>&1
if not errorlevel 1 (
  echo Firebase CLI gefunden. Deploy wird gestartet...
  call firebase deploy --only firestore:rules --project tobiservices
  if errorlevel 1 goto :failed
) else (
  echo Firebase CLI nicht global installiert; verwende npx...
  call npx --yes firebase-tools@latest deploy --only firestore:rules --project tobiservices
  if errorlevel 1 goto :failed
)

echo.
echo ERFOLG: Firestore-Regeln fuer tobiservices wurden veroeffentlicht.
echo Du kannst Untis Next jetzt mit Strg+F5 neu laden.
pause
exit /b 0

:failed
echo.
echo DEPLOY FEHLGESCHLAGEN.
echo.
echo Pruefe, ob du mit einem Firebase-Konto angemeldet bist, das Schreibrechte
echo fuer das Projekt tobiservices hat. Bei Bedarf zuerst ausfuehren:
echo   firebase login
echo Danach diese Datei erneut starten.
pause
exit /b 1
