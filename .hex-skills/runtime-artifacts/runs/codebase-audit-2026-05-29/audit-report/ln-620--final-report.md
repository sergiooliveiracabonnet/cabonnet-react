# Codebase Audit — Cabonnet React ISP Dashboard
**Run ID:** codebase-audit-2026-05-29  
**Data:** 2026-05-29  
**Coordinator:** ln-620-codebase-auditor  
**Workers:** ln-621 · ln-622 · ln-623 · ln-624 · ln-625 · ln-626 · ln-627 · ln-628 · ln-629

---

## Executive Summary

O projeto é um dashboard de operações ISP bem estruturado com React 19 + TypeScript + FastAPI. A migração recente do monolito Python para módulos (17 módulos) e a adoção de TypeScript foram grandes acertos. O CI/CD existe e é funcional.

**Pontos fortes:**
- TypeScript com `strict: true`, migração completa de 60+ arquivos
- CI completo (type-check → lint → test → build → pytest)
- Logging Python com `RotatingFileHandler`, lockfile de instância única
- Sessões com `httponly=True, samesite="strict"`, token de 32 bytes seguro
- React Query com cache-first + SSE para invalidação automática
- Modularização Python bem executada (de 6600 linhas para 17 módulos)

**Veredicto geral:** 🟡 **MÉDIO-ALTO** — nenhum problema crítico de segurança em produção imediata, mas há 4 riscos elevados que precisam ser resolvidos antes do crescimento do sistema.

**Totais:** 23 issues · 4 HIGH · 9 MEDIUM · 10 LOW

---

## Plano de Remediação Priorizado

### 🔴 HIGH — Resolver antes do próximo deploy crítico

| # | Issue | Worker | Localização | Esforço |
|---|-------|--------|-------------|---------|
| H1 | CORS `allow_origins=["*"]` + `allow_credentials=True` é inválido em browsers | ln-621 | `cabonnet/app.py:268-269` | 15 min |
| H2 | Cookie de sessão sem flag `Secure` (enviado por HTTP sem criptografia) | ln-621 | `cabonnet/app.py:346, 363` | 10 min |
| H3 | `cabonnet/handler.py` não é importado por ninguém — 900+ linhas de código morto | ln-626 | `cabonnet/handler.py` | 5 min |
| H4 | Sem validação de env vars obrigatórias no startup — falha silenciosa em runtime | ln-629 | `cabonnet/app.py:lifespan` | 30 min |

### 🟠 MEDIUM — Resolver no próximo sprint

| # | Issue | Worker | Localização | Esforço |
|---|-------|--------|-------------|---------|
| M1 | `_role_from_cookie` duplicado em `auth.py` e `app.py` — divergência futura de bug | ln-623 | `app.py:115`, `auth.py:36` | 20 min |
| M2 | `_hash_pass` em `auth.py` nunca é chamado em produção (só importado pelo handler morto) | ln-626 | `cabonnet/auth.py:20` | 5 min |
| M3 | Login sem rate limiting — vulnerável a força bruta | ln-621 | `cabonnet/app.py:POST /api/login` | 1h |
| M4 | `ignoreDeprecations: "6.0"` no tsconfig mascara erros reais do compilador | ln-622 | `tsconfig.json:12` | 30 min |
| M5 | `framer-motion` e `motion` ambos no package.json — mesma lib duplicada (+300KB bundle) | ln-625 | `package.json:26,29` | 10 min |
| M6 | `MIN_YEAR` computado na carga do módulo — aplicação rodando em 01/Jan nega dados do ano anterior | ln-629 | `src/lib/transform.ts:17` | 10 min |
| M7 | Erros de builder no `safe()` só vão para `console.error`, não para `builderErrors` no contexto | ln-627 | `src/contexts/OSDataContext.tsx:28-30` | 30 min |
| M8 | `leaflet.heat` v0.2.0 — abandonado desde 2016, sem suporte a ES modules | ln-625 | `package.json`, `vite.config.js:optimizeDeps` | 2h |
| M9 | `input()` bloqueante em `cabonnet_server.py:90` quebra containers/systemd | ln-629 | `cabonnet_server.py:90` | 5 min |

### 🟡 LOW — Melhorias de qualidade

