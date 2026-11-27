@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0.verification\windows-local-root.pem" set "NODE_EXTRA_CA_CERTS=%~dp0.verification\windows-local-root.pem"
call npm.cmd run dev -w @scm/web -- --hostname 127.0.0.1 --port 3000
exit /b %errorlevel%
