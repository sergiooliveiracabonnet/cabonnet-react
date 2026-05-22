# ==============================================================================
#  Cabonnet React - Instalador Automatico v2026.9
#  ASCII-only: compativel com qualquer codificacao do Windows
# ==============================================================================
#  Ordem de instalacao:
#    1. Python 3.9+  ->  via winget se ausente  ->  pip  ->  requests + urllib3
#    2. Node.js 18+  ->  via winget se ausente  ->  npm 8+
#    3. npm ci/install  ->  npm run build
#    4. .env  ->  scripts  ->  firewall  ->  atalhos
# ==============================================================================
$ErrorActionPreference = "Continue"

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$NODE_MIN   = 18
$NPM_MIN    = 8
$PYTHON_MIN = 9
$VERSION    = "2026.9"

Set-Location $SCRIPT_DIR

Clear-Host
Write-Host ""
Write-Host "  +--------------------------------------------------+" -ForegroundColor Cyan
Write-Host "  |        CABONNET REACT - INSTALADOR               |" -ForegroundColor Cyan
Write-Host "  |             Versao $VERSION                        |" -ForegroundColor Cyan
Write-Host "  +--------------------------------------------------+" -ForegroundColor Cyan
Write-Host ""

# -- Privilegios ---------------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "  [!] Sem privilegios de Administrador." -ForegroundColor Yellow
    Write-Host "      Firewall e atalhos podem nao ser configurados." -ForegroundColor Yellow
    Write-Host "      Para instalacao completa: botao direito -> Executar como Administrador" -ForegroundColor Yellow
    Write-Host ""
}

# -- winget disponivel? --------------------------------------------------------
$hasWinget = $null -ne (Get-Command winget -ErrorAction SilentlyContinue)
if ($hasWinget) {
    Write-Host "  [OK] winget disponivel - instalacao automatica ativada" -ForegroundColor DarkGreen
} else {
    Write-Host "  [!] winget nao encontrado - instalacoes manuais serao necessarias" -ForegroundColor Yellow
}
Write-Host ""

# -- Funcao: instalar via winget e atualizar PATH ------------------------------
function Invoke-WingetInstall {
    param([string]$Name, [string]$Id)
    Write-Host "        Instalando $Name via winget (aguarde)..." -ForegroundColor Gray
    winget install --id $Id --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
    # Atualiza PATH da sessao atual para reconhecer o novo executavel
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path","User")
}

# ==============================================================================
#  1/7 - PYTHON 3.9+
# ==============================================================================
Write-Host "  [1/7] Verificando Python..." -ForegroundColor Cyan

function Find-Python {
    foreach ($cmd in @("python", "python3", "py")) {
        try {
            $rawVer = & $cmd --version 2>&1
            $verStr = if ($rawVer -is [System.Management.Automation.ErrorRecord]) { $rawVer.ToString() } else { "$rawVer" }
            if ($verStr -match "Python 3\.(\d+)" -and [int]$Matches[1] -ge $PYTHON_MIN) {
                return $cmd
            }
        } catch { }
    }
    return $null
}

$pythonCmd = Find-Python

if (-not $pythonCmd) {
    if ($hasWinget) {
        Write-Host "        Python nao encontrado - instalando automaticamente..." -ForegroundColor Yellow
        Invoke-WingetInstall -Name "Python 3" -Id "Python.Python.3"
        $pythonCmd = Find-Python
    }
    if (-not $pythonCmd) {
        Write-Host ""
        Write-Host "  +--------------------------------------------------+" -ForegroundColor Red
        Write-Host "  |   PYTHON 3.$PYTHON_MIN+ NAO ENCONTRADO                    |" -ForegroundColor Red
        Write-Host "  +--------------------------------------------------+" -ForegroundColor Red
        Write-Host ""
        Write-Host "  1. Acesse: https://www.python.org/downloads/" -ForegroundColor Yellow
        Write-Host "  2. Baixe a versao mais recente do Python 3" -ForegroundColor Yellow
        Write-Host "  3. MARQUE 'Add Python to PATH' durante a instalacao" -ForegroundColor Yellow
        Write-Host "  4. Apos instalar, execute este instalador novamente" -ForegroundColor Yellow
        Write-Host ""
        $resp = Read-Host "  Abrir site de download agora? [S/N]"
        if ($resp -match "^[Ss]") { Start-Process "https://www.python.org/downloads/" }
        Read-Host "  Pressione Enter para sair"
        exit 1
    }
}

