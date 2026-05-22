# -*- coding: utf-8 -*-
"""
cabonnet/app.py — FastAPI application (porta 5000).

Substitui BaseHTTPRequestHandler. Toda lógica de negócio permanece
nos módulos existentes (grafana, cache, builders, telegram, etc.).
"""

import asyncio
import base64 as _base64
import json
import logging
import os
import queue as _queue
import threading
import time as _time_mod
from contextlib import asynccontextmanager
from datetime import datetime, date
from pathlib import Path

import requests as _requests
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import (
    FileResponse,
    JSONResponse,
    RedirectResponse,
    Response as RawResponse,
    StreamingResponse,
)

from cabonnet import state
from cabonnet.ai import _ai_narrative, _ai_revisitas
from cabonnet.auth import _auth_enabled, _create_session
from cabonnet.builders import _build_status_text
from cabonnet.cache import _dados_cache_update
from cabonnet.config import (
    _ATE_CACHE_TTL,
    _load_env,
    _resolve_role,
    _SCRIPT_DIR_ENV,
    _SLA_LIMITS,
    CONFIG,
    JUN_HIST_FILE,
    LOGIN_PASS,
    MONITOR_CONFIG,
    PORT,
    SESSION_DURATION,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ALERTAS,
    TELEGRAM_CHAT_ID,
    TELEGRAM_CHAT_INSTACABLE,
    TELEGRAM_CHAT_OPERACIONAL_THM,
    TELEGRAM_CHAT_REDE,
    TELEGRAM_CHAT_WES,
)
from cabonnet.db import _db_init, _db_load_cache, _db_save_cache
from cabonnet.grafana import (
    SQL_AGENDADO,
    SQL_ATENDIMENTO,
    SQL_DETALHES_TEMPLATE,
    SQL_EQUIPE_REAGENDOU_TEMPLATE,
    SQL_ERP_OS_CIDADES,
    SQL_ERP_OS_TOTAIS,
    SQL_FUTURO,
    SQL_MATERIAIS_RETIRADOS_TEMPLATE,
    SQL_MATERIAIS_UTILIZADOS_TEMPLATE,
    SQL_OCORRENCIAS_TEMPLATE,
    SQL_PENDENTE,
    SQL_REVISITAS,
    build_atendimento_json,
    frames_to_csv,
    frames_to_dict_list,
    grafana_post,
)
from cabonnet.juniper import _jun_notify_new_clients, juniper_fetch
from cabonnet.telegram import _telegram_enabled, _telegram_send, _telegram_send_document
from cabonnet.utils import parse_date_param
from cabonnet.zabbix import (
    _map_problems,
    zabbix_discover,
    zabbix_get_assinantes,
    zabbix_get_cidades,
    zabbix_get_infra,
    zabbix_get_mttr,
    zabbix_get_olt,
    zabbix_get_pppoe_vlans,
    zabbix_get_problems,
    zabbix_get_top_equipamentos,
)

log = logging.getLogger("CaboNetServer")

_ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

# ── Paths ─────────────────────────────────────────────────────────────────────

_ROOT        = Path(_SCRIPT_DIR_ENV).parent
_HTML_DIR    = _ROOT / "html"
_DIST_DIR    = _ROOT / "dist"

# ── Telegram chat map ─────────────────────────────────────────────────────────

_CHAT_MAP = {
    "alertas":       TELEGRAM_CHAT_ALERTAS,
    "produtividade": TELEGRAM_CHAT_ID,
    "instacable":    TELEGRAM_CHAT_INSTACABLE,
    "wes":           TELEGRAM_CHAT_WES,
    "rede":          TELEGRAM_CHAT_REDE,
    "thm":           TELEGRAM_CHAT_OPERACIONAL_THM,
}

# ── Auth helpers ──────────────────────────────────────────────────────────────

def _role_from_cookie(cookie_str: str | None) -> str | None:
    """Extrai role da string do cookie 'cbn_session=...'."""
    if not cookie_str:
        return None
    for part in cookie_str.split(";"):
        part = part.strip()
        if part.startswith("cbn_session="):
            token = part[len("cbn_session="):]
            with state._sessions_lock:
                sess = state._sessions.get(token)
            if not sess:
                return None
            if isinstance(sess, dict):
                if _time_mod.time() > sess.get("exp", 0):
                    with state._sessions_lock:
                        state._sessions.pop(token, None)
                    return None
                return sess.get("role", "gestor")
            else:
                if _time_mod.time() > sess:
                    with state._sessions_lock:
                        state._sessions.pop(token, None)
                    return None
                return "gestor"
    return None


