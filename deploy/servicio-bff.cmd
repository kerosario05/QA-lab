@echo off
REM ---------------------------------------------------------------------------
REM  Arranca el BFF de QA Lab, que sirve el front y expone /api.
REM
REM  Este es el unico proceso que ven los usuarios: el motor escucha solo en
REM  127.0.0.1 y nunca se publica.
REM
REM  Colocar este archivo en la carpeta deploy\ de qa-lab, o ajustar APP_DIR.
REM
REM  Alta de la tarea (consola elevada, una sola vez):
REM    schtasks /create /tn "QA Lab - BFF" /tr "C:\qa\app\qa-lab\deploy\servicio-bff.cmd" ^
REM             /sc onstart /ru "DOMINIO\cuenta" /rp * /rl LIMITED
REM ---------------------------------------------------------------------------

setlocal

set "APP_DIR=%~dp0.."
cd /d "%APP_DIR%" || exit /b 1

if not exist "node_modules\tsx\dist\cli.mjs" (
  echo [bff] FALTA node_modules o tsx en %APP_DIR%
  exit /b 1
)

if not exist "dist\index.html" (
  echo [bff] AVISO: no hay dist\ - el front no se servira, solo la API
)

set "LOG_DIR=C:\qa\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" 2>nul

for /f "tokens=1-3 delims=/- " %%a in ("%DATE%") do set "STAMP=%%c%%b%%a"
set "LOG=%LOG_DIR%\bff-%STAMP%.log"

echo. >>"%LOG%"
echo ============================================================ >>"%LOG%"
echo [%DATE% %TIME%] arrancando BFF >>"%LOG%"

node node_modules\tsx\dist\cli.mjs server\index.ts >>"%LOG%" 2>&1

echo [%DATE% %TIME%] el BFF termino con codigo %ERRORLEVEL% >>"%LOG%"
endlocal
