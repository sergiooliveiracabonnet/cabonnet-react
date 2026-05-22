@echo off
title Parar CaboNet
echo Encerrando servidor CaboNet...
taskkill /F /FI "WINDOWTITLE eq CaboNet Server" /T >nul 2>&1
taskkill /F /FI "IMAGENAME eq python.exe" /FI "COMMANDLINE eq *cabonnet_server*" /T >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5001 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
if exist "%~dp0cabonnet_server.lock" del /F /Q "%~dp0cabonnet_server.lock" >nul 2>&1
echo Servidor encerrado.
pause
