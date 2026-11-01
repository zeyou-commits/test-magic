@echo off
rem Trouve Python et installe Pillow si besoin. Definit PY pour le fichier appelant.
set "PYTHONUTF8=1"
set "PYTHONDONTWRITEBYTECODE=1"
set "PY="
py -3 --version >nul 2>&1 && set "PY=py -3"
if not defined PY python --version >nul 2>&1 && set "PY=python"
if not defined PY (
  echo.
  echo   Python n'est pas installe sur cet ordinateur.
  echo   Installez-le gratuitement depuis https://www.python.org/downloads/
  echo   en cochant la case "Add python.exe to PATH", puis relancez ce fichier.
  exit /b 1
)
%PY% -c "import PIL" >nul 2>&1
if errorlevel 1 (
  echo   Installation de Pillow, une seule fois...
  %PY% -m pip install --user --quiet pillow
  %PY% -c "import PIL" >nul 2>&1
  if errorlevel 1 (
    echo   Pillow n'a pas pu etre installe. Verifiez votre connexion internet puis relancez.
    exit /b 1
  )
)
exit /b 0
