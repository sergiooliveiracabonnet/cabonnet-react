# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Cabonnet React is an ISP operations dashboard for a telecom company serving Vale do Paraíba (SJC, Caçapava, Taubaté, Tremembé, Pindamonhangaba). It shows real-time work orders (OS — Ordens de Serviço), team performance, SLA tracking, Juniper/PPPoE monitoring, and runs a Telegram bot for field operations.

**Always filter data by these five cities only.** OS from other cities must be ignored.

---

## Commands

```bash
# Development (unified server: Vite HMR + Python auto-started)
npm run dev              # node servidor.js --dev  →  port 3000

# Production (serves dist/ + proxies to Python)
npm run build            # vite build
node servidor.js         # prod mode  →  port 3000

# Tests — frontend
npm test                 # vitest run (all tests)
npm run test:watch       # vitest watch mode
npx vitest run src/lib/osFormat.test.js   # single test file

# Tests — backend
python -m pytest tests/python -q          # all Python tests
python -m pytest tests/python/test_db_fornecedor.py -q   # single file

# Checks that must pass before committing
npx tsc --noEmit         # type-check — `npm run build` does NOT do this
npm run lint             # eslint
npm run audit:ds         # design-system audit (runs in CI)
```

**`npm run build` is `vite build` only — it does not type-check.** Run `npx tsc --noEmit` separately; it is what catches `TS6133` (orphan imports/variables) after removing JSX.

**Dev server is always port 3000, strictPort: true.** Never use 3001.

---

## Architecture

### Data Flow

```
Grafana (PostgreSQL datasource)
    ↓  HTTPS POST /api/ds/query (SQL)
cabonnet_server.py  (Python, port 5000)
    ↓  CSV text in JSON response
/query  →  useOSData (React Query)
    ↓  parseCSV → enrichRows → applyDateFilter
OSDataContext  (single provider, all derived data computed here)
    ↓  derived.dashboard / .sla / .graficos / .ordens / etc.
Feature pages  (read from context via useOSDerived())
```

### Two Servers, One Port

`servidor.js` is the unified entry point:
- **Dev mode** (`--dev`): starts Python subprocess, embeds Vite as middleware, serves everything on port 3000. Python stdout/stderr are visible in the terminal.
- **Prod mode**: starts Python subprocess, serves `dist/` statically, proxies API calls to port 5000.

`vite.config.js` proxy rules are only active when running `vite dev` standalone (not used in the unified server). In the unified server, `servidor.js` owns all routing via `API_PREFIXES`.

**API_PREFIXES** (all proxied to Python on port 5000):
`/api`, `/query`, `/revisitas`, `/atendimento`, `/juniper`, `/notify`, `/detalhes`, `/health`, `/ai`, `/grafana`

Grafana routes starting with `/grafana/` are handled directly in Node by `servidor.js` (no round-trip to Python for `/grafana/os-totais`, `/grafana/os-cidades`, `/grafana/incidentes`, `/grafana/zabbix/*`).

### Python Server (`cabonnet_server.py` + `cabonnet/`)

`cabonnet_server.py` is an **89-line entry point only** — it starts the two HTTP servers and the background threads. All business logic lives in the `cabonnet/` package (~22 modules). Do not go looking for handlers or queries in the entry point.

- Port 5000 — main API (Grafana proxy, OS queries, Telegram notifier, auth)
- Port 5001 — snapshot/backup browser

Where things actually are:

| Module | Responsibility |
|---|---|
| `cabonnet/app.py` | FastAPI routes. Authorization via `Depends(_require_modulo("<key>"))`, `_require_gestor`, `_require_session` |
| `cabonnet/db.py` | SQLite (`_DB_PATH`). Tables created with `CREATE TABLE IF NOT EXISTS` in `_db_init()`. Permission modules listed in `ALL_MODULOS` |
| `cabonnet/grafana.py` | Grafana datasource queries |
| `cabonnet/bot.py`, `telegram.py` | Telegram bot and notifier |
| `cabonnet/builders.py` | Message/payload builders shared by bot and API |
| `cabonnet/auth.py`, `config.py`, `state.py`, `cache.py` | Session, config, shared in-memory state |
| `cabonnet/juniper.py`, `monitors.py`, `zabbix.py` | Polling and monitoring |
| `cabonnet/backup_app.py` | Port 5001 app |

Python tests are in `tests/python/` (pytest, `pytest.ini` at the root). Run with `python -m pytest tests/python -q`. The `client` fixture in `conftest.py` mocks Grafana and disables auth; DB tests use a `tmp_db` fixture that patches `cabonnet.db._DB_PATH`.

Key mechanisms:
- **Lockfile** (`cabonnet_server.lock`): prevents duplicate instances. Safe to delete if the process was force-killed.
- **`_query_cache`**: populated at startup warmup and after every successful `/query`. If Grafana times out, `/query` serves cached data with `"cached": true` instead of returning 502.
- **`_dados_cache`**: in-memory agendado rows for Telegram status messages and scheduler.
- **Grafana timeout**: 30 seconds (`CONFIG["timeout_s"]`). The server at `cabonnet-monitoramento.interfocus.com.br:3000` is queried via HTTPS directly from Python (not proxied through Node).
- All logs go to `cabonnet_server.log` in the project root and to stdout (visible in terminal when running via `servidor.js --dev`).

### React Data Layer

