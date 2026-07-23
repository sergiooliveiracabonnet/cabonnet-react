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
from cabonnet.auth import _auth_enabled, _authenticate, _create_session, _role_from_cookie, _session_from_cookie
from cabonnet.builders import _build_status_text
from cabonnet.cache import _dados_cache_update
from cabonnet.config import (
    _ATE_CACHE_TTL,
    _load_env,
    _SCRIPT_DIR_ENV,
    _SLA_LIMITS,
    CONFIG,
    JUN_HIST_FILE,
    MONITOR_CONFIG,
    PG_CONFIG,
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
from cabonnet.db import (
    ALL_MODULOS,
    _db_bootstrap_admin,
    _db_count_ativos_por_role,
    _db_create_usuario,
    _db_get_agendamento_history,
    _db_get_permissoes,
    _db_get_usuario_by_id,
    _db_init,
    _db_load_cache,
    _db_list_usuarios,
    _db_save_cache,
    _db_set_password,
    _db_set_permissoes,
    _db_update_usuario,
    _hash_password,
    _verify_password,
)
from cabonnet.postgres import pg_init, pg_is_available, pg_load_snapshot, pg_sync_grafana
from cabonnet.grafana import (
    SQL_AGENDADO,
    SQL_ATENDIMENTO,
    SQL_BACKLOG_TEMPLATE,
    SQL_DETALHES_TEMPLATE,
    SQL_EQUIPE_REAGENDOU_TEMPLATE,
    SQL_ERP_OS_CIDADES,
    SQL_ERP_OS_TOTAIS,
    SQL_FOTO_BLOB_TEMPLATE,
    SQL_FUTURO,
    SQL_OS_EXECUCAO_GEO,
    SQL_PENDENTE,
    SQL_REVISITAS,
    build_atendimento_json,
    build_backlog_json,
    build_pares_revisita,
    frames_to_csv,
    frames_to_dict_list,
    grafana_post,
    sql_backlog,
    sql_checklist,
    sql_detalhes,
    sql_equipe_reagendou,
    sql_fotos,
    sql_materiais_retirados,
    sql_materiais_utilizados,
    sql_motivo_inconclusivo,
    sql_ocorrencias,
    sql_revisitas_com_obs,
)
from cabonnet.juniper import _jun_notify_new_clients, juniper_fetch
from cabonnet.telegram import _telegram_enabled, _telegram_send, _telegram_send_document, _tg_caps
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

# ── Security ──────────────────────────────────────────────────────────────────
# COOKIE_SECURE: definir como "false" apenas em desenvolvimento HTTP local.
_COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() not in ("0", "false", "no")

# CORS_ORIGINS: origens permitidas separadas por vírgula.
# Padrão seguro: apenas localhost em dev. Em produção, definir no .env.
_CORS_ORIGINS_RAW = os.environ.get("CORS_ORIGINS", "")
_CORS_ORIGINS = [o.strip() for o in _CORS_ORIGINS_RAW.split(",") if o.strip()] \
                or ["http://localhost:3000", "http://localhost:5000"]

# Rate limiting de login: máximo de 10 tentativas por IP em janela de 5 minutos.
_LOGIN_MAX_ATTEMPTS = 10
_LOGIN_WINDOW_S     = 300
_login_attempts: dict[str, list[float]] = {}
_login_attempts_lock = threading.Lock()

def _check_login_rate_limit(ip: str) -> None:
    """Levanta HTTP 429 se o IP excedeu o limite de tentativas de login."""
    now = _time_mod.time()
    with _login_attempts_lock:
        attempts = [t for t in _login_attempts.get(ip, []) if now - t < _LOGIN_WINDOW_S]
        if len(attempts) >= _LOGIN_MAX_ATTEMPTS:
            raise HTTPException(429, "Muitas tentativas de login. Aguarde 5 minutos.")
        attempts.append(now)
        _login_attempts[ip] = attempts

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
# _role_from_cookie vive em cabonnet.auth (fonte única de verdade).

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


def _require_session(request: Request) -> dict:
    """Como _require_auth, mas devolve a sessão completa ({"role","username"})
    — usado por endpoints que precisam saber QUEM está agindo, não só o papel
    (ex: trocar a própria senha)."""
    if not _auth_enabled():
        return {"role": "gestor", "username": None}
    sess = _session_from_cookie(request.headers.get("cookie", ""))
    if sess is None:
        raise HTTPException(401, "Não autenticado")
    return sess


def _require_gestor(role: str | None = Depends(_get_optional_role)) -> str:
    if role != "gestor":
        raise HTTPException(403, "Permissão negada — requer role gestor")
    return role


def _require_modulo(modulo_key: str):
    """Factory de dependency — segunda camada de defesa além do frontend
    (RequireModulo em React): bloqueia a chamada de API se o papel da sessão
    não tiver o módulo liberado. Gestor sempre passa (acesso total, fixo)."""
    def _dep(role: str = Depends(_require_auth)) -> str:
        if role != "gestor" and modulo_key not in _db_get_permissoes(role):
            raise HTTPException(403, f"Módulo não permitido para o papel {role}: {modulo_key}")
        return role
    return _dep


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
        if pg_is_available():
            threading.Thread(
                target=pg_sync_grafana,
                args=(csv_p or "", csv_a or "", csv_f or "", ts_now),
                daemon=True,
            ).start()
        threading.Thread(
            target=_dados_cache_update,
            args=(csv_p or "", csv_a or "", csv_f or ""),
            kwargs={"origem": origem},
            daemon=True,
        ).start()
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
        _vt_monitor_loop,
    )

    _db_init()
    _db_bootstrap_admin()
    pg_init(PG_CONFIG)

    # H4 — validação de configuração obrigatória no startup
    _missing_creds = [k for k, v in {
        "GRAFANA_DS_UID": CONFIG.get("ds_uid", ""),
        "GRAFANA_USER":   CONFIG.get("username", ""),
        "GRAFANA_PASS":   CONFIG.get("password", ""),
    }.items() if not v]
    if _missing_creds:
        log.warning("=" * 55)
        log.warning("  ⚠️  CONFIGURAÇÃO INCOMPLETA")
        log.warning("  Variáveis ausentes no .env: %s", _missing_creds)
        log.warning("  Acesse /setup para configurar as credenciais do Grafana.")
        log.warning("  /query retornará 502 até a configuração ser completada.")
        log.warning("=" * 55)

    threading.Thread(target=_cache_warmup,      name="CacheWarmup",    daemon=True).start()
    threading.Thread(target=_auto_refresh_loop, name="CacheAutoRefresh",daemon=True).start()
    threading.Thread(target=_jun_poll_loop,     name="JuniperPoll",    daemon=True).start()

    if _telegram_enabled():
        threading.Thread(target=_telegram_poll_loop,       name="TelegramPoll",      daemon=True).start()
        threading.Thread(target=_resumo_scheduler_loop,    name="TelegramScheduler", daemon=True).start()
        threading.Thread(target=_sla_monitor_loop,         name="SLAMonitor",        daemon=True).start()
        threading.Thread(target=_vt_monitor_loop,          name="VTMonitor",         daemon=True).start()
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
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-Request-ID"],
)