def _token_from_cookie(cookie_str: str | None) -> str | None:
    if not cookie_str:
        return None
    for part in cookie_str.split(";"):
        part = part.strip()
        if part.startswith("cbn_session="):
            return part[len("cbn_session="):]
    return None


def _get_optional_role(request: Request) -> str | None:
    if not _auth_enabled():
        return "gestor"
    return _role_from_cookie(request.headers.get("cookie", ""))


def _require_auth(role: str | None = Depends(_get_optional_role)) -> str:
    if role is None:
        raise HTTPException(401, "Não autenticado")
    return role


def _require_gestor(role: str | None = Depends(_get_optional_role)) -> str:
    if role != "gestor":
        raise HTTPException(403, "Permissão negada — requer role gestor")
    return role


def _check_telegram():
    if not _telegram_enabled():
        raise HTTPException(503, "Telegram não configurado")


# ── Cache warmup (executado no lifespan) ──────────────────────────────────────

_cache_refresh_lock = threading.Lock()   # impede refreshes simultâneos

def _refresh_cache_from_grafana(origem: str = "manual") -> bool:
    """Busca os 3 CSVs do Grafana e atualiza _query_cache. Retorna True se OK."""
    if not _cache_refresh_lock.acquire(blocking=False):
        log.debug("[Cache] Refresh já em andamento — ignorando (%s)", origem)
        return False
    try:
        csv_p = frames_to_csv(grafana_post(SQL_PENDENTE))
        csv_a = frames_to_csv(grafana_post(SQL_AGENDADO))
        csv_f = frames_to_csv(grafana_post(SQL_FUTURO))
        ts_now = _time_mod.time()
        with state._query_cache_lock:
            state._query_cache.update({"pendente": csv_p or "", "agendado": csv_a or "",
                                       "futuro": csv_f or "", "ts": ts_now})
        for chave, csv_val in [("pendente", csv_p), ("agendado", csv_a), ("futuro", csv_f)]:
            if csv_val:
                threading.Thread(target=_db_save_cache, args=(chave, csv_val, ts_now), daemon=True).start()
        threading.Thread(target=_dados_cache_update, args=(csv_p or "", csv_a or "", csv_f or ""), daemon=True).start()
        import csv as _csv, io as _io
        def _n(t): return sum(1 for _ in _csv.reader(_io.StringIO(t or ""))) - 1
        log.info("[Cache] Refresh OK (%s) — P=%d A=%d F=%d", origem, _n(csv_p), _n(csv_a), _n(csv_f))
        return True
    except Exception as ex:
        log.warning("[Cache] Refresh falhou (%s): %s", origem, str(ex)[:120])
        return False
    finally:
        _cache_refresh_lock.release()


def _cache_warmup():
    _refresh_cache_from_grafana("warmup")


def _auto_refresh_loop():
    """Mantém _query_cache sempre fresco — atualiza silenciosamente a cada 3 min."""
    _time_mod.sleep(90)   # aguarda warmup terminar
    while True:
        _time_mod.sleep(180)  # 3 minutos
        _refresh_cache_from_grafana("auto-refresh")


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    from cabonnet.bot import _telegram_poll_loop
    from cabonnet.juniper import _jun_poll_loop
    from cabonnet.monitors import (
        _atendimento_travado_loop,
        _fila_monitor_loop,
        _manut_monitor_loop,
        _resumo_scheduler_loop,
        _sem_exec_monitor_loop,
        _sla_monitor_loop,
    )

    _db_init()

    threading.Thread(target=_cache_warmup,      name="CacheWarmup",    daemon=True).start()
    threading.Thread(target=_auto_refresh_loop, name="CacheAutoRefresh",daemon=True).start()
    threading.Thread(target=_jun_poll_loop,     name="JuniperPoll",    daemon=True).start()

    if _telegram_enabled():
        threading.Thread(target=_telegram_poll_loop,       name="TelegramPoll",      daemon=True).start()
        threading.Thread(target=_resumo_scheduler_loop,    name="TelegramScheduler", daemon=True).start()
        threading.Thread(target=_sla_monitor_loop,         name="SLAMonitor",        daemon=True).start()
        threading.Thread(target=_fila_monitor_loop,        name="FilaMonitor",       daemon=True).start()
        threading.Thread(target=_manut_monitor_loop,       name="ManutMonitor",      daemon=True).start()
        threading.Thread(target=_atendimento_travado_loop, name="AtendTravado",      daemon=True).start()
        threading.Thread(target=_sem_exec_monitor_loop,    name="SemExecMonitor",    daemon=True).start()
        log.info("  Telegram      : bot configurado — polling e scheduler ativos")
    else:
        log.info("  Telegram      : não configurado (defina TELEGRAM_BOT_TOKEN no .env)")

    yield


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="CaboNet ISP",
    description="Dashboard operacional — OS, SLA, Telegram, Juniper/PPPoE",
    version="2026.8.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API Router (v1) ───────────────────────────────────────────────────────────