$pyVer = & $pythonCmd --version 2>&1
Write-Host "        [OK] $pyVer" -ForegroundColor Green

# ==============================================================================
#  2/7 - NODE.JS 18+  e  NPM 8+
# ==============================================================================
Write-Host ""
Write-Host "  [2/7] Verificando Node.js..." -ForegroundColor Cyan

function Find-NodeOk {
    try {
        $v = & node --version 2>&1
        return "$v" -match "v(\d+)\." -and [int]$Matches[1] -ge $NODE_MIN
    } catch { return $false }
}

if (-not (Find-NodeOk)) {
    if ($hasWinget) {
        Write-Host "        Node.js nao encontrado - instalando automaticamente..." -ForegroundColor Yellow
        Invoke-WingetInstall -Name "Node.js LTS" -Id "OpenJS.NodeJS.LTS"
    }
    if (-not (Find-NodeOk)) {
        Write-Host ""
        Write-Host "  +--------------------------------------------------+" -ForegroundColor Red
        Write-Host "  |   NODE.JS $NODE_MIN+ NAO ENCONTRADO                      |" -ForegroundColor Red
        Write-Host "  +--------------------------------------------------+" -ForegroundColor Red
        Write-Host ""
        Write-Host "  1. Acesse: https://nodejs.org/en/download/" -ForegroundColor Yellow
        Write-Host "  2. Baixe a versao LTS (recomendada)" -ForegroundColor Yellow
        Write-Host "  3. Instale e execute este instalador novamente" -ForegroundColor Yellow
        Write-Host ""
        $resp = Read-Host "  Abrir site de download agora? [S/N]"
        if ($resp -match "^[Ss]") { Start-Process "https://nodejs.org/en/download/" }
        Read-Host "  Pressione Enter para sair"
        exit 1
    }
}

$nodeVerStr = "$(& node --version 2>&1)"
$npmVerStr  = "$(& npm --version 2>&1)"
Write-Host "        [OK] Node.js $nodeVerStr" -ForegroundColor Green

if ($npmVerStr -match "^(\d+)\." -and [int]$Matches[1] -lt $NPM_MIN) {
    Write-Host "        [!] npm $npmVerStr desatualizado - atualizando..." -ForegroundColor Yellow
    & npm install -g npm@latest 2>&1 | Out-Null
    $npmVerStr = "$(& npm --version 2>&1)"
}
Write-Host "        [OK] npm $npmVerStr" -ForegroundColor Green

# ==============================================================================
#  3/7 - PIP + PACOTES PYTHON
# ==============================================================================
Write-Host ""
Write-Host "  [3/7] Preparando ambiente Python..." -ForegroundColor Cyan

$pipOk = $false
try {
    $pipVer = & $pythonCmd -m pip --version 2>&1
    if ("$pipVer" -match "pip") { $pipOk = $true }
} catch { }

if (-not $pipOk) {
    Write-Host "        pip nao encontrado - ativando via ensurepip..." -ForegroundColor Yellow
    & $pythonCmd -m ensurepip --upgrade 2>&1 | Out-Null
    try {
        if ("$(& $pythonCmd -m pip --version 2>&1)" -match "pip") { $pipOk = $true }
    } catch { }
    if (-not $pipOk) {
        Write-Host "  [ERRO] pip nao disponivel. Reinstale o Python marcando a opcao 'pip'." -ForegroundColor Red
        Read-Host "  Pressione Enter para sair"
        exit 1
    }
}

Write-Host "        Atualizando pip..." -ForegroundColor Gray
& $pythonCmd -m pip install --quiet --upgrade pip 2>&1 | Out-Null
Write-Host "        [OK] pip atualizado" -ForegroundColor Green

foreach ($pkg in @("requests", "urllib3")) {
    Write-Host "        Instalando $pkg..." -ForegroundColor Gray
    & $pythonCmd -m pip install --quiet --upgrade $pkg 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [ERRO] Falha ao instalar $pkg." -ForegroundColor Red
        Read-Host "  Pressione Enter para sair"
        exit 1
    }
    Write-Host "        [OK] $pkg" -ForegroundColor Green
}