@app.middleware("http")
async def _correlation_id_middleware(request: Request, call_next):
    rid = request.headers.get("X-Request-ID", "")
    if rid:
        log.debug("[%s] %s %s", rid[:8], request.method, request.url.path)
    response = await call_next(request)
    if rid:
        response.headers["X-Request-ID"] = rid
    return response


# Rate limiting geral por IP: protege todas as rotas contra abuso/bug de polling.
# Login tem limite próprio e mais restrito (_check_login_rate_limit, acima).
_API_MAX_REQUESTS = 300
_API_WINDOW_S      = 60
_api_requests: dict[str, list[float]] = {}
_api_requests_lock = threading.Lock()

# Fora do limite geral: health check (batido pela infra a cada poucos segundos)
# e estáticos do build (JS/CSS/imagens não precisam de proteção de abuso).
_RATE_LIMIT_EXEMPT_PREFIXES = ("/health", "/assets", "/favicon")


def _check_api_rate_limit(ip: str) -> bool:
    """True se o IP ainda está dentro do limite (janela deslizante de 1 min)."""
    now = _time_mod.time()
    with _api_requests_lock:
        reqs = [t for t in _api_requests.get(ip, []) if now - t < _API_WINDOW_S]
        if len(reqs) >= _API_MAX_REQUESTS:
            _api_requests[ip] = reqs
            return False
        reqs.append(now)
        _api_requests[ip] = reqs
        return True


@app.middleware("http")
async def _rate_limit_middleware(request: Request, call_next):
    if request.url.path.startswith(_RATE_LIMIT_EXEMPT_PREFIXES):
        return await call_next(request)
    ip = request.client.host if request.client else "unknown"
    if not _check_api_rate_limit(ip):
        return JSONResponse({"detail": "Muitas requisições. Tente novamente em instantes."}, status_code=429)
    return await call_next(request)


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
    _check_login_rate_limit(request.client.host if request.client else "unknown")
    body = await request.form()
    user = (body.get("username") or "").strip()
    pwd  = body.get("password") or ""
    auth = _authenticate(user, pwd)
    if auth:
        token = _create_session(auth["role"], auth["username"])
        log.info("[Auth] Login OK — usuario: %s role: %s", auth["username"], auth["role"])
        resp = RedirectResponse("/dashboard", status_code=302)
        resp.set_cookie("cbn_session", token, path="/", httponly=True, samesite="strict", secure=_COOKIE_SECURE, max_age=SESSION_DURATION)
        return resp
    log.warning("[Auth] Login FALHOU — usuario: %s", user)
    return RedirectResponse("/login?error=1", status_code=302)


@app.post("/api/login")
async def api_login(request: Request):
    """Login JSON (React)."""
    _check_login_rate_limit(request.client.host if request.client else "unknown")
    body = await request.json()
    user = (body.get("username") or "").strip()
    pwd  = body.get("password") or ""
    auth = _authenticate(user, pwd)
    if auth:
        token   = _create_session(auth["role"], auth["username"])
        modulos = _db_get_permissoes(auth["role"])
        log.info("[Auth] Login React OK — usuario: %s role: %s", auth["username"], auth["role"])
        resp = JSONResponse({"ok": True, "role": auth["role"], "username": auth["username"], "modulos": modulos})
        resp.set_cookie("cbn_session", token, path="/", httponly=True, samesite="strict", secure=_COOKIE_SECURE, max_age=SESSION_DURATION)
        return resp
    log.warning("[Auth] Login React FALHOU — usuario: %s", user)
    return JSONResponse({"ok": False, "error": "Credenciais inválidas"}, status_code=401)