# Business-logic routes are defined on this router and mounted at /api/v1.
# Legacy unversioned paths (e.g. /query, /health) are kept via a second include
# hidden from OpenAPI so existing clients keep working without changes.

router = APIRouter(tags=["v1"])

# ── Helpers ───────────────────────────────────────────────────────────────────

def _csv_response(sql: str, label: str) -> RawResponse:
    log.info("  -> %s...", label)
    csv_txt = frames_to_csv(grafana_post(sql))
    if not csv_txt:
        raise HTTPException(502, f"{label}: sem dados do Grafana.")
    log.info("  OK %s: %d registros", label, len(csv_txt.splitlines()) - 1)
    return RawResponse(content=csv_txt.encode("utf-8-sig"), media_type="text/csv; charset=utf-8")


# ── Páginas HTML (legacy) ─────────────────────────────────────────────────────

@app.get("/")
async def root(request: Request):
    if not CONFIG.get("username") or not CONFIG.get("password"):
        return FileResponse(str(_HTML_DIR / "setup.html"))
    if _auth_enabled() and _get_optional_role(request) is None:
        return RedirectResponse("/login")
    return RedirectResponse("/dashboard")


@app.get("/login")
async def login_page():
    return FileResponse(str(_HTML_DIR / "login.html"))


@app.get("/logout")
async def logout_redirect(request: Request):
    token = _token_from_cookie(request.headers.get("cookie", ""))
    if token:
        with state._sessions_lock:
            state._sessions.pop(token, None)
    resp = RedirectResponse("/login", status_code=302)
    resp.delete_cookie("cbn_session", path="/")
    log.info("[Auth] Logout")
    return resp


@app.get("/setup")
async def setup_page():
    return FileResponse(str(_HTML_DIR / "setup.html"))


@app.get("/dashboard")
async def dashboard(request: Request):
    if _auth_enabled() and _get_optional_role(request) is None:
        return RedirectResponse("/login")
    index = _DIST_DIR / "index.html"
    return FileResponse(str(index)) if index.exists() else JSONResponse({"error": "dist/ não encontrado — rode npm run build"}, status_code=503)


# ── Auth ──────────────────────────────────────────────────────────────────────

@app.post("/login")
async def login_form(request: Request):
    """Login via form HTML (legado)."""
    body = await request.form()
    user = (body.get("username") or "").strip()
    pwd  = body.get("password") or ""
    role = _resolve_role(user, pwd)
    if role:
        token = _create_session(role)
        log.info("[Auth] Login OK — usuario: %s role: %s", user, role)
        resp = RedirectResponse("/dashboard", status_code=302)
        resp.set_cookie("cbn_session", token, path="/", httponly=True, samesite="strict", max_age=SESSION_DURATION)
        return resp
    log.warning("[Auth] Login FALHOU — usuario: %s", user)
    return RedirectResponse("/login?error=1", status_code=302)


@app.post("/api/login")
async def api_login(request: Request):
    """Login JSON (React)."""
    body = await request.json()
    user = (body.get("username") or "").strip()
    pwd  = body.get("password") or ""
    role = _resolve_role(user, pwd) if _auth_enabled() else "gestor"
    if role:
        token = _create_session(role)
        log.info("[Auth] Login React OK — usuario: %s role: %s", user, role)
        resp = JSONResponse({"ok": True, "role": role})
        resp.set_cookie("cbn_session", token, path="/", httponly=True, samesite="strict", max_age=SESSION_DURATION)
        return resp
    log.warning("[Auth] Login React FALHOU — usuario: %s", user)
    return JSONResponse({"ok": False, "error": "Credenciais inválidas"}, status_code=401)


@app.get("/api/session")
async def api_session(request: Request):
    role = _get_optional_role(request)
    ok   = not _auth_enabled() or role is not None
    return {"ok": ok, "auth_enabled": _auth_enabled(), "role": role or "viewer"}