$testPy = & $pythonCmd -c "import requests, urllib3; print('OK')" 2>&1
if ("$testPy" -notmatch "OK") {
    Write-Host "  [ERRO] Importacao dos pacotes falhou: $testPy" -ForegroundColor Red
    Read-Host "  Pressione Enter para sair"
    exit 1
}
Write-Host "        [OK] Pacotes Python funcionando" -ForegroundColor Green

# ==============================================================================
#  4/7 - NPM INSTALL
# ==============================================================================
Write-Host ""
Write-Host "  [4/7] Instalando dependencias npm..." -ForegroundColor Cyan

$lockFile = Join-Path $SCRIPT_DIR "package-lock.json"
if (Test-Path $lockFile) {
    Write-Host "        npm ci (package-lock.json encontrado)..." -ForegroundColor Gray
    $out  = & npm ci 2>&1
    $code = $LASTEXITCODE
} else {
    Write-Host "        npm install..." -ForegroundColor Gray
    $out  = & npm install 2>&1
    $code = $LASTEXITCODE
}

if ($code -ne 0) {
    Write-Host "        [!] Falha - tentando --legacy-peer-deps..." -ForegroundColor Yellow
    $out  = & npm install --legacy-peer-deps 2>&1
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        Write-Host "  [ERRO] Nao foi possivel instalar dependencias npm: $out" -ForegroundColor Red
        Read-Host "  Pressione Enter para sair"
        exit 1
    }
}
Write-Host "        [OK] node_modules instalados" -ForegroundColor Green

# ==============================================================================
#  5/7 - BUILD REACT
# ==============================================================================
Write-Host ""
Write-Host "  [5/7] Compilando frontend React..." -ForegroundColor Cyan
Write-Host "        (pode levar 30-60 segundos na primeira vez)" -ForegroundColor Gray
Write-Host ""

$buildOut  = & npm run build 2>&1
$buildCode = $LASTEXITCODE

$buildOut | Where-Object {
    $_ -and $_ -notmatch "^\s*$" -and $_ -notmatch "^> cabonnet" -and $_ -notmatch "^> vite build"
} | Select-Object -First 20 | ForEach-Object { Write-Host "        $_" -ForegroundColor DarkGray }

if ($buildCode -ne 0) {
    Write-Host ""
    Write-Host "  [ERRO] Falha ao compilar o frontend React (exit $buildCode)." -ForegroundColor Red
    Read-Host "  Pressione Enter para sair"
    exit 1
}

if (-not (Test-Path (Join-Path $SCRIPT_DIR "dist\index.html"))) {
    Write-Host "  [ERRO] dist\index.html nao foi gerado." -ForegroundColor Red
    Read-Host "  Pressione Enter para sair"
    exit 1
}
Write-Host "        [OK] Build gerado em dist/" -ForegroundColor Green

# ==============================================================================
#  6/7 - .ENV
# ==============================================================================
Write-Host ""
Write-Host "  [6/7] Verificando configuracao (.env)..." -ForegroundColor Cyan