@app.get("/api/session")
async def api_session(request: Request):
    sess = _session_from_cookie(request.headers.get("cookie", ""))
    if sess is None:
        return {"ok": False, "auth_enabled": True, "role": None}
    return {
        "ok":           True,
        "auth_enabled": True,
        "role":         sess["role"],
        "username":     sess.get("username"),
        "modulos":      _db_get_permissoes(sess["role"]),
    }


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


# ── Usuários e permissões (gestão, gestor-only) ────────────────────────────────
# Rótulos exibidos na tela de permissões — mantidos em sincronia com ALL_MODULOS
# (cabonnet/db.py) e com o mapa de rotas do frontend (src/lib/modulos.ts).
_MODULO_LABELS = {
    "dashboard":          "Dashboard",
    "ordens":             "Ordens de Serviço",
    "graficos":           "Gráficos",
    "cidades":            "Cidades",
    "fornecedor":         "Fornecedor",
    "juniper":            "Juniper",
    "fechamento":         "Fechamento",
    "mapa":               "Mapa",
    "noc":                "NOC",
    "erp_relatorios":     "Relatórios",
    "erp_alertas":        "Alertas",
    "erp_qualidade":      "Qualidade",
    "erp_planner":        "Planner",
    "erp_fila":           "Fila de Prioridade",
    "erp_ranking":        "Ranking Técnicos",
    "erp_bi_tecnica":     "BI-Gestão Técnica",
}
_ROLES_VALIDOS = ("gestor", "operador", "viewer")


@app.get("/api/usuarios")
async def list_usuarios(_role: str = Depends(_require_gestor)):
    return {"ok": True, "items": _db_list_usuarios()}


@app.post("/api/usuarios")
async def create_usuario(request: Request, _role: str = Depends(_require_gestor)):
    body     = await request.json()
    username = str(body.get("username", "")).strip()
    password = body.get("password") or ""
    role     = body.get("role") or "viewer"
    if not username:
        raise HTTPException(400, "username é obrigatório")
    if len(password) < 6:
        raise HTTPException(400, "senha deve ter ao menos 6 caracteres")
    if role not in _ROLES_VALIDOS:
        raise HTTPException(400, f"role inválida — use um de: {', '.join(_ROLES_VALIDOS)}")
    try:
        uid = _db_create_usuario(username, _hash_password(password), role)
    except Exception:
        raise HTTPException(409, "Já existe um usuário com esse username")
    log.info("[Usuarios] Criado — username: %s role: %s", username, role)
    return {"ok": True, "id": uid}


@app.put("/api/usuarios/{uid}")
async def update_usuario(uid: int, request: Request, _role: str = Depends(_require_gestor)):
    body    = await request.json()
    alvo    = _db_get_usuario_by_id(uid)
    if alvo is None:
        raise HTTPException(404, "Usuário não encontrado")

    role  = body.get("role")
    ativo = body.get("ativo")
    if role is not None and role not in _ROLES_VALIDOS:
        raise HTTPException(400, f"role inválida — use um de: {', '.join(_ROLES_VALIDOS)}")

    # Guard anti-lockout: não permite desativar/rebaixar o último gestor ativo.
    rebaixando   = role is not None and role != "gestor"
    desativando  = ativo is False
    if alvo["role"] == "gestor" and alvo["ativo"] and (rebaixando or desativando):
        if _db_count_ativos_por_role("gestor") <= 1:
            raise HTTPException(409, "Não é possível desativar/rebaixar o último gestor ativo")

    updated = _db_update_usuario(uid, role=role, ativo=ativo)
    log.info("[Usuarios] Atualizado — id: %s role: %s ativo: %s", uid, role, ativo)
    return {"ok": True, "item": updated}


@app.post("/api/usuarios/me/senha")
async def change_own_senha(request: Request, sess: dict = Depends(_require_session)):
    # Precisa vir ANTES de /api/usuarios/{uid}/senha: Starlette casa rotas
    # por ordem de registro e {uid} é um segmento string irrestrito na
    # camada de roteamento — "me" bateria com {uid} se essa rota viesse
    # depois, roteando erroneamente pra reset_usuario_senha (gestor-only).
    body  = await request.json()
    atual = body.get("atual") or ""
    nova  = body.get("nova") or ""
    if len(nova) < 6:
        raise HTTPException(400, "nova senha deve ter ao menos 6 caracteres")
    username = sess.get("username")
    if not username:
        raise HTTPException(400, "sessão sem usuário associado (login legado) — peça a um gestor pra redefinir")
    from cabonnet.db import _db_get_usuario_by_username
    user = _db_get_usuario_by_username(username)
    if user is None or not _verify_password(atual, user["senha_hash"]):
        raise HTTPException(403, "Senha atual incorreta")
    _db_set_password(user["id"], _hash_password(nova))
    log.info("[Usuarios] Senha própria alterada — username: %s", username)
    return {"ok": True}


@app.post("/api/usuarios/{uid}/senha")
async def reset_usuario_senha(uid: int, request: Request, _role: str = Depends(_require_gestor)):
    body     = await request.json()
    password = body.get("password") or ""
    if len(password) < 6:
        raise HTTPException(400, "senha deve ter ao menos 6 caracteres")
    if _db_get_usuario_by_id(uid) is None:
        raise HTTPException(404, "Usuário não encontrado")
    _db_set_password(uid, _hash_password(password))
    log.info("[Usuarios] Senha redefinida pelo gestor — id: %s", uid)
    return {"ok": True}