@app.get("/api/logout")
async def api_logout(request: Request):
    token = _token_from_cookie(request.headers.get("cookie", ""))
    if token:
        with state._sessions_lock:
            state._sessions.pop(token, None)
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("cbn_session", path="/")
    log.info("[Auth] Logout React")
    return resp


@app.get("/api/sla-limits")
async def api_sla_limits():
    return {"ok": True, "limits": _SLA_LIMITS}


# ── Setup ─────────────────────────────────────────────────────────────────────

@app.post("/setup")
async def setup_post(request: Request, _role: str = Depends(_require_gestor)):
    body = await request.json()
    for key in ("GRAFANA_USER", "GRAFANA_PASS"):
        if not body.get(key, "").strip():
            return JSONResponse({"ok": False, "error": f"Campo obrigatorio: {key}"}, status_code=400)
    lines = [
        "# CaboNet Dashboard - Credenciais",
        "# Configurado via landing page em " + datetime.now().strftime("%d/%m/%Y %H:%M"), "",
        "# Grafana Gerencial (OS)",
        "GRAFANA_URL="    + body.get("GRAFANA_URL", "").strip(),
        "GRAFANA_USER="   + body.get("GRAFANA_USER", "").strip(),
        "GRAFANA_PASS="   + body.get("GRAFANA_PASS", ""),
        "GRAFANA_DS_UID=" + body.get("GRAFANA_DS_UID", "").strip(), "",
        "# Grafana Monitoramento (Juniper/PPPoE)",
        "MONITOR_URL="    + body.get("MONITOR_URL", "").strip(),
        "MONITOR_USER="   + body.get("MONITOR_USER", "").strip(),
        "MONITOR_PASS="   + body.get("MONITOR_PASS", ""),
        "MONITOR_DS_UID=" + body.get("MONITOR_DS_UID", "").strip(),
    ]
    env_path = os.path.join(_SCRIPT_DIR_ENV, "..", ".env")
    with open(env_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    _load_env(env_path, overwrite=True)
    CONFIG["grafana_url"] = os.environ.get("GRAFANA_URL", CONFIG["grafana_url"])
    CONFIG["username"]    = os.environ.get("GRAFANA_USER", "")
    CONFIG["password"]    = os.environ.get("GRAFANA_PASS", "")
    CONFIG["ds_uid"]      = os.environ.get("GRAFANA_DS_UID", "")
    log.info("[Setup] Credenciais salvas — usuario: %s", CONFIG["username"])
    return {"ok": True}


# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/health")
async def health():
    return {"status": "ok", "date": date.today().isoformat(), "version": "2026.8.0", "porta": PORT}


# ── Stats (KPIs server-side) ──────────────────────────────────────────────────

@router.get("/stats")
def get_stats():
    """KPIs da fila operacional computados server-side a partir do cache de OS.
    Retorna JSON compacto sem enviar CSV completo ao cliente."""
    from cabonnet.stats import compute_stats
    with state._query_cache_lock:
        cached = dict(state._query_cache)
    ts = cached.get("ts", 0)
    result = compute_stats(
        cached.get("pendente", ""),
        cached.get("agendado",  ""),
        cached.get("futuro",    ""),
    )
    return JSONResponse({"ts": ts, "cached": bool(ts), **result})


# ── CSV exports ───────────────────────────────────────────────────────────────

@router.get("/pendente")
async def pendente():
    return _csv_response(SQL_PENDENTE, "PENDENTE")

@router.get("/agendado")
async def agendado():
    return _csv_response(SQL_AGENDADO, "AGENDADO")

@router.get("/futuro")
async def futuro():
    return _csv_response(SQL_FUTURO, "FUTURO")


# ── Query principal ───────────────────────────────────────────────────────────

_CACHE_FRESH_SEC  = 240   # < 4 min → retorna cache imediatamente
_CACHE_STALE_SEC  = 120   # > 2 min → agenda refresh em background mesmo devolvendo cache

@router.get("/query")
async def query(request: Request, date: str = "hoje", _role: str = Depends(_require_auth)):
    try:
        data_iso = parse_date_param(date)
    except ValueError as ex:
        raise HTTPException(400, str(ex))

    # ── Cache-first: responde instantaneamente se dados recentes ─────────────
    with state._query_cache_lock:
        cached = dict(state._query_cache)

    cache_age = _time_mod.time() - cached.get("ts", 0)

    if cached.get("ts", 0) > 0 and cache_age < _CACHE_FRESH_SEC:
        if cache_age > _CACHE_STALE_SEC:
            # Cache ainda válido mas envelhecendo — atualiza em background
            threading.Thread(target=_refresh_cache_from_grafana, args=("bg-stale",), daemon=True).start()
        def _n(t): return len(t.splitlines()) - 1 if t else 0
        log.debug("[/query] Cache-hit — %ds atrás", int(cache_age))
        return {"pendente": cached["pendente"], "agendado": cached["agendado"], "futuro": cached["futuro"],
                "n_pendente": _n(cached["pendente"]), "n_agendado": _n(cached["agendado"]),
                "n_futuro":   _n(cached["futuro"]),   "date": data_iso,
                "cached": True, "cache_age_sec": int(cache_age)}

    # ── Cache vazio ou muito velho → busca do Grafana de forma síncrona ──────
    try:
        log.info("[/query] Cache frio — buscando do Grafana...")
        ok = _refresh_cache_from_grafana("/query-sync")
        if ok:
            with state._query_cache_lock:
                cached = dict(state._query_cache)
            def _n(t): return len(t.splitlines()) - 1 if t else 0
            return {"pendente": cached["pendente"], "agendado": cached["agendado"], "futuro": cached["futuro"],
                    "n_pendente": _n(cached["pendente"]), "n_agendado": _n(cached["agendado"]),
                    "n_futuro":   _n(cached["futuro"]),   "date": data_iso}

    except Exception as ex:
        # Fallback 1: cache em memória
        with state._query_cache_lock:
            cached_ts = state._query_cache["ts"]
            if cached_ts > 0:
                cache_age = int((_time_mod.time() - cached_ts) / 60)
                log.warning("[/query] Grafana indisponível — cache de %d min atrás", cache_age)
                return {
                    "pendente": state._query_cache["pendente"],
                    "agendado": state._query_cache["agendado"],
                    "futuro":   state._query_cache["futuro"],
                    "n_pendente": len(state._query_cache["pendente"].splitlines()) - 1 if state._query_cache["pendente"] else 0,
                    "n_agendado": len(state._query_cache["agendado"].splitlines()) - 1 if state._query_cache["agendado"] else 0,
                    "n_futuro":   len(state._query_cache["futuro"].splitlines()) - 1   if state._query_cache["futuro"]   else 0,
                    "date": data_iso, "cached": True, "cache_age_min": cache_age,
                }
        # Fallback 2: SQLite
        csv_a_db, ts_db = _db_load_cache("agendado")
        if csv_a_db:
            csv_p_db, _ = _db_load_cache("pendente")
            csv_f_db, _ = _db_load_cache("futuro")
            cache_age   = int((_time_mod.time() - ts_db) / 60) if ts_db else -1
            log.warning("[/query] Servindo cache SQLite de %d min atrás", cache_age)
            return {"pendente": csv_p_db, "agendado": csv_a_db, "futuro": csv_f_db or "",
                    "n_pendente": len(csv_p_db.splitlines()) - 1 if csv_p_db else 0,
                    "n_agendado": len(csv_a_db.splitlines()) - 1,
                    "n_futuro":   len(csv_f_db.splitlines()) - 1 if csv_f_db else 0,
                    "date": data_iso, "cached": True, "cached_source": "sqlite", "cache_age_min": cache_age}
        log.exception("Erro /query")
        raise HTTPException(502, str(ex))


@router.get("/revisitas")
async def revisitas(_role: str = Depends(_require_auth)):
    try:
        csv_r = frames_to_csv(grafana_post(SQL_REVISITAS))
        return {"concluidas": csv_r or "", "n": len(csv_r.splitlines()) - 1 if csv_r else 0}
    except Exception as ex:
        log.exception("Erro /revisitas")
        raise HTTPException(502, str(ex))


@router.get("/atendimento")
async def atendimento():
    try:
        now = _time_mod.time()
        with state._ate_cache_lock:
            cache_stale = state._ate_cache["data"] is None or (now - state._ate_cache["ts"]) > _ATE_CACHE_TTL
        if cache_stale:
            raw    = frames_to_dict_list(grafana_post(SQL_ATENDIMENTO))
            result = build_atendimento_json(raw)
            if not result:
                raise HTTPException(502, "Sem dados de atendimento")
            with state._ate_cache_lock:
                state._ate_cache["data"] = result
                state._ate_cache["ts"]   = now
        with state._ate_cache_lock:
            return state._ate_cache["data"]
    except HTTPException:
        raise
    except Exception as ex:
        log.exception("Erro /atendimento")
        raise HTTPException(502, str(ex))


@router.get("/detalhes")
async def detalhes(numos: str = ""):
    if not numos.strip().isdigit():
        raise HTTPException(400, "Parâmetro 'numos' inválido.")
    numos_int = int(numos.strip())
    try:
        rows = frames_to_dict_list(grafana_post(SQL_DETALHES_TEMPLATE.format(numos=numos_int)))
        if not rows:
            raise HTTPException(404, f"OS {numos} não encontrada.")
        os_data = rows[0]
        dt_atend = os_data.get("dataatendimento", "")
        dt_agend = os_data.get("dataagendamento", "")
        reagendada = bool(dt_atend and dt_agend and dt_atend[:10] != dt_agend[:10])
        ocorrencias = []
        try: ocorrencias = frames_to_dict_list(grafana_post(SQL_OCORRENCIAS_TEMPLATE.format(numos=numos_int)))
        except Exception: pass
        equipe_reagendou = ""
        try:
            rows_er = frames_to_dict_list(grafana_post(SQL_EQUIPE_REAGENDOU_TEMPLATE.format(numos=numos_int)))
            if rows_er: equipe_reagendou = rows_er[0].get("descricao", "")
        except Exception: pass
        materiais_utilizados = []
        try: materiais_utilizados = frames_to_dict_list(grafana_post(SQL_MATERIAIS_UTILIZADOS_TEMPLATE.format(numos=numos_int)))
        except Exception: pass
        materiais_retirados = []
        try: materiais_retirados = frames_to_dict_list(grafana_post(SQL_MATERIAIS_RETIRADOS_TEMPLATE.format(numos=numos_int)))
        except Exception: pass
        return {"os": os_data, "reagendada": reagendada, "equipe_reagendou": equipe_reagendou,
                "ocorrencias": ocorrencias, "materiais_utilizados": materiais_utilizados,
                "materiais_retirados": materiais_retirados}
    except HTTPException:
        raise
    except Exception as ex:
        log.exception("Erro /detalhes numos=%s", numos)
        raise HTTPException(502, str(ex))


# ── Telegram ──────────────────────────────────────────────────────────────────

@router.get("/notify/telegram/status")
async def telegram_status():
    with state._dados_cache_lock:
        cache_ts = state._dados_cache["ts"]
    return {
        "enabled":    _telegram_enabled(),
        "chat_id":    TELEGRAM_CHAT_ID if _telegram_enabled() else "",
        "cache_ts":   cache_ts,
        "cache_rows": len(state._dados_cache["agendado"]) if _telegram_enabled() else 0,
    }


@router.post("/notify/telegram")
async def telegram_send(request: Request):
    _check_telegram()
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "Campo 'text' obrigatório")
    chat_id_override = _CHAT_MAP.get((body.get("chat") or "").strip().lower()) or None
    ok = _telegram_send(text, chat_id_override=chat_id_override)
    return JSONResponse({"ok": ok}, status_code=200 if ok else 502)