**`OSDataContext`** (`src/contexts/OSDataContext.jsx`) is the single source of truth. It:
1. Calls `useOSData()` → fetches `/query`, parses CSV, enriches rows
2. Calls `useRevisitasData()` → fetches `/revisitas` (concluded OS for revisit rate)
3. Applies `hideRede` filter (removes REDE-category OS)
4. Runs all builder functions (`buildDashboard`, `buildSla`, etc.) via `useMemo`
5. Exposes `{ rows, allRows, derived, isLoading, error }` via `useOSDerived()`

**Never call `useOSData()` directly from a feature.** Always use `useOSDerived()`.

`parseCSV → enrichRows` in `src/lib/transform.js` does heavy data cleaning: rejects invalid `numos` (must be exactly 7 digits), sanitizes client names, excludes administrative service types, and computes derived fields (`_aging`, `_tipo`, `_fornecedor`, `_situacaoEfetiva`).

### Zustand Stores

| Store | Purpose |
|---|---|
| `uiStore` | Date filter (preset + custom range), sidebar, theme, `hideRede` toggle |
| `authStore` | Session state: `checking → authed / unauthed` |
| `erpStore` | Kanban column overrides, ERP view mode, shared ERP filters (persisted) |
| `alertStore` | Configurable alert rules (thresholds for SLA, queue size, etc.) |
| `telegramStore` | Telegram bot status cache |

`uiStore.dateFilter` defaults to `mensal` (current month). The `campo` field switches between `datacadastro` / `dataagendamento` / `dataexecucao`.

### Operator Groups (Telegram)

The bot isolates notifications by operator using team codes matched against `nomedaequipe`:

| Operator | Frentes | Telegram var |
|---|---|---|
| INSTACABLE | F01, F04, F05, F07, F20, F45, F46, F47, F48, F49, F50 | `TELEGRAM_CHAT_INSTACABLE` |
| WES | F08, F11, F23, F36, F44 | `TELEGRAM_CHAT_WES` |
| THM | F12, F13, F14 | `TELEGRAM_CHAT_OPERACIONAL_THM` |
| REDE | service starts with "REDE" | `TELEGRAM_CHAT_REDE` |

19 frentes at present. `cabonnet/config.py` is the source of truth — every other list is a copy.

**The mapping is duplicated in four places and has drifted before.** `cabonnet/config.py` (backend), `cabonnet/stats.py`, the AI prompt in `cabonnet/ai.py`, and `INST_EQS`/`WES_EQS`/`THM_EQS` in `src/features/fechamento/fechamentoUtils.ts` (frontend). The frontend copy sat on the pre-`9f0c7ca` mapping and the Fechamento tabs silently excluded F46, F47 and F23 from their operator's closing. Two tests pin it now: `tests/python/test_operator_team_consistency.py` for the three Python sources and `src/features/fechamento/fechamentoUtils.test.ts`, which reads `config.py` rather than repeating the list. Adding or retiring a frente means touching all four.

**F27 and F39 are retired** (confirmed 2026-08-03) — removed from `EQUIPE_NAMES`, `TEAMS` (`src/features/erp/erpConstants.ts`) and the Fechamento lists. Don't reintroduce them.

Each operator group receives only its own OS status changes. The Alertas group receives all changes from all operators plus THM's "Executadas Hoje" scheduled report.

`_operadora_da_os(row)` in `cabonnet/telegram.py` drives all operator filtering; the group map `_OPERADORA_GRUPOS` lives in `cabonnet/config.py`. Adding a new operator means updating `_OPERADORA_GRUPOS`, `_operadora_for_chat`, `_label_operadora`, `_tg_broadcast_status_changes`, `_enviar_executadas`, `_grupo_cmds`, and the `_CHAT_MAP` in notify endpoints.

### Feature Pages

All pages are lazy-loaded via `src/pages/index.jsx`. Route structure:

```
/                   → DashboardPage
/ordens             → OrdensPage (OS list, filters, pagination)
/erp/ordens         → ERPOrdensPage (Kanban + agenda + fila inteligente)
/erp/equipes        → team management
/erp/dispatch       → dispatch management
/erp/alertas        → alert rules engine
/erp/rede           → REDE OS view
/graficos           → charts
/cidades            → city breakdown
/campo              → field ops (MTTR, ritmo, projeção)
/fornecedor         → supplier SLA
/juniper            → PPPoE/Juniper monitoring
/fechamento         → invoice closing (PDF export)
/mapa               → geographic heat map (Leaflet)
/noc                → NOC mode (no auth required, full-screen)
```

`/noc` is the only route outside `AppLayout` — it bypasses the auth check in `App.jsx`.

### Auth

Session cookie-based. `App.jsx` calls `/api/session` on mount. On 401, `api.js` fires `auth:unauthorized` custom event. Python's `_auth_enabled()` returns false if `LOGIN_PASS` is empty (open access for local use).

---

## Environment (`.env`)

Key variables Python reads directly; Node reads `GRAFANA_URL`, `GRAFANA_USER`, `GRAFANA_PASS`, `GRAFANA_DS_UID`, `MONITOR_*`, `ZABBIX_DS_UID` for its own Grafana/Zabbix proxy handlers in `servidor.js`.

`VITE_API_URL` in `.env` sets the API base in `src/lib/api.js` — leave empty for same-origin requests (default in both dev and prod).
