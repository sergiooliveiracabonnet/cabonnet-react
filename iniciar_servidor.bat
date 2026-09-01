@echo off
title CaboNet Server
cd /d "%~dp0"
echo ========================================================
echo   CaboNet Server — React
echo ========================================================
echo.
echo   [1] Iniciar com janela (ver logs em tempo real)
echo   [2] Iniciar em segundo plano (sem janela)
echo   [3] Parar servidor
echo.
set /p MODO="   Escolha [1/2/3]: "

if "%MODO%"=="2" (
    cscript //nologo "%~dp0iniciar_bg.vbs"
    echo   Servidor iniciado em segundo plano.
    pause
    exit /b
)
if "%MODO%"=="3" (
    call "%~dp0parar_servidor.bat"
    exit /b
)

:: Modo 1 — com janela
echo.
echo   Iniciando servidor... Nao feche esta janela!
echo.
python cabonnet_server.py
pause
