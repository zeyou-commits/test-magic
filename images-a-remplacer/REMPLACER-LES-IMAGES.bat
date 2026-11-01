@echo off
chcp 65001 >nul
setlocal
title BledWay - remplacer les images
call "%~dp0outil\preparer.bat"
if errorlevel 1 goto fin
%PY% "%~dp0outil\remplacer_images.py"
if errorlevel 1 (
  echo.
  echo   Un probleme est survenu. Copiez ce message a Claude.
  goto fin
)
if not defined BLEDWAY_AUTO start "" "%~dp0apercu.html"
:fin
if not defined BLEDWAY_AUTO pause