$envFile = Join-Path $SCRIPT_DIR ".env"
if (Test-Path $envFile) {
    Write-Host "        [OK] .env ja existe - mantido sem alteracoes" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "  +--------------------------------------------------+" -ForegroundColor Yellow
    Write-Host "  |      CONFIGURACAO INICIAL DE CREDENCIAIS         |" -ForegroundColor Yellow
    Write-Host "  +--------------------------------------------------+" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Valores entre [ ] sao os padroes - Enter para aceitar." -ForegroundColor Gray
    Write-Host ""

    $defUrl    = "https://cabonnet-monitoramento.interfocus.com.br:3000"
    $defDs     = "d6a567f6-2d83-4ac1-99f9-6ed073fa40aa"
    $defMonUrl = "https://monitoramento.cabonnet.com.br"
    $defMonDs  = "e5b84361-6d5f-4c2e-8d77-60c2c1a2e227"
    $defImaUrl = "https://imanagergerencialcentral.cabonnet.com.br"

    Write-Host "  -- Grafana Gerencial (OS) --------------------------" -ForegroundColor DarkCyan
    $gUrl = Read-Host "  URL Grafana [$defUrl]"
    if (-not $gUrl) { $gUrl = $defUrl }

    $gUser = ""
    while (-not $gUser) {
        $gUser = Read-Host "  Usuario (ex: nome@cabonnet.com.br)"
        if (-not $gUser) { Write-Host "  Usuario e obrigatorio." -ForegroundColor Red }
    }
    $gPass = ""
    while (-not $gPass) {
        $gPass = Read-Host "  Senha Grafana"
        if (-not $gPass) { Write-Host "  Senha e obrigatoria." -ForegroundColor Red }
    }
    $gDs = Read-Host "  Datasource UID [$defDs]"
    if (-not $gDs) { $gDs = $defDs }

    Write-Host ""
    Write-Host "  -- Grafana Monitoramento (Juniper/PPPoE) -----------" -ForegroundColor DarkCyan
    $mUrl = Read-Host "  URL Monitor [$defMonUrl]"
    if (-not $mUrl) { $mUrl = $defMonUrl }

    $userPart = $gUser.Split("@")[0]
    $mUser = Read-Host "  Usuario Monitor [$userPart]"
    if (-not $mUser) { $mUser = $userPart }
    $mPass = Read-Host "  Senha Monitor [mesma do Grafana]"
    if (-not $mPass) { $mPass = $gPass }
    $mDs = Read-Host "  Datasource UID Monitor [$defMonDs]"
    if (-not $mDs) { $mDs = $defMonDs }

    Write-Host ""
    Write-Host "  -- iManager BI -------------------------------------" -ForegroundColor DarkCyan
    $iUrl = Read-Host "  URL iManager [$defImaUrl]"
    if (-not $iUrl) { $iUrl = $defImaUrl }
    $iUser = Read-Host "  Usuario iManager [$gUser]"
    if (-not $iUser) { $iUser = $gUser }
    $iPass = Read-Host "  Senha iManager [mesma do Grafana]"
    if (-not $iPass) { $iPass = $gPass }

    Write-Host ""
    Write-Host "  -- Dashboard Login ---------------------------------" -ForegroundColor DarkCyan
    $lUser = Read-Host "  Usuario do painel [gestao]"
    if (-not $lUser) { $lUser = "gestao" }
    $lPass = ""
    while (-not $lPass) {
        $lPass = Read-Host "  Senha do painel"
        if (-not $lPass) { Write-Host "  Senha do painel e obrigatoria." -ForegroundColor Red }
    }

    Write-Host ""
    Write-Host "  -- Telegram (opcional - Enter para pular) ----------" -ForegroundColor DarkCyan
    $tBot  = Read-Host "  Token do Bot Telegram"
    $tChat = Read-Host "  Chat ID Principal (Produtividade)"
    $tInst = Read-Host "  Chat ID Instacable"
    $tWes  = Read-Host "  Chat ID WES"
    $tAler = Read-Host "  Chat ID Alertas"

    $envLines = @(
        "# ===================================================================",
        "#  CaboNet Dashboard - Credenciais",
        "#  Gerado em: $(Get-Date -Format 'dd/MM/yyyy HH:mm')",
        "#  IMPORTANTE: Nao compartilhe este arquivo.",
        "# ===================================================================",
        "",
        "# Grafana Gerencial (OS)",
        "GRAFANA_URL=$gUrl",
        "GRAFANA_USER=$gUser",
        "GRAFANA_PASS=$gPass",
        "GRAFANA_DS_UID=$gDs",
        "",
        "# Grafana Monitoramento (Juniper/PPPoE)",
        "MONITOR_URL=$mUrl",
        "MONITOR_USER=$mUser",
        "MONITOR_PASS=$mPass",
        "MONITOR_DS_UID=$mDs",
        "",
        "# iManager BI (Detalhes de OS)",
        "IMANAGER_URL=$iUrl",
        "IMANAGER_USER=$iUser",
        "IMANAGER_PASS=$iPass",
        "",
        "# Login do Dashboard",
        "LOGIN_USER=$lUser",
        "LOGIN_PASS=$lPass"
    )
    if ($tBot) {
        $envLines += @("", "# Telegram", "TELEGRAM_BOT_TOKEN=$tBot")
        if ($tChat) { $envLines += "TELEGRAM_CHAT_ID=$tChat" }
        if ($tInst) { $envLines += "TELEGRAM_CHAT_INSTACABLE=$tInst" }
        if ($tWes)  { $envLines += "TELEGRAM_CHAT_WES=$tWes" }
        if ($tAler) { $envLines += "TELEGRAM_CHAT_ALERTAS=$tAler" }
    }
    [System.IO.File]::WriteAllLines($envFile, $envLines, [System.Text.UTF8Encoding]::new($false))
    Write-Host "        [OK] .env criado" -ForegroundColor Green
}