| # | Issue | Worker | Localização | Esforço |
|---|-------|--------|-------------|---------|
| L1 | `/* eslint-disable @typescript-eslint/no-explicit-any */` no topo de `OSDataContext.tsx` | ln-624 | `OSDataContext.tsx:1` | 1h |
| L2 | `EMPTY_DERIVED` inline em `OSDataContext.tsx` — 9 linhas densas de JSON difíceis de manter | ln-624 | `OSDataContext.tsx:15-24` | 30 min |
| L3 | Sem Correlation ID — logs Python não relacionáveis com requisições do frontend | ln-627 | API layer | 2h |
| L4 | Test files `osFormat.test.js` e `transform.test.js` ainda em JS (checkJs: false = sem type-check) | ln-622 | `src/lib/*.test.js` | 1h |
| L5 | `@capacitor/*` em `dependencies` (não devDeps) — entra no bundle principal desnecessariamente | ln-625 | `package.json:19-21` | 10 min |
| L6 | Cobertura de testes não enforçada no CI | ln-622 | `.github/workflows/CI.yml` | 30 min |
| L7 | `_cache_refresh_lock` mantém lock durante chamada HTTP ao Grafana (30s) | ln-628 | `cabonnet/app.py:_refresh_cache_from_grafana` | 1h |
| L8 | Sessões em memória (`state._sessions`) são perdidas em restart do servidor | ln-629 | `cabonnet/state.py` | 2h |
| L9 | `auditoria_estrategica_dashboard.txt` e `plano_implantacao.txt` deveriam ir para `.gitignore` | ln-626 | `.gitignore` | 5 min |
| L10 | Sem `npm audit` e `pip-audit` no CI | ln-622 | `.github/workflows/CI.yml` | 20 min |

---

## Issues Detalhados

### H1 — CORS Misconfiguration
**Severidade:** HIGH  
**Worker:** ln-621  
**Arquivo:** `cabonnet/app.py:267-270`

```python
# ATUAL — inválido com credentials=True
app.add_middleware(CORSMiddleware,
    allow_origins=["*"],       # ← incompatível com allow_credentials
    allow_credentials=True,
    allow_methods=["*"],
```

A combinação `allow_origins=["*"]` + `allow_credentials=True` é rejeitada por browsers modernos (CORS spec proíbe wildcard com credenciais). Além disso, expõe a API a qualquer origem. Em produção, deve listar apenas as origens legítimas.

**Fix:**
```python
app.add_middleware(CORSMiddleware,
    allow_origins=["https://cabonnet.suaempresa.com.br"],  # origem real
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)
```

