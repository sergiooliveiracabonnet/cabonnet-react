@echo off
title Cabonnet — Instalador
color 0A
cd /d "%~dp0"

echo.
echo  ╔══════════════════════════════════════╗
echo  ║       CABONNET REACT — INSTALADOR    ║
echo  ╚══════════════════════════════════════╝
echo.
echo  PRE-REQUISITOS NECESSARIOS:
echo    - Python 3.9+  (https://www.python.org/downloads/)
echo      IMPORTANTE: marque "Add Python to PATH" na instalacao
echo    - Node.js 18+  (https://nodejs.org/en/download/)
echo      Recomendado: versao LTS
echo.
echo  Se nao tiver instalados, o instalador abrira os links automaticamente.
echo.

:: Verifica se PowerShell esta disponivel
where powershell >nul 2>&1
if errorlevel 1 (
    echo  [ERRO] PowerShell nao encontrado. Instale o PowerShell 5+.
    pause
    exit /b 1
)

:: Executa o instalador PowerShell com politica de execucao permitida
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"