$backupDir = Join-Path $SCRIPT_DIR "Backup"
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
    Write-Host "        [OK] Pasta Backup/ criada" -ForegroundColor Green
}

# ==============================================================================
#  7/7 - SCRIPTS + FIREWALL + ATALHOS
# ==============================================================================
Write-Host ""
Write-Host "  [7/7] Criando scripts e atalhos..." -ForegroundColor Cyan

# -- iniciar-cabonnet.bat
# Producao: node servidor.js ja cuida de tudo (Python + React)
$batProd = @'
@echo off
title Cabonnet React - Producao
color 0A
cd /d "%~dp0"

echo.
echo  +======================================+
echo  |        CABONNET ISP DASHBOARD        |
echo  +======================================+
echo.

if not exist "dist\index.html" (
    echo  [!] Build nao encontrado. Executando build...
    call npm run build
    if errorlevel 1 (
        echo  [ERRO] Falha no build. Execute instalar.bat novamente.
        pause & exit /b 1
    )
)

echo  Acesse: http://localhost:3000
echo  Para encerrar: Ctrl+C ou feche esta janela
echo.
start "" /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"
node servidor.js
'@
[System.IO.File]::WriteAllText((Join-Path $SCRIPT_DIR "iniciar-cabonnet.bat"), $batProd.Replace("`n","`r`n"), [System.Text.UTF8Encoding]::new($false))
Write-Host "        [OK] iniciar-cabonnet.bat" -ForegroundColor Green

# -- iniciar-cabonnet-dev.bat
# Dev: Python via VBS (background) + Vite dev server (hot-reload)
$batDev = @'
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

echo  [*] Iniciando servidor Python em background (porta 5000)...
cscript //nologo "%~dp0iniciar_bg.vbs"
timeout /t 2 /nobreak >nul

echo  [*] Iniciando Vite dev server (porta 3000)...
echo  [*] Hot-reload ativo - salve arquivos para ver mudancas ao vivo.
echo.
start "" /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"
call npm run dev
'@
[System.IO.File]::WriteAllText((Join-Path $SCRIPT_DIR "iniciar-cabonnet-dev.bat"), $batDev.Replace("`n","`r`n"), [System.Text.UTF8Encoding]::new($false))
Write-Host "        [OK] iniciar-cabonnet-dev.bat" -ForegroundColor Green

# -- iniciar_bg.vbs (inicia Python em background - usado pelo modo dev)
$vbsBg = @'
Dim oShell
Set oShell = CreateObject("WScript.Shell")
oShell.CurrentDirectory = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
oShell.Run "python cabonnet_server.py", 0, False
Set oShell = Nothing
'@
if (-not (Test-Path (Join-Path $SCRIPT_DIR "iniciar_bg.vbs"))) {
    [System.IO.File]::WriteAllText((Join-Path $SCRIPT_DIR "iniciar_bg.vbs"), $vbsBg.Replace("`n","`r`n"), [System.Text.UTF8Encoding]::new($false))
    Write-Host "        [OK] iniciar_bg.vbs" -ForegroundColor Green
}

# -- Cabonnet.vbs (duplo clique -> producao com janela de log)
$vbsMain = @'
Set oShell = CreateObject("WScript.Shell")
Set oFSO   = CreateObject("Scripting.FileSystemObject")
Dim sDir
sDir = oFSO.GetParentFolderName(WScript.ScriptFullName)
oShell.Run "cmd /c """ & sDir & "\iniciar-cabonnet.bat""", 1, False
'@
[System.IO.File]::WriteAllText((Join-Path $SCRIPT_DIR "Cabonnet.vbs"), $vbsMain.Replace("`n","`r`n"), [System.Text.UTF8Encoding]::new($false))
Write-Host "        [OK] Cabonnet.vbs" -ForegroundColor Green