@app.get("/api/permissoes")
async def get_permissoes(_role: str = Depends(_require_gestor)):
    permissoes = {role: _db_get_permissoes(role) for role in _ROLES_VALIDOS}
    modulos    = [{"key": k, "label": _MODULO_LABELS.get(k, k)} for k in ALL_MODULOS]
    return {"ok": True, "permissoes": permissoes, "modulos": modulos}


@app.put("/api/permissoes/{role}")
async def set_permissoes(role: str, request: Request, _role: str = Depends(_require_gestor)):
    if role == "gestor":
        raise HTTPException(400, "Permissões do papel gestor não são editáveis")
    if role not in _ROLES_VALIDOS:
        raise HTTPException(400, f"role inválida — use um de: {', '.join(_ROLES_VALIDOS)}")
    body    = await request.json()
    modulos = body.get("modulos") or []
    salvos  = _db_set_permissoes(role, modulos)
    log.info("[Permissoes] Atualizado — role: %s modulos: %s", role, salvos)
    return {"ok": True, "modulos": salvos}


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
    # _refresh_cache_from_grafana nunca relança exceção — retorna False quando falha.
    # Os fallbacks ficam no fluxo normal (não em except) para serem sempre alcançáveis.
    log.info("[/query] Cache frio — buscando do Grafana...")
    ok = _refresh_cache_from_grafana("/query-sync")
    if ok:
        with state._query_cache_lock:
            cached = dict(state._query_cache)
        def _n(t): return len(t.splitlines()) - 1 if t else 0
        return {"pendente": cached["pendente"], "agendado": cached["agendado"], "futuro": cached["futuro"],
                "n_pendente": _n(cached["pendente"]), "n_agendado": _n(cached["agendado"]),
                "n_futuro":   _n(cached["futuro"]),   "date": data_iso}

    # Fallback 1: cache em memória (expirado mas disponível)
    with state._query_cache_lock:
        mem_ts   = state._query_cache["ts"]
        mem_copy = dict(state._query_cache) if mem_ts > 0 else None
    if mem_copy:
        cache_age = int((_time_mod.time() - mem_ts) / 60)
        log.warning("[/query] Grafana indisponível — servindo cache de %d min atrás", cache_age)
        def _n(t): return len(t.splitlines()) - 1 if t else 0
        return {"pendente": mem_copy["pendente"], "agendado": mem_copy["agendado"],
                "futuro":   mem_copy["futuro"],
                "n_pendente": _n(mem_copy["pendente"]), "n_agendado": _n(mem_copy["agendado"]),
                "n_futuro":   _n(mem_copy["futuro"]),
                "date": data_iso, "cached": True, "cache_age_min": cache_age}

    # Fallback 2: SQLite
    csv_a_db, ts_db = _db_load_cache("agendado")
    if csv_a_db:
        csv_p_db, _ = _db_load_cache("pendente")
        csv_f_db, _ = _db_load_cache("futuro")
        cache_age   = int((_time_mod.time() - ts_db) / 60) if ts_db else -1
        log.warning("[/query] Servindo cache SQLite de %d min atrás", cache_age)
        return {"pendente": csv_p_db or "", "agendado": csv_a_db, "futuro": csv_f_db or "",
                "n_pendente": len(csv_p_db.splitlines()) - 1 if csv_p_db else 0,
                "n_agendado": len(csv_a_db.splitlines()) - 1,
                "n_futuro":   len(csv_f_db.splitlines()) - 1 if csv_f_db else 0,
                "date": data_iso, "cached": True, "cached_source": "sqlite", "cache_age_min": cache_age}

    # Fallback 3: PostgreSQL
    if pg_is_available():
        csv_a_pg, ts_pg = pg_load_snapshot("agendado")
        if csv_a_pg:
            csv_p_pg, _ = pg_load_snapshot("pendente")
            csv_f_pg, _ = pg_load_snapshot("futuro")
            cache_age   = int((_time_mod.time() - ts_pg) / 60) if ts_pg else -1
            log.warning("[/query] Servindo snapshot PostgreSQL de %d min atrás", cache_age)
            return {"pendente": csv_p_pg or "", "agendado": csv_a_pg, "futuro": csv_f_pg or "",
                    "n_pendente": len(csv_p_pg.splitlines()) - 1 if csv_p_pg else 0,
                    "n_agendado": len(csv_a_pg.splitlines()) - 1,
                    "n_futuro":   len(csv_f_pg.splitlines()) - 1 if csv_f_pg else 0,
                    "date": data_iso, "cached": True, "cached_source": "postgresql",
                    "cache_age_min": cache_age}

    raise HTTPException(502, "Grafana indisponível e sem cache persistido")