**Fonte:** [MDN CORS + credentials](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS#requests_with_credentials) — tier_1

---

### H2 — Cookie sem flag `Secure`
**Severidade:** HIGH  
**Worker:** ln-621  
**Arquivo:** `cabonnet/app.py:346, 363`

```python
# ATUAL
resp.set_cookie("cbn_session", token, path="/", httponly=True, samesite="strict", max_age=SESSION_DURATION)

# CORRETO
resp.set_cookie("cbn_session", token, path="/", httponly=True, samesite="strict",
                secure=True, max_age=SESSION_DURATION)
```

Sem `secure=True`, o cookie é transmitido em conexões HTTP não-criptografadas. Mesmo que o servidor use HTTPS via proxy reverso, um atacante com acesso à rede pode capturar o token de sessão.

**Fonte:** [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) — tier_1

---

### H3 — `cabonnet/handler.py` é código morto (900+ linhas)
**Severidade:** HIGH  
**Worker:** ln-626  
**Arquivo:** `cabonnet/handler.py`

O arquivo é o antigo `BaseHTTPRequestHandler` que foi substituído pela FastAPI em `cabonnet/app.py`. Nenhum módulo do projeto importa `cabonnet.handler` atualmente. O arquivo mantém código duplicado do `app.py`, incluindo lógica de autenticação e rotas, criando risco de confusão e manutenção errônea.

**Fix:** `git rm cabonnet/handler.py`

**Verificação:**
```bash
grep -r "from cabonnet.handler\|import handler" cabonnet/ cabonnet_server.py
# Nenhum resultado → seguro deletar
```

---

### H4 — Sem validação de env vars obrigatórias no startup
**Severidade:** HIGH  
**Worker:** ln-629  
**Arquivo:** `cabonnet/app.py:222` (lifespan), `cabonnet/config.py`

`GRAFANA_URL`, `GRAFANA_USER`, `GRAFANA_PASS`, `GRAFANA_DS_UID` podem ser strings vazias sem nenhum aviso no startup. A primeira falha ocorre apenas quando chega uma requisição `/query`, retornando erro 502 (servido como cached data). Em ambientes novos (Docker, cloud), isso atrasa diagnóstico.

**Fix — adicionar no lifespan antes do cache warmup:**
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    required = {
        "GRAFANA_URL":    CONFIG["grafana_url"],
        "GRAFANA_DS_UID": CONFIG["ds_uid"],
        "GRAFANA_USER":   CONFIG["username"],
        "GRAFANA_PASS":   CONFIG["password"],
    }
    missing = [k for k, v in required.items() if not v]
    if missing:
        log.error("STARTUP FALHOU — variáveis obrigatórias ausentes: %s", missing)
        raise RuntimeError(f"Env vars obrigatórias não configuradas: {missing}")
    # ... resto do lifespan
```

---

### M1 — `_role_from_cookie` duplicado em `auth.py` e `app.py`
**Severidade:** MEDIUM  
**Worker:** ln-623  

Lógica idêntica de extração de role do cookie existe em dois lugares. Se a estrutura do cookie mudar (ex: adicionar campo), ambos precisam ser atualizados. Já houve divergência no suporte ao formato legado (float).

**Fix:** Expor `_role_from_cookie` de `auth.py` e importar em `app.py`. Remover a cópia local em `app.py`.

---

### M3 — Login sem rate limiting
**Severidade:** MEDIUM  
**Worker:** ln-621  
**Arquivo:** `cabonnet/app.py:POST /api/login`

O endpoint de login não tem nenhuma proteção contra força bruta. Um atacante pode tentar senhas ilimitadamente.

**Fix simples — contador in-memory com TTL:**
```python
from collections import defaultdict
import time

_login_attempts: dict[str, list[float]] = defaultdict(list)
MAX_ATTEMPTS = 10
WINDOW_S = 300  # 5 minutos

def _check_rate_limit(ip: str):
    now = time.time()
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < WINDOW_S]
    if len(_login_attempts[ip]) >= MAX_ATTEMPTS:
        raise HTTPException(429, "Muitas tentativas de login. Aguarde 5 minutos.")
    _login_attempts[ip].append(now)
```

---

### M5 — `framer-motion` + `motion` duplicados
**Severidade:** MEDIUM  
**Worker:** ln-625  
**Arquivo:** `package.json:26,29`

`framer-motion` v12 e `motion` são o mesmo pacote (o projeto foi unificado). Ambos listados aumentam o bundle e podem causar conflitos de versão.

**Fix:**
```bash
npm uninstall motion
# Manter apenas framer-motion, ou apenas motion (preferível para v12+)
```

---

### M6 — `MIN_YEAR` computado uma vez no load do módulo
**Severidade:** MEDIUM  
**Worker:** ln-629  
**Arquivo:** `src/lib/transform.ts:17`

```typescript
// ATUAL — computado quando o módulo é carregado pela primeira vez
const MIN_YEAR = new Date().getFullYear() - 1