@router.post("/notify/telegram/status_now")
async def telegram_status_now():
    _check_telegram()
    threading.Thread(target=lambda: _telegram_send(_build_status_text()), daemon=True).start()
    return {"ok": True}


@router.post("/notify/telegram/pdf")
async def telegram_pdf(request: Request):
    _check_telegram()
    body = await request.json()
    data_uri = body.get("pdf", "")
    filename = body.get("filename") or ("relatorio-cabonnet-" + datetime.now().strftime("%Y-%m-%d") + ".pdf")
    if ";base64," not in data_uri:
        raise HTTPException(400, "Formato inválido")
    pdf_bytes        = _base64.b64decode(data_uri.split(";base64,", 1)[1])
    chat_id_override = body.get("chat_id") or None
    ok = _telegram_send_document(pdf_bytes, filename, caption="📋 <b>Relatório de Fechamento</b>", chat_id_override=chat_id_override)
    return JSONResponse({"ok": ok}, status_code=200 if ok else 502)


@router.post("/notify/telegram/photo")
async def telegram_photo(request: Request):
    _check_telegram()
    body    = await request.json()
    data_uri = body.get("photo", "")
    caption  = body.get("caption", "")
    chat_id  = _CHAT_MAP.get((body.get("chat") or "").strip().lower()) or TELEGRAM_CHAT_ID
    if ";base64," not in data_uri:
        raise HTTPException(400, "Formato inválido")
    img_bytes   = _base64.b64decode(data_uri.split(";base64,", 1)[1])
    as_document = bool(body.get("as_document", False))
    if as_document:
        url  = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendDocument"
        resp = _requests.post(url, data={"chat_id": chat_id, "caption": caption, "parse_mode": "HTML"},
                               files={"document": ("relatorio-cabonnet.png", img_bytes, "image/png")}, timeout=30)
    else:
        url  = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendPhoto"
        resp = _requests.post(url, data={"chat_id": chat_id, "caption": caption, "parse_mode": "HTML"},
                               files={"photo": ("relatorio.png", img_bytes, "image/png")}, timeout=30)
    ok = resp.ok
    if ok:   log.info("[Telegram] %s enviado — %d bytes", "Documento" if as_document else "Foto", len(img_bytes))
    else:    log.warning("[Telegram] Falha: %s", resp.text[:200])
    return JSONResponse({"ok": ok}, status_code=200 if ok else 502)


