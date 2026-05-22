@echo off
title Cabonnet React - Dev Mode
color 0B
cd /d "%~dp0"

echo.
echo  +======================================+
echo  |    CABONNET - MODO DESENVOLVIMENTO   |
echo  +======================================+
echo.

if not exist "node_modules" (
    echo  [!] Instalando dependencias...
    call npm install
)

echo  [*] Iniciando servidor unificado (Python + Vite HMR) na porta 3000...
echo  [*] Hot-reload ativo - salve arquivos para ver mudancas ao vivo.
echo.
start "" /b cmd /c "timeout /t 5 /nobreak >nul ^&^& start http://localhost:3000"
call npm run dev
