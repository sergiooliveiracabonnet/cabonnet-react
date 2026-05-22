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

# Tests
npm test                 # vitest run (all tests)
npm run test:watch       # vitest watch mode
npx vitest run src/lib/osFormat.test.js   # single test file
```

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

### Python Server (`cabonnet_server.py`)

Single-file, ~6600 lines. Runs two HTTP servers:
- Port 5000 (`Handler`) — main API (Grafana proxy, OS queries, Telegram notifier, auth)
- Port 5001 (`BackupHandler`) — snapshot/backup browser

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
| INSTACABLE | F01, F04, F05, F07, F20, F27, F45, F48, F49, F50 | `TELEGRAM_CHAT_INSTACABLE` |
| WES | F08, F11, F36, F39, F44 | `TELEGRAM_CHAT_WES` |
| THM | F12–F19 | `TELEGRAM_CHAT_OPERACIONAL_THM` |
| REDE | service starts with "REDE" | `TELEGRAM_CHAT_REDE` |

Each operator group receives only its own OS status changes. The Alertas group receives all changes from all operators plus THM's "Executadas Hoje" scheduled report.

The `_operadora_da_os(row)` function in `cabonnet_server.py` drives all operator filtering. Adding a new operator means updating `_OPERADORA_GRUPOS`, `_operadora_for_chat`, `_label_operadora`, `_tg_broadcast_status_changes`, `_enviar_executadas`, `_grupo_cmds`, and the `_CHAT_MAP` in notify endpoints.

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