# ── Juniper ───────────────────────────────────────────────────────────────────

@router.get("/juniper")
async def juniper(cluster: str = ""):
    cluster = cluster or MONITOR_CONFIG["cluster_default"]
    try:
        result   = juniper_fetch(cluster)
        clientes = result.get("clientes") or []
        with state._jun_known_lock:
            primeira_poll = cluster not in state._jun_initialized
            conhecidos    = state._jun_known.get(cluster, set())
            novos = [] if primeira_poll else [c for c in clientes if c.get("user_name") and c["user_name"] not in conhecidos]
            state._jun_known[cluster]    = {c["user_name"] for c in clientes if c.get("user_name")}
            state._jun_initialized.add(cluster)
        if novos:
            threading.Thread(target=_jun_notify_new_clients,
                              args=(novos, cluster, result.get("ultima_coleta", "")), daemon=True).start()
        return result
    except Exception as ex:
        log.exception("Erro /juniper")
        raise HTTPException(502, "Juniper fetch error: " + str(ex))


@router.get("/juniper/historico")
async def juniper_historico_get():
    try:
        if os.path.exists(JUN_HIST_FILE):
            with open(JUN_HIST_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"historico": [], "snapshots": {}}
    except Exception:
        log.exception("Erro lendo jun_historico.json")
        return {"historico": [], "snapshots": {}}