// FIX — computar no momento da filtragem
export function applyDateFilter(rows: OSRow[], dateFilter: DateFilter | null): OSRow[] {
  const minYear = new Date().getFullYear() - 1  // ← computado na chamada
  const yearFiltered = rows.filter(r => {
```

Um servidor iniciado em Dezembro/2025 que atravessa o ano novo sem restart usará `MIN_YEAR = 2024` em Janeiro/2026, filtrando dados legítimos de 2025.

---

### M7 — Erros de builder não chegam ao `builderErrors`
**Severidade:** MEDIUM  
**Worker:** ln-627  
**Arquivo:** `src/contexts/OSDataContext.tsx:28-30`

```typescript
// ATUAL — silencia erros do builder
function safe<T>(fn: () => T, fallback: T): T {
  try { return fn() } catch (e) { console.error('[OSData] builder error:', e); return fallback }
}
```

`builderErrors` está na interface `OSDataContextValue` mas nunca é populado. Erros de builder ficam invisíveis para o usuário e só aparecem no console do dev. Adicionar toast ou badge no dashboard quando um builder falhar.

---

### M9 — `input()` bloqueante em error handler
**Severidade:** MEDIUM  
**Worker:** ln-629  
**Arquivo:** `cabonnet_server.py:90`

```python
except Exception:
    log.exception("Erro inesperado")
    input("\nPressione Enter para fechar...")  # ← bloqueia para sempre em Docker/systemd
```

Em ambientes não-interativos (Docker, systemd), o processo trava indefinidamente. O supervisor não consegue reiniciar o processo.

**Fix:** Remover o `input()`. O `log.exception()` já registra o erro.

---

### L3 — Sem Correlation ID entre frontend e backend
**Severidade:** LOW  
**Worker:** ln-627  

Requests do frontend não carregam nenhum ID de correlação. Quando um usuário reporta erro, é impossível cruzar o log do browser com o log do Python.

**Fix mínimo:** Adicionar `X-Request-ID` em `src/lib/api.ts` e logar no FastAPI middleware:
```typescript
// api.ts
headers: { 'Content-Type': 'application/json', 'X-Request-ID': crypto.randomUUID(), ...options.headers }
```

---

### L7 — Lock mantido durante chamada HTTP ao Grafana
**Severidade:** LOW  
**Worker:** ln-628  
**Arquivo:** `cabonnet/app.py:_refresh_cache_from_grafana`

O `_cache_refresh_lock` é mantido por toda a duração da chamada HTTP ao Grafana (timeout de 30s). Durante esse período, outras threads de refresh ficam bloqueadas. Considerar padrão "fetch → update" onde o lock protege apenas a escrita no cache, não o fetch.

---

## Sumário por Domínio

| Domínio | Status | Issues | Notas |
|---------|--------|--------|-------|
| 🔒 Segurança (ln-621) | 🟠 MÉDIO | H1, H2, M3 | CORS e cookie corrigíveis em 30 min |
| 🚦 Delivery Gate (ln-622) | 🟢 BOM | M4, L4, L6, L10 | CI existe e funciona; pequenas lacunas |
| 🔁 Duplicação (ln-623) | 🟡 ATENÇÃO | M1 | 1 duplicação crítica de segurança |
| 🔧 Manutenibilidade (ln-624) | 🟡 ATENÇÃO | L1, L2 | `any` e EMPTY_DERIVED inline |
| 📦 Dependências (ln-625) | 🟡 ATENÇÃO | M5, M8, L5 | 2 deps redundantes, 1 abandonada |
| 💀 Código Morto (ln-626) | 🔴 ALTO | H3, M2, L9 | `handler.py` inteiro é código morto |
| 📊 Diagnosability (ln-627) | 🟡 ATENÇÃO | M7, L3 | Erros invisíveis, sem correlation ID |
| ⚡ Concorrência (ln-628) | 🟢 BOM | L7 | Locks corretos; 1 lock muito amplo |
| 🚀 Lifecycle/Config (ln-629) | 🟠 MÉDIO | H4, M6, M9, L8 | Sem validação de startup |

---

## Próximos Passos Recomendados

**Sprint imediato (< 2h total):**
1. `H2` — `secure=True` no cookie (10 min)
2. `H1` — CORS com origens específicas (15 min)
3. `H3` — `git rm cabonnet/handler.py` (5 min)
4. `M9` — remover `input()` do except final (5 min)
5. `M5` — remover `motion` duplicado (10 min)

**Sprint próxima semana:**
6. `H4` — validação de env vars no lifespan (30 min)
7. `M3` — rate limiting no login (1h)
8. `M1` — consolidar `_role_from_cookie` (20 min)
9. `M6` — `MIN_YEAR` dinâmico (10 min)
10. `M7` — `builderErrors` populado pelo `safe()` (30 min)

---

*Relatório gerado por ln-620-codebase-auditor em 2026-05-29*  
*Workers cobertos: ln-621, ln-622, ln-623, ln-624, ln-625, ln-626, ln-627, ln-628, ln-629*
