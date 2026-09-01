@echo off
title Cabonnet App — Servidor de Desenvolvimento
color 0A
cd /d "%~dp0"

echo.
echo  ╔══════════════════════════════════════╗
echo  ║        CABONNET ISP DASHBOARD        ║
echo  ╚══════════════════════════════════════╝
echo.

:: Verifica se node_modules existe
if not exist "node_modules" (
    echo  [!] Dependencias nao encontradas. Instalando...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo  [ERRO] Falha ao instalar dependencias.
        pause
        exit /b 1
    )
)

echo  [*] Iniciando servidor de desenvolvimento...
echo  [*] O app estara disponivel em: http://localhost:3000
echo.
echo  Para encerrar, pressione Ctrl+C nesta janela.
echo.

:: Aguarda 2 segundos e abre o browser automaticamente
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

call npm run dev

echo.
echo  [*] Servidor encerrado.
pause