@router.post("/juniper/historico")
async def juniper_historico_post(request: Request):
    body = await request.json()
    with open(JUN_HIST_FILE, "w", encoding="utf-8") as f:
        json.dump(body, f, ensure_ascii=False)
    return {"ok": True}


# ── AI (Claude) ───────────────────────────────────────────────────────────────

@router.post("/ai/revisitas")
async def ai_revisitas(request: Request):
    body   = await request.json()
    result = _ai_revisitas(body)
    if result is None:
        code = 503 if not _ANTHROPIC_API_KEY else 502
        msg  = "ANTHROPIC_API_KEY não configurada no .env" if not _ANTHROPIC_API_KEY else "Erro ao chamar Claude API"
        raise HTTPException(code, msg)
    return {"ok": True, **result}


@router.post("/ai/narrative")
async def ai_narrative(request: Request):
    body   = await request.json()
    result = _ai_narrative(body)
    if result is None:
        code = 503 if not _ANTHROPIC_API_KEY else 502
        msg  = "ANTHROPIC_API_KEY não configurada no .env" if not _ANTHROPIC_API_KEY else "Erro ao chamar Claude API"
        raise HTTPException(code, msg)
    return {"ok": True, **result}


@router.post("/ai/anomalias")
async def ai_anomalias(request: Request):
    from cabonnet.ai import _ai_anomalias
    body   = await request.json()
    result = _ai_anomalias(body)
    if result is None:
        code = 503 if not _ANTHROPIC_API_KEY else 502
        msg  = "ANTHROPIC_API_KEY não configurada no .env" if not _ANTHROPIC_API_KEY else "Erro ao chamar Claude API"
        raise HTTPException(code, msg)
    return {"ok": True, **result}


@router.get("/ai/daily-briefing")
async def ai_briefing_get():
    """Retorna o último briefing executivo gerado (cache em memória)."""
    with state._ai_briefing_lock:
        c = dict(state._ai_briefing_cache)
    if not c.get("texto"):
        raise HTTPException(404, "Nenhum briefing gerado ainda — aguarde as 7h ou dispare via POST")
    return {"ok": True, "cached": True, **c}