@router.get("/revisitas")
async def revisitas(_role: str = Depends(_require_auth)):
    try:
        csv_r = frames_to_csv(grafana_post(SQL_REVISITAS))
        n = len(csv_r.splitlines()) - 1 if csv_r else 0
        with state._revisitas_cache_lock:
            state._revisitas_cache.update({"csv": csv_r or "", "n": n, "ts": _time_mod.time()})
        return {"concluidas": csv_r or "", "n": n}
    except Exception as ex:
        log.warning("[/revisitas] Grafana indisponível — tentando cache")
        with state._revisitas_cache_lock:
            cached = dict(state._revisitas_cache)
        if cached["ts"] > 0:
            cache_age = int((_time_mod.time() - cached["ts"]) / 60)
            log.warning("[/revisitas] Servindo cache de %d min atrás", cache_age)
            return {"concluidas": cached["csv"], "n": cached["n"], "cached": True, "cache_age_min": cache_age}
        log.exception("Erro /revisitas sem cache disponível")
        raise HTTPException(502, str(ex))


_BACKLOG_CACHE_TTL = 5 * 60  # 5 minutos


@router.get("/backlog")
async def backlog(inicio: str = "", fim: str = "", _role: str = Depends(_require_auth)):
    from datetime import date, timedelta
    import re
    _date_re = re.compile(r"^\d{4}-\d{2}-\d{2}$")
    today      = date.today()
    first_this = today.replace(day=1)
    first_prev = (first_this - timedelta(days=1)).replace(day=1)
    fim_default = (today + timedelta(days=1)).isoformat()

    if inicio and _date_re.match(inicio) and fim and _date_re.match(fim):
        inicio_use = inicio
        fim_use    = fim
    else:
        inicio_use = first_this.isoformat()
        fim_use    = fim_default

    cache_key = f"{inicio_use}|{fim_use}"
    now = _time_mod.time()
    with state._backlog_cache_lock:
        cached = state._backlog_cache
        if (cached["data"] is not None
                and cached.get("key") == cache_key
                and (now - cached["ts"]) < _BACKLOG_CACHE_TTL):
            return cached["data"]
    try:
        rows   = frames_to_dict_list(grafana_post(sql_backlog(inicio_use, fim_use)))
        result = build_backlog_json(rows)
        result["periodo"] = inicio_use
        result["fim"]     = fim_use
        with state._backlog_cache_lock:
            state._backlog_cache["data"] = result
            state._backlog_cache["ts"]   = now
            state._backlog_cache["key"]  = cache_key
        return result
    except Exception as ex:
        log.exception("Erro /backlog")
        raise HTTPException(502, str(ex))


_REVISITAS_DETALHE_CACHE_TTL = 5 * 60  # 5 minutos


@router.get("/revisitas-detalhe")
async def revisitas_detalhe(inicio: str = "", fim: str = "", _role: str = Depends(_require_auth)):
    import re
    _date_re = re.compile(r"^\d{4}-\d{2}-\d{2}$")
    today      = date.today()
    first_this = today.replace(day=1)
    fim_default = (today.replace(day=1).__class__(today.year, today.month + 1, 1)
                   if today.month < 12
                   else today.replace(year=today.year + 1, month=1, day=1)).isoformat()

    if inicio and _date_re.match(inicio) and fim and _date_re.match(fim):
        inicio_use = inicio
        fim_use    = fim
    else:
        from datetime import timedelta
        inicio_use = first_this.isoformat()
        fim_use    = (today + timedelta(days=1)).isoformat()

    try:
        rows   = frames_to_dict_list(grafana_post(sql_revisitas_com_obs(inicio_use, fim_use)))
        result = build_pares_revisita(rows)
        result["periodo"] = inicio_use
        result["fim"]     = fim_use
        return result
    except Exception as ex:
        log.exception("Erro /revisitas-detalhe")
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
        rows = frames_to_dict_list(grafana_post(sql_detalhes(numos_int)))
        if not rows:
            raise HTTPException(404, f"OS {numos} não encontrada.")
        os_data = rows[0]
        dt_atend = os_data.get("dataatendimento", "")
        dt_agend = os_data.get("dataagendamento", "")
        reagendada = bool(dt_atend and dt_agend and dt_atend[:10] != dt_agend[:10])
        ocorrencias = []
        try: ocorrencias = frames_to_dict_list(grafana_post(sql_ocorrencias(numos_int)))
        except Exception: log.warning("Falha ao buscar ocorrências numos=%s", numos_int, exc_info=True)
        equipe_reagendou = ""
        try:
            rows_er = frames_to_dict_list(grafana_post(sql_equipe_reagendou(numos_int)))
            if rows_er: equipe_reagendou = rows_er[0].get("descricao", "")
        except Exception: log.warning("Falha ao buscar equipe_reagendou numos=%s", numos_int, exc_info=True)
        materiais_utilizados = []
        try: materiais_utilizados = frames_to_dict_list(grafana_post(sql_materiais_utilizados(numos_int)))
        except Exception: log.warning("Falha ao buscar materiais_utilizados numos=%s", numos_int, exc_info=True)
        materiais_retirados = []
        try: materiais_retirados = frames_to_dict_list(grafana_post(sql_materiais_retirados(numos_int)))
        except Exception: log.warning("Falha ao buscar materiais_retirados numos=%s", numos_int, exc_info=True)
        fotos = []
        try: fotos = frames_to_dict_list(grafana_post(sql_fotos(numos_int)))
        except Exception: log.warning("Falha ao buscar fotos numos=%s", numos_int, exc_info=True)
        checklist = []
        try: checklist = frames_to_dict_list(grafana_post(sql_checklist(numos_int)))
        except Exception: log.warning("Falha ao buscar checklist numos=%s", numos_int, exc_info=True)
        motivo_inconclusivo = None
        try:
            rows_mi = frames_to_dict_list(grafana_post(sql_motivo_inconclusivo(numos_int)))
            if rows_mi: motivo_inconclusivo = rows_mi[0].get("motivoinconclusivo") or None
        except Exception: log.warning("Falha ao buscar motivo_inconclusivo numos=%s", numos_int, exc_info=True)
        return {"os": os_data, "reagendada": reagendada, "equipe_reagendou": equipe_reagendou,
                "ocorrencias": ocorrencias, "materiais_utilizados": materiais_utilizados,
                "materiais_retirados": materiais_retirados,
                "fotos": [{"id": f.get("id"), "codfoto": f.get("codfoto"), "nomearquivo": f.get("nomearquivo"),
                           "descricao": f.get("descricao") or None, "usuario": f.get("usuario"),
                           "extensaoarquivo": f.get("extensaoarquivo")} for f in fotos],
                "checklist": [{"servico": c.get("descricaoservico"), "descricao": c.get("descricaochecklist"),
                               "checked": bool(c.get("checked"))} for c in checklist],
                "motivoinconclusivo": motivo_inconclusivo}
    except HTTPException:
        raise
    except Exception as ex:
        log.exception("Erro /detalhes numos=%s", numos)
        raise HTTPException(502, str(ex))


