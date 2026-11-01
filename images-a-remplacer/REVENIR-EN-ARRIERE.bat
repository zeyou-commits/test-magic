@echo off
chcp 65001 >nul
setlocal
title BledWay - revenir en arriere
call "%~dp0outil\preparer.bat"
if errorlevel 1 goto fin
echo.
echo   Tapez le nom d'une image pour la remettre comme avant (exemple : 01_valise_pleine).
echo   Pour remettre TOUTES les anciennes images, tapez le mot : toutes
echo   Pour ne rien changer, fermez simplement cette fenetre.
echo.
if defined BLEDWAY_AUTO (set "NOM=%BLEDWAY_AUTO%") else (set /p "NOM=Votre choix : ")
if not defined NOM goto fin
if /i "%NOM%"=="toutes" (
  %PY% "%~dp0outil\remplacer_images.py" --restaurer
) else (
  %PY% "%~dp0outil\remplacer_images.py" --restaurer "%NOM%"
)
if not defined BLEDWAY_AUTO start "" "%~dp0apercu.html"
:fin
if not defined BLEDWAY_AUTO pause