@router.post("/ai/forecast")
async def ai_forecast(request: Request):
    """Demand Forecasting — projeta próximos 7 dias de abertura de OS."""
    from cabonnet.ai import _ai_forecast
    body   = await request.json()
    result = _ai_forecast(body)
    if result is None:
        code = 503 if not _ANTHROPIC_API_KEY else 422
        msg  = "ANTHROPIC_API_KEY não configurada" if not _ANTHROPIC_API_KEY else "Série histórica insuficiente (mínimo 7 pontos)"
        raise HTTPException(code, msg)
    return {"ok": True, **result}


@router.post("/ai/daily-briefing")
async def ai_briefing_post():
    """Disparo manual do briefing executivo — gera e armazena em cache."""
    from cabonnet.ai import _ai_daily_briefing
    from cabonnet.stats import compute_stats
    with state._query_cache_lock:
        cached_q = dict(state._query_cache)
    stats  = compute_stats(cached_q.get("pendente", ""), cached_q.get("agendado", ""), cached_q.get("futuro", ""))
    from datetime import date as _date
    payload = {**stats, "data": _date.today().strftime("%d/%m/%Y"), "ontem": {}}
    result  = _ai_daily_briefing(payload)
    if result is None:
        code = 503 if not _ANTHROPIC_API_KEY else 502
        msg  = "ANTHROPIC_API_KEY não configurada no .env" if not _ANTHROPIC_API_KEY else "Erro ao chamar Claude API"
        raise HTTPException(code, msg)
    return {"ok": True, "cached": False, **result}


# ── Grafana / Zabbix ──────────────────────────────────────────────────────────

@router.get("/grafana/os-totais")
async def grafana_os_totais():
    try:
        rows = frames_to_dict_list(grafana_post(SQL_ERP_OS_TOTAIS))
        return {"ok": True, "data": rows[0] if rows else {}}
    except Exception as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=502)


@router.get("/grafana/os-cidades")
async def grafana_os_cidades():
    try:
        return {"ok": True, "data": frames_to_dict_list(grafana_post(SQL_ERP_OS_CIDADES))}
    except Exception as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=502)


@router.get("/grafana/incidentes")
async def grafana_incidentes():
    try:
        return {"ok": True, "data": _map_problems(zabbix_get_problems())}
    except Exception as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=502)


def _zabbix_route(fn):
    async def handler():
        try:
            return {"ok": True, "data": fn()}
        except Exception as exc:
            return JSONResponse({"ok": False, "error": str(exc)}, status_code=502)
    return handler

router.get("/grafana/zabbix/discover")(_zabbix_route(zabbix_discover))
router.get("/grafana/zabbix/pppoe")(_zabbix_route(zabbix_get_pppoe_vlans))
router.get("/grafana/zabbix/mttr")(_zabbix_route(zabbix_get_mttr))
router.get("/grafana/zabbix/cidades")(_zabbix_route(zabbix_get_cidades))
router.get("/grafana/zabbix/top-equipamentos")(_zabbix_route(zabbix_get_top_equipamentos))
router.get("/grafana/zabbix/olt")(_zabbix_route(zabbix_get_olt))
router.get("/grafana/zabbix/infra")(_zabbix_route(zabbix_get_infra))
router.get("/grafana/zabbix/assinantes")(_zabbix_route(zabbix_get_assinantes))


# ── SSE — Server-Sent Events ──────────────────────────────────────────────────

@router.get("/events")
async def events():
    q = _queue.Queue()
    with state._sse_clients_lock:
        state._sse_clients.append(q)

    async def stream():
        loop = asyncio.get_event_loop()
        try:
            while True:
                try:
                    msg = await loop.run_in_executor(None, q.get, True, 25)
                    yield msg.decode("utf-8") if isinstance(msg, bytes) else str(msg)
                except _queue.Empty:
                    yield ": keepalive\n\n"
        except (GeneratorExit, asyncio.CancelledError):
            pass
        finally:
            with state._sse_clients_lock:
                if q in state._sse_clients:
                    state._sse_clients.remove(q)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


# ── Mount router ─────────────────────────────────────────────────────────────
# /api/v1/* — versioned, shown in OpenAPI docs
# legacy paths (e.g. /query, /health) — included without schema so existing
# clients (React frontend, servidor.js) keep working without any changes.

app.include_router(router, prefix="/api/v1")
app.include_router(router, include_in_schema=False)


# ── SPA catch-all (React Router) ──────────────────────────────────────────────
# Deve ser montado por último para não sobrescrever as rotas acima.

if _DIST_DIR.exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=str(_DIST_DIR), html=True), name="spa")