_FOTO_EXT_PERMITIDAS = {"jpg", "jpeg", "png", "gif", "webp", "bmp"}


@router.get("/detalhes/foto")
async def detalhes_foto(numos: str = "", codfoto: str = ""):
    if not numos.strip().isdigit() or not codfoto.strip().isdigit():
        raise HTTPException(400, "Parâmetros 'numos'/'codfoto' inválidos.")
    numos_int   = int(numos.strip())
    codfoto_int = int(codfoto.strip())
    try:
        rows = frames_to_dict_list(grafana_post(SQL_FOTO_BLOB_TEMPLATE.format(numos=numos_int, codfoto=codfoto_int)))
    except Exception as ex:
        log.exception("Erro /detalhes/foto numos=%s codfoto=%s", numos, codfoto)
        raise HTTPException(502, str(ex))
    if not rows or not rows[0].get("imagem_b64"):
        raise HTTPException(404, f"Foto {codfoto} da OS {numos} não encontrada.")
    img_bytes = _base64.b64decode(rows[0]["imagem_b64"])
    ext_raw = (rows[0].get("extensaoarquivo") or "jpg").strip().lower().lstrip(".")
    ext = ext_raw if ext_raw in _FOTO_EXT_PERMITIDAS else "jpg"
    return RawResponse(content=img_bytes, media_type=f"image/{ext}")


@router.get("/erp/os-execucao-geo")
async def os_execucao_geo():
    try:
        rows = frames_to_dict_list(grafana_post(SQL_OS_EXECUCAO_GEO))
    except Exception:
        log.warning("Falha ao buscar os-execucao-geo", exc_info=True)
        return []
    return [
        {
            "numos":           r.get("numos"),
            "latitudeinicio":  r.get("latitudeinicio"),
            "longitudeinicio": r.get("longitudeinicio"),
            "equipeagendada":  r.get("equipeagendada"),
        }
        for r in rows
    ]