# -- parar_servidor.bat
$batStop = @'
@echo off
title Parar Cabonnet
echo Encerrando Cabonnet...

taskkill /F /IM node.exe /FI "COMMANDLINE eq *servidor.js*" /T >nul 2>&1
taskkill /F /IM python.exe /FI "COMMANDLINE eq *cabonnet_server*" /T >nul 2>&1

for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5000 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5001 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

if exist "%~dp0cabonnet_server.lock" del /F /Q "%~dp0cabonnet_server.lock" >nul 2>&1

echo Cabonnet encerrado.
timeout /t 2 /nobreak >nul
'@
[System.IO.File]::WriteAllText((Join-Path $SCRIPT_DIR "parar_servidor.bat"), $batStop.Replace("`n","`r`n"), [System.Text.UTF8Encoding]::new($false))
Write-Host "        [OK] parar_servidor.bat" -ForegroundColor Green

# -- Firewall
if ($isAdmin) {
    try {
        foreach ($port in @(3000, 5000, 5001)) {
            $ruleName = "Cabonnet porta $port"
            Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
            New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Any | Out-Null
        }
        Write-Host "        [OK] Firewall: portas 3000, 5000 e 5001 liberadas" -ForegroundColor Green
    } catch {
        Write-Host "        [!] Firewall: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "        [!] Firewall nao configurado (requer Administrador)" -ForegroundColor Yellow
}

# -- Atalhos
try {
    $desktop  = [Environment]::GetFolderPath("Desktop")
    $WshShell = New-Object -ComObject WScript.Shell

    $lnk = $WshShell.CreateShortcut((Join-Path $desktop "Cabonnet.lnk"))
    $lnk.TargetPath       = Join-Path $SCRIPT_DIR "Cabonnet.vbs"
    $lnk.WorkingDirectory = $SCRIPT_DIR
    $lnk.Description      = "Iniciar Cabonnet ISP Dashboard"
    $lnk.IconLocation     = "C:\Windows\System32\shell32.dll,14"
    $lnk.Save()

    $lnkStop = $WshShell.CreateShortcut((Join-Path $desktop "Parar Cabonnet.lnk"))
    $lnkStop.TargetPath       = Join-Path $SCRIPT_DIR "parar_servidor.bat"
    $lnkStop.WorkingDirectory = $SCRIPT_DIR
    $lnkStop.Description      = "Parar servidores Cabonnet"
    $lnkStop.IconLocation     = "C:\Windows\System32\shell32.dll,131"
    $lnkStop.Save()

    Write-Host "        [OK] Atalhos criados na Area de Trabalho" -ForegroundColor Green
} catch {
    Write-Host "        [!] Atalhos: $_" -ForegroundColor Yellow
}

# ==============================================================================
#  CONCLUIDO
# ==============================================================================
Write-Host ""
Write-Host "  +--------------------------------------------------+" -ForegroundColor Green
Write-Host "  |        INSTALACAO CONCLUIDA COM SUCESSO!         |" -ForegroundColor Green
Write-Host "  +--------------------------------------------------+" -ForegroundColor Green
Write-Host ""
Write-Host "  Como usar:" -ForegroundColor White
Write-Host "    Duplo clique em Cabonnet.vbs (ou atalho na Area de Trabalho)" -ForegroundColor Gray
Write-Host "    O painel abre em http://localhost:3000 automaticamente." -ForegroundColor Gray
Write-Host ""
Write-Host "  Scripts disponiveis:" -ForegroundColor White
Write-Host "    iniciar-cabonnet.bat      - Producao: inicia Python + React com 1 comando" -ForegroundColor Gray
Write-Host "    iniciar-cabonnet-dev.bat  - Desenvolvimento (hot-reload)" -ForegroundColor Gray
Write-Host "    parar_servidor.bat        - Encerrar tudo" -ForegroundColor Gray
Write-Host ""
Write-Host "  Arquivos importantes:" -ForegroundColor White
Write-Host "    .env     - Credenciais (nao compartilhe)" -ForegroundColor Gray
Write-Host "    Backup/  - Snapshots automaticos" -ForegroundColor Gray
Write-Host "    dist/    - Frontend compilado" -ForegroundColor Gray
Write-Host ""
Read-Host "  Pressione Enter para fechar"