@router.get("/detalhes/agendamentos")
async def detalhes_agendamentos(numos: str = ""):
    """Histórico de equipes/datas de agendamento de uma OS, capturado pelo
    polling em cache.py — não vem do Grafana, que só guarda o estado atual."""
    if not numos.strip().isdigit():
        raise HTTPException(400, "Parâmetro 'numos' inválido.")
    return {"historico": _db_get_agendamento_history(numos.strip())}


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
        resp = _requests.post(url, data={"chat_id": chat_id, "caption": _tg_caps(caption), "parse_mode": "HTML"},
                               files={"document": ("relatorio-cabonnet.png", img_bytes, "image/png")}, timeout=30)
    else:
        url  = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendPhoto"
        resp = _requests.post(url, data={"chat_id": chat_id, "caption": _tg_caps(caption), "parse_mode": "HTML"},
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

@router.post("/ai/revisitas-causa")
async def ai_revisitas_causa(request: Request):
    from cabonnet.ai import _ai_revisitas_causa
    body   = await request.json()
    result = _ai_revisitas_causa(body)
    if result is None:
        code = 503 if not _ANTHROPIC_API_KEY else 502
        msg  = "ANTHROPIC_API_KEY não configurada no .env" if not _ANTHROPIC_API_KEY else "Erro ao chamar Claude API"
        raise HTTPException(code, msg)
    return {"ok": True, **result}


@router.get("/api/revisita-motivos")
async def get_revisita_motivos(dias: int = 90, _role: str = Depends(_require_modulo("erp_qualidade"))):
    from cabonnet.db import _db_list_revisita_motivos
    return {"ok": True, **_db_list_revisita_motivos(dias)}


@router.get("/api/motivo-encerramento")
async def get_motivo_encerramento(numos: str, _role: str = Depends(_require_auth)):
    from cabonnet.db import _db_get_motivo_encerramento
    return {"ok": True, "item": _db_get_motivo_encerramento(numos)}


@router.post("/api/motivo-encerramento")
async def save_motivo_encerramento(request: Request, _role: str = Depends(_require_auth)):
    from cabonnet.db import _db_save_motivo_encerramento
    body = await request.json()
    numos = str(body.get("numos", "")).strip()
    motivo = str(body.get("motivo", "")).strip()
    if not numos or not motivo:
        raise HTTPException(400, "numos e motivo são obrigatórios")
    ok = _db_save_motivo_encerramento(
        numos=numos,
        motivo=motivo,
        observacao=body.get("observacao", ""),
        nomedaequipe=body.get("nomedaequipe", ""),
        nomedacidade=body.get("nomedacidade", ""),
    )
    if not ok:
        raise HTTPException(500, "Falha ao salvar classificação")
    return {"ok": True}


@router.get("/api/tecnicos")
async def list_tecnicos(_role: str = Depends(_require_modulo("erp_ranking"))):
    from cabonnet.db import _db_list_tecnicos
    return {"ok": True, "items": _db_list_tecnicos()}


@router.post("/api/tecnicos")
async def upsert_tecnico(request: Request, _role: str = Depends(_require_modulo("erp_ranking"))):
    from cabonnet.db import _db_upsert_tecnico
    body = await request.json()
    codigo = str(body.get("codigo", "")).strip()
    if not codigo:
        raise HTTPException(400, "codigo é obrigatório")
    ok = _db_upsert_tecnico(
        codigo=codigo,
        nome_real=body.get("nome_real", ""),
        contato=body.get("contato", ""),
        ativo=body.get("ativo", True),
    )
    if not ok:
        raise HTTPException(500, "Falha ao salvar técnico")
    return {"ok": True}


@router.delete("/api/tecnicos/{codigo}")
async def delete_tecnico(codigo: str, _role: str = Depends(_require_modulo("erp_ranking"))):
    from cabonnet.db import _db_delete_tecnico
    ok = _db_delete_tecnico(codigo)
    if not ok:
        raise HTTPException(404, "Técnico não encontrado")
    return {"ok": True}


@router.get("/api/justificativas")
async def list_justificativas(limit: int = 100, _role: str = Depends(_require_auth)):
    from cabonnet.db import _db_list_justificativas
    return {"ok": True, "items": _db_list_justificativas(limit)}


@router.post("/api/justificativas")
async def save_justificativa(request: Request, _role: str = Depends(_require_auth)):
    from cabonnet.db import _db_save_justificativa
    body = await request.json()
    ia   = body.get("ia_result") or {}
    new_id = _db_save_justificativa(
        data_pico       = body.get("data_pico", ""),
        periodo_inicio  = body.get("periodo_inicio", ""),
        periodo_fim     = body.get("periodo_fim", ""),
        count_os        = int(body.get("count_os", 0)),
        zscore          = body.get("zscore"),
        contexto_real   = body.get("contexto_real", ""),
        causa_principal = ia.get("causa_principal", ""),
        impacto         = ia.get("impacto", ""),
        contexto_ia     = ia.get("contexto", ""),
        acoes           = ia.get("acoes", []),
        recomendacao    = ia.get("recomendacao_gestao", ""),
    )
    if new_id is None:
        raise HTTPException(500, "Falha ao salvar justificativa")
    return {"ok": True, "id": new_id}


@router.delete("/api/justificativas/{jid}")
async def delete_justificativa(jid: int, _role: str = Depends(_require_auth)):
    from cabonnet.db import _db_delete_justificativa
    ok = _db_delete_justificativa(jid)
    if not ok:
        raise HTTPException(404, "Justificativa não encontrada")
    return {"ok": True}


@router.get("/api/pico-alertas")
async def list_pico_alertas(_role: str = Depends(_require_auth)):
    from cabonnet.db import _db_list_pico_alertas_pending
    return {"ok": True, "items": _db_list_pico_alertas_pending()}


@router.post("/api/pico-alertas/{alerta_id}/dismiss")
async def dismiss_pico_alerta(alerta_id: int, _role: str = Depends(_require_auth)):
    from cabonnet.db import _db_update_pico_alerta_status
    _db_update_pico_alerta_status(alerta_id, "dismissed")
    return {"ok": True}


@router.post("/api/pico-alertas/{alerta_id}/justified")
async def justified_pico_alerta(alerta_id: int, _role: str = Depends(_require_auth)):
    from cabonnet.db import _db_update_pico_alerta_status
    _db_update_pico_alerta_status(alerta_id, "justified")
    return {"ok": True}


@router.post("/ai/justificativa-backlog")
async def ai_justificativa_backlog(request: Request):
    from cabonnet.ai import _ai_justificativa_backlog
    body   = await request.json()
    result = _ai_justificativa_backlog(body)
    if result is None:
        code = 503 if not _ANTHROPIC_API_KEY else 502
        msg  = "ANTHROPIC_API_KEY não configurada no .env" if not _ANTHROPIC_API_KEY else "Erro ao chamar Claude API"
        raise HTTPException(code, msg)
    return {"ok": True, **result}


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


@router.post("/ai/suggest-team")
async def ai_suggest_team(request: Request):
    """Sugestão de equipe com justificativa para uma OS sem equipe."""
    from cabonnet.ai import _ai_suggest_team
    body   = await request.json()
    result = _ai_suggest_team(body)
    if result is None:
        code = 503 if not _ANTHROPIC_API_KEY else 502
        msg  = "ANTHROPIC_API_KEY não configurada no .env" if not _ANTHROPIC_API_KEY else "Erro ao chamar Claude API"
        raise HTTPException(code, msg)
    return {"ok": True, **result}


@router.post("/ai/alertas")
async def ai_alertas(request: Request):
    from cabonnet.ai import _ai_alertas
    body = await request.json()
    result = _ai_alertas(body)
    if result is None:
        code = 503 if not _ANTHROPIC_API_KEY else 502
        msg = "ANTHROPIC_API_KEY não configurada" if not _ANTHROPIC_API_KEY else "Erro ao chamar Claude API"
        raise HTTPException(code, msg)
    return {"ok": True, **result}


@router.post("/ai/capacidade")
async def ai_capacidade(request: Request):
    from cabonnet.ai import _ai_capacidade
    body = await request.json()
    result = _ai_capacidade(body)
    if result is None:
        code = 503 if not _ANTHROPIC_API_KEY else 502
        msg = "ANTHROPIC_API_KEY não configurada" if not _ANTHROPIC_API_KEY else "Erro ao chamar Claude API"
        raise HTTPException(code, msg)
    return {"ok": True, **result}


@router.post("/ai/campo-previsao")
async def ai_campo_previsao(request: Request):
    from cabonnet.ai import _ai_campo_previsao
    body = await request.json()
    result = _ai_campo_previsao(body)
    if result is None:
        code = 503 if not _ANTHROPIC_API_KEY else 502
        msg = "ANTHROPIC_API_KEY não configurada" if not _ANTHROPIC_API_KEY else "Erro ao chamar Claude API"
        raise HTTPException(code, msg)
    return {"ok": True, **result}


@router.post("/ai/fornecedor-rec")
async def ai_fornecedor_rec(request: Request):
    from cabonnet.ai import _ai_fornecedor_rec
    body = await request.json()
    result = _ai_fornecedor_rec(body)
    if result is None:
        code = 503 if not _ANTHROPIC_API_KEY else 502
        msg = "ANTHROPIC_API_KEY não configurada" if not _ANTHROPIC_API_KEY else "Erro ao chamar Claude API"
        raise HTTPException(code, msg)
    return {"ok": True, **result}


@router.post("/ai/planner")
async def ai_planner(request: Request):
    from cabonnet.ai import _ai_planner
    body = await request.json()
    result = _ai_planner(body)
    if result is None:
        code = 503 if not _ANTHROPIC_API_KEY else 502
        msg = "ANTHROPIC_API_KEY não configurada" if not _ANTHROPIC_API_KEY else "Erro ao chamar Claude API"
        raise HTTPException(code, msg)
    return {"ok": True, **result}


@router.post("/ai/proxima-os")
async def ai_proxima_os(request: Request):
    from cabonnet.ai import _ai_proxima_os
    body = await request.json()
    result = _ai_proxima_os(body)
    if result is None:
        code = 503 if not _ANTHROPIC_API_KEY else 502
        msg = "ANTHROPIC_API_KEY não configurada" if not _ANTHROPIC_API_KEY else "Erro ao chamar Claude API"
        raise HTTPException(code, msg)
    return {"ok": True, **result}


@router.post("/ai/cidades-cluster")
async def ai_cidades_cluster(request: Request):
    from cabonnet.ai import _ai_cidades_cluster
    body = await request.json()
    result = _ai_cidades_cluster(body)
    if result is None:
        code = 503 if not _ANTHROPIC_API_KEY else 502
        msg = "ANTHROPIC_API_KEY não configurada" if not _ANTHROPIC_API_KEY else "Erro ao chamar Claude API"
        raise HTTPException(code, msg)
    return {"ok": True, **result}


@router.post("/ai/produtividade-analise")
async def ai_produtividade_analise(request: Request):
    from cabonnet.ai import _ai_produtividade_analise
    body = await request.json()
    result = _ai_produtividade_analise(body)
    if result is None:
        code = 503 if not _ANTHROPIC_API_KEY else 502
        msg = "ANTHROPIC_API_KEY não configurada" if not _ANTHROPIC_API_KEY else "Erro ao chamar Claude API"
        raise HTTPException(code, msg)
    return {"ok": True, **result}


@router.post("/ai/juniper-correlacao")
async def ai_juniper_correlacao(request: Request):
    from cabonnet.ai import _ai_juniper_correlacao
    body = await request.json()
    result = _ai_juniper_correlacao(body)
    if result is None:
        code = 503 if not _ANTHROPIC_API_KEY else 502
        msg = "ANTHROPIC_API_KEY não configurada" if not _ANTHROPIC_API_KEY else "Erro ao chamar Claude API"
        raise HTTPException(code, msg)
    return {"ok": True, **result}


@router.post("/ai/chat")
async def ai_chat(request: Request, _role: str = Depends(_require_auth)):
    from cabonnet.ai import _ai_chat_with_tools
    body     = await request.json()
    messages = body.get("messages", [])
    if not messages:
        raise HTTPException(400, "messages não pode ser vazio")
    loop   = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _ai_chat_with_tools, messages)
    if result is None:
        code = 503 if not _ANTHROPIC_API_KEY else 502
        msg  = "ANTHROPIC_API_KEY não configurada" if not _ANTHROPIC_API_KEY else "Erro ao chamar Claude API"
        raise HTTPException(code, msg)
    return {"ok": True, **result}


# ── Grafana / Zabbix ──────────────────────────────────────────────────────────

@router.get("/ai/status")
async def ai_status_endpoint():
    from cabonnet.ai import ai_status
    return ai_status()


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
