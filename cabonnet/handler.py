# -*- coding: utf-8 -*-
"""
cabonnet/handler.py — HTTP Handler principal (port 5000).
"""

import base64 as _base64
import json
import logging
import os
import queue as _queue
import threading
import time as _time_mod
from datetime import datetime, date
from urllib.parse import urlparse, parse_qs

import requests

from cabonnet.config import (
    CONFIG, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
    TELEGRAM_CHAT_INSTACABLE, TELEGRAM_CHAT_WES,
    TELEGRAM_CHAT_ALERTAS, TELEGRAM_CHAT_REDE,
    TELEGRAM_CHAT_OPERACIONAL_THM,
    MONITOR_CONFIG, IMANAGER_CONFIG,
    JUN_HIST_FILE, _SCRIPT_DIR_ENV,
    PORT,
)
from cabonnet.config import SESSION_DURATION
from cabonnet.config import _load_env
from cabonnet.config import _ATE_CACHE_TTL
from cabonnet.grafana import (
    grafana_post, frames_to_csv, frames_to_dict_list,
    build_atendimento_json,
    SQL_PENDENTE, SQL_AGENDADO, SQL_FUTURO, SQL_REVISITAS,
    SQL_DETALHES_TEMPLATE, SQL_OCORRENCIAS_TEMPLATE,
    SQL_EQUIPE_REAGENDOU_TEMPLATE,
    SQL_MATERIAIS_UTILIZADOS_TEMPLATE, SQL_MATERIAIS_RETIRADOS_TEMPLATE,
    SQL_ATENDIMENTO, SQL_ERP_OS_TOTAIS, SQL_ERP_OS_CIDADES,
)
from cabonnet import state
from cabonnet.utils import ThreadingHTTPServer, parse_date_param
from cabonnet.db import _db_save_cache, _db_load_cache
from cabonnet.cache import _dados_cache_update
from cabonnet.auth import (
    _auth_enabled, _hash_pass,
    _check_auth, _create_session, _delete_session,
    _get_session_role, _require_gestor,
)
from cabonnet.config import LOGIN_USER, LOGIN_PASS, _resolve_role
from cabonnet.telegram import _telegram_enabled, _telegram_send, _telegram_send_document
from cabonnet.zabbix import (
    zabbix_get_problems, zabbix_discover, zabbix_get_pppoe_vlans,
    zabbix_get_mttr, zabbix_get_cidades, zabbix_get_top_equipamentos,
    zabbix_get_olt, zabbix_get_infra, zabbix_get_assinantes, _map_problems,
)
from cabonnet.juniper import juniper_fetch, _jun_notify_new_clients
from cabonnet.ai import _ai_narrative, _ai_revisitas
from cabonnet.builders import _build_status_text

log    = logging.getLogger("CaboNetServer")
log_db = logging.getLogger("CaboNetServer.DB")

try:
    ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
except Exception:
    ANTHROPIC_API_KEY = ""


class Handler:
    # Handler is BaseHTTPRequestHandler subclass — defined in server startup
    pass


from http.server import BaseHTTPRequestHandler


class Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        log.info(fmt, *args)

    def send_cors(self):
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _needs_setup(self):
        return not CONFIG.get("username") or not CONFIG.get("password")

    def _serve_file(self, filepath, content_type="text/html"):
        try:
            with open(filepath, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type + "; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except FileNotFoundError:
            self._error(404, "Arquivo nao encontrado: " + filepath)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors()
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        path   = parsed.path

        if path == "/login":
            try:
                length = int(self.headers.get("Content-Length", 0))
                raw    = self.rfile.read(length).decode("utf-8")
                from urllib.parse import parse_qs as _pqs
                body   = _pqs(raw)
                user   = body.get("username", [""])[0].strip()
                pwd    = body.get("password", [""])[0]
                role   = _resolve_role(user, pwd)
                if role:
                    token = _create_session(role)
                    log.info("[Auth] Login OK — usuario: %s role: %s", user, role)
                    self.send_response(302)
                    self.send_header("Set-Cookie", f"cbn_session={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_DURATION}")
                    self.send_header("Location", "/dashboard")
                    self.end_headers()
                else:
                    log.warning("[Auth] Login FALHOU — usuario: %s", user)
                    self.send_response(302)
                    self.send_header("Location", "/login?error=1")
                    self.end_headers()
            except Exception:
                log.exception("Erro /login")
                self.send_response(302)
                self.send_header("Location", "/login?error=1")
                self.end_headers()
            return

        if path == "/api/login":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body   = json.loads(self.rfile.read(length).decode("utf-8"))
                user   = (body.get("username") or "").strip()
                pwd    = (body.get("password") or "")
                role = _resolve_role(user, pwd) if _auth_enabled() else "gestor"
                if role:
                    token = _create_session(role)
                    log.info("[Auth] Login React OK — usuario: %s role: %s", user, role)
                    resp  = json.dumps({"ok": True, "role": role}).encode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type",   "application/json; charset=utf-8")
                    self.send_header("Content-Length", str(len(resp)))
                    self.send_header("Set-Cookie", f"cbn_session={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_DURATION}")
                    self.end_headers()
                    self.wfile.write(resp)
                else:
                    log.warning("[Auth] Login React FALHOU — usuario: %s", user)
                    self._json(401, {"ok": False, "error": "Credenciais inválidas"})
            except Exception:
                log.exception("Erro /api/login")
                self._error(500, "Erro interno")
            return

        if path == "/setup":
            if _auth_enabled() and not _require_gestor(self): return
            try:
                length = int(self.headers.get("Content-Length", 0))
                body   = json.loads(self.rfile.read(length).decode("utf-8"))
                required = ["GRAFANA_USER", "GRAFANA_PASS"]
                for key in required:
                    if not body.get(key, "").strip():
                        self._json(400, {"ok": False, "error": "Campo obrigatorio: " + key})
                        return
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
                self._json(200, {"ok": True})
            except Exception as ex:
                log.exception("Erro /setup")
                self._json(500, {"ok": False, "error": str(ex)})
            return

        if path == "/notify/telegram":
            if not _telegram_enabled():
                self._json(503, {"ok": False, "error": "Telegram não configurado"})
                return
            try:
                length = int(self.headers.get("Content-Length", 0))
                body   = json.loads(self.rfile.read(length).decode("utf-8"))
                text   = (body.get("text") or "").strip()
                if not text:
                    self._json(400, {"ok": False, "error": "Campo 'text' obrigatório"})
                    return
                _CHAT_MAP = {
                    "alertas": TELEGRAM_CHAT_ALERTAS, "produtividade": TELEGRAM_CHAT_ID,
                    "instacable": TELEGRAM_CHAT_INSTACABLE, "wes": TELEGRAM_CHAT_WES,
                    "rede": TELEGRAM_CHAT_REDE, "thm": TELEGRAM_CHAT_OPERACIONAL_THM,
                }
                chat_key         = (body.get("chat") or "").strip().lower()
                chat_id_override = _CHAT_MAP.get(chat_key) or None
                ok = _telegram_send(text, chat_id_override=chat_id_override)
                self._json(200 if ok else 502, {"ok": ok})
            except Exception as ex:
                log.exception("Erro /notify/telegram")
                self._json(500, {"ok": False, "error": str(ex)})
            return

        if path == "/notify/telegram/status_now":
            if not _telegram_enabled():
                self._json(503, {"ok": False, "error": "Telegram não configurado"})
                return
            threading.Thread(target=lambda: _telegram_send(_build_status_text()), daemon=True).start()
            self._json(200, {"ok": True})
            return

        if path == "/notify/telegram/pdf":
            if not _telegram_enabled():
                self._json(503, {"ok": False, "error": "Telegram não configurado"})
                return
            try:
                length   = int(self.headers.get("Content-Length", 0))
                body     = json.loads(self.rfile.read(length).decode("utf-8"))
                data_uri = body.get("pdf", "")
                filename  = body.get("filename") or ("relatorio-cabonnet-" + datetime.now().strftime("%Y-%m-%d") + ".pdf")
                if ";base64," not in data_uri:
                    self._json(400, {"ok": False, "error": "Formato inválido"}); return
                pdf_bytes        = _base64.b64decode(data_uri.split(";base64,", 1)[1])
                chat_id_override = body.get("chat_id") or None
                ok = _telegram_send_document(pdf_bytes, filename, caption="📋 <b>Relatório de Fechamento</b>", chat_id_override=chat_id_override)
                self._json(200 if ok else 502, {"ok": ok})
            except Exception as ex:
                log.exception("Erro /notify/telegram/pdf")
                self._json(500, {"ok": False, "error": str(ex)})
            return

        if path == "/notify/telegram/photo":
            if not _telegram_enabled():
                self._json(503, {"ok": False, "error": "Telegram não configurado"})
                return
            try:
                length   = int(self.headers.get("Content-Length", 0))
                body     = json.loads(self.rfile.read(length).decode("utf-8"))
                data_uri = body.get("photo", "")
                caption  = body.get("caption", "")
                chat_key = (body.get("chat") or "").strip().lower()
                _CHAT_MAP = {
                    "alertas": TELEGRAM_CHAT_ALERTAS, "produtividade": TELEGRAM_CHAT_ID,
                    "instacable": TELEGRAM_CHAT_INSTACABLE, "wes": TELEGRAM_CHAT_WES,
                    "rede": TELEGRAM_CHAT_REDE, "thm": TELEGRAM_CHAT_OPERACIONAL_THM,
                }
                chat_id     = _CHAT_MAP.get(chat_key) or TELEGRAM_CHAT_ID
                if ";base64," not in data_uri:
                    self._json(400, {"ok": False, "error": "Formato inválido"}); return
                img_bytes   = _base64.b64decode(data_uri.split(";base64,", 1)[1])
                as_document = bool(body.get("as_document", False))
                if as_document:
                    url  = "https://api.telegram.org/bot{}/sendDocument".format(TELEGRAM_BOT_TOKEN)
                    resp = requests.post(url, data={"chat_id": chat_id, "caption": caption, "parse_mode": "HTML"},
                                         files={"document": ("relatorio-cabonnet.png", img_bytes, "image/png")}, timeout=30)
                else:
                    url  = "https://api.telegram.org/bot{}/sendPhoto".format(TELEGRAM_BOT_TOKEN)
                    resp = requests.post(url, data={"chat_id": chat_id, "caption": caption, "parse_mode": "HTML"},
                                         files={"photo": ("relatorio.png", img_bytes, "image/png")}, timeout=30)
                ok = resp.ok
                if ok: log.info("[Telegram] %s enviado — %d bytes", "Documento" if as_document else "Foto", len(img_bytes))
                else:  log.warning("[Telegram] Falha ao enviar: %s", resp.text[:200])
                self._json(200 if ok else 502, {"ok": ok})
            except Exception as ex:
                log.exception("Erro /notify/telegram/photo")
                self._json(500, {"ok": False, "error": str(ex)})
            return

        if path == "/juniper/historico":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body   = json.loads(self.rfile.read(length).decode("utf-8"))
                with open(JUN_HIST_FILE, "w", encoding="utf-8") as f:
                    json.dump(body, f, ensure_ascii=False)
                self._json(200, {"ok": True})
            except Exception as ex:
                log.exception("Erro salvando jun_historico.json")
                self._json(500, {"ok": False, "error": str(ex)})
            return

        if path == "/ai/revisitas":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body   = json.loads(self.rfile.read(length).decode("utf-8"))
                result = _ai_revisitas(body)
                if result is None:
                    if not ANTHROPIC_API_KEY:
                        self._json(503, {"ok": False, "error": "ANTHROPIC_API_KEY não configurada no .env"})
                    else:
                        self._json(502, {"ok": False, "error": "Erro ao chamar Claude API"})
                else:
                    self._json(200, {"ok": True, **result})
            except Exception as ex:
                log.exception("Erro /ai/revisitas")
                self._json(500, {"ok": False, "error": str(ex)})
            return

        if path == "/ai/narrative":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body   = json.loads(self.rfile.read(length).decode("utf-8"))
                result = _ai_narrative(body)
                if result is None:
                    if not ANTHROPIC_API_KEY:
                        self._json(503, {"ok": False, "error": "ANTHROPIC_API_KEY não configurada no .env"})
                    else:
                        self._json(502, {"ok": False, "error": "Erro ao chamar Claude API"})
                else:
                    self._json(200, {"ok": True, **result})
            except Exception as ex:
                log.exception("Erro /ai/narrative")
                self._json(500, {"ok": False, "error": str(ex)})
            return

        self._error(405, "Metodo nao permitido")

    def do_GET(self):
        parsed = urlparse(self.path)
        path   = parsed.path
        params = parse_qs(parsed.query)

        if path == "/":
            if self._needs_setup():
                self._serve_file(os.path.join(_SCRIPT_DIR_ENV, "..", "html", "setup.html"))
            elif _auth_enabled() and not _check_auth(self):
                self.send_response(302); self.send_header("Location", "/login"); self.end_headers()
            else:
                self.send_response(302); self.send_header("Location", "/dashboard"); self.end_headers()
            return

        if path == "/login":
            self._serve_file(os.path.join(_SCRIPT_DIR_ENV, "..", "html", "login.html")); return
        if path == "/logout":
            _delete_session(self)
            self.send_response(302)
            self.send_header("Set-Cookie", "cbn_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0")
            self.send_header("Location", "/login"); self.end_headers()
            log.info("[Auth] Logout"); return
        if path == "/setup":
            self._serve_file(os.path.join(_SCRIPT_DIR_ENV, "..", "html", "setup.html")); return
        if path == "/dashboard":
            if _auth_enabled() and not _check_auth(self):
                self.send_response(302); self.send_header("Location", "/login"); self.end_headers(); return
            self._serve_file(os.path.join(_SCRIPT_DIR_ENV, "..", "Dashboard.html")); return

        if path == "/notify/telegram/status":
            with state._dados_cache_lock: cache_ts = state._dados_cache["ts"]
            self._json(200, {"enabled": _telegram_enabled(), "chat_id": TELEGRAM_CHAT_ID if _telegram_enabled() else "",
                             "cache_ts": cache_ts, "cache_rows": len(state._dados_cache["agendado"]) if _telegram_enabled() else 0})
            return

        if path == "/health":
            self._json(200, {"status": "ok", "date": date.today().isoformat(), "version": "2026.7", "porta": PORT}); return

        if path == "/pendente":  self._serve_csv(SQL_PENDENTE,  "PENDENTE");  return
        if path == "/agendado":  self._serve_csv(SQL_AGENDADO,  "AGENDADO");  return
        if path == "/futuro":    self._serve_csv(SQL_FUTURO,    "FUTURO");    return

        if path == "/detalhes":
            numos_raw = params.get("numos", [""])[0].strip()
            if not numos_raw or not numos_raw.isdigit():
                self._error(400, "Parâmetro 'numos' inválido."); return
            numos_int = int(numos_raw)
            try:
                rows = frames_to_dict_list(grafana_post(SQL_DETALHES_TEMPLATE.format(numos=numos_int)))
                if not rows: self._error(404, f"OS {numos_raw} não encontrada."); return
                os_data = rows[0]
                dt_atend = os_data.get("dataatendimento", ""); dt_agend = os_data.get("dataagendamento", "")
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
                self._json(200, {"os": os_data, "reagendada": reagendada, "equipe_reagendou": equipe_reagendou,
                                  "ocorrencias": ocorrencias, "materiais_utilizados": materiais_utilizados,
                                  "materiais_retirados": materiais_retirados})
            except Exception as ex:
                log.exception("Erro /detalhes numos=%s", numos_raw); self._error(502, str(ex))
            return

        if path == "/query":
            if _auth_enabled() and not _check_auth(self):
                self._json(401, {"error": "Não autenticado"}); return
            raw = params.get("date", ["hoje"])[0]
            try: data_iso = parse_date_param(raw)
            except ValueError as ex: self._error(400, str(ex)); return
            try:
                log.info("  -> Pendentes...")
                csv_p = frames_to_csv(grafana_post(SQL_PENDENTE)); n_p = len(csv_p.splitlines()) - 1 if csv_p else 0
                log.info("  -> Agendados...")
                csv_a = frames_to_csv(grafana_post(SQL_AGENDADO)); n_a = len(csv_a.splitlines()) - 1 if csv_a else 0
                log.info("  -> Futuros...")
                csv_f = frames_to_csv(grafana_post(SQL_FUTURO));   n_f = len(csv_f.splitlines()) - 1 if csv_f else 0
                ts_now = _time_mod.time()
                with state._query_cache_lock:
                    state._query_cache.update({"pendente": csv_p or "", "agendado": csv_a or "", "futuro": csv_f or "", "ts": ts_now})
                for chave, csv_val in [("pendente", csv_p), ("agendado", csv_a), ("futuro", csv_f)]:
                    if csv_val:
                        threading.Thread(target=_db_save_cache, args=(chave, csv_val, ts_now), daemon=True).start()
                threading.Thread(target=_dados_cache_update, args=(csv_p or "", csv_a or "", csv_f or ""), daemon=True).start()
                # Nota: NÃO fazemos SSE broadcast aqui para evitar loop de feedback
                # (React /query → SSE → invalidate → /query → loop infinito).
                # O broadcast 'os-status-changed' ocorre APENAS em _dados_cache_update
                # quando mudanças reais de status são detectadas (evento externo).
                self._json(200, {"pendente": csv_p or "", "agendado": csv_a or "", "futuro": csv_f or "",
                                  "n_pendente": n_p, "n_agendado": n_a, "n_futuro": n_f, "date": data_iso})
            except Exception as ex:
                with state._query_cache_lock:
                    cached_ts = state._query_cache["ts"]
                    if cached_ts > 0:
                        cache_age = int((_time_mod.time() - cached_ts) / 60)
                        log.warning("[/query] Grafana indisponível — cache de %d min atrás", cache_age)
                        self._json(200, {"pendente": state._query_cache["pendente"], "agendado": state._query_cache["agendado"],
                                         "futuro": state._query_cache["futuro"],
                                         "n_pendente": len(state._query_cache["pendente"].splitlines()) - 1 if state._query_cache["pendente"] else 0,
                                         "n_agendado": len(state._query_cache["agendado"].splitlines()) - 1 if state._query_cache["agendado"] else 0,
                                         "n_futuro":   len(state._query_cache["futuro"].splitlines())   - 1 if state._query_cache["futuro"] else 0,
                                         "date": data_iso, "cached": True, "cache_age_min": cache_age})
                        return
                csv_a_db, ts_db = _db_load_cache("agendado")
                if csv_a_db:
                    csv_p_db, _ = _db_load_cache("pendente"); csv_f_db, _ = _db_load_cache("futuro")
                    cache_age   = int((_time_mod.time() - ts_db) / 60) if ts_db else -1
                    log.warning("[/query] Servindo cache SQLite de %d min atrás", cache_age)
                    self._json(200, {"pendente": csv_p_db, "agendado": csv_a_db, "futuro": csv_f_db or "",
                                     "n_pendente": len(csv_p_db.splitlines()) - 1 if csv_p_db else 0,
                                     "n_agendado": len(csv_a_db.splitlines()) - 1,
                                     "n_futuro":   len(csv_f_db.splitlines()) - 1 if csv_f_db else 0,
                                     "date": data_iso, "cached": True, "cached_source": "sqlite", "cache_age_min": cache_age})
                    return
                log.exception("Erro /query"); self._error(502, str(ex))
            return

        if path == "/revisitas":
            if _auth_enabled() and not _check_auth(self):
                self._json(401, {"error": "Não autenticado"}); return
            try:
                csv_r = frames_to_csv(grafana_post(SQL_REVISITAS))
                n_r   = len(csv_r.splitlines()) - 1 if csv_r else 0
                self._json(200, {"concluidas": csv_r or "", "n": n_r})
            except Exception as ex:
                log.exception("Erro /revisitas"); self._error(502, str(ex))
            return

        if path == "/atendimento":
            try:
                now = _time_mod.time()
                with state._ate_cache_lock:
                    cache_stale = state._ate_cache["data"] is None or (now - state._ate_cache["ts"]) > _ATE_CACHE_TTL
                if cache_stale:
                    raw    = frames_to_dict_list(grafana_post(SQL_ATENDIMENTO))
                    result = build_atendimento_json(raw)
                    if result:
                        with state._ate_cache_lock:
                            state._ate_cache["data"] = result; state._ate_cache["ts"] = now
                    else:
                        self._error(502, "Sem dados de atendimento"); return
                with state._ate_cache_lock:
                    cache_data = state._ate_cache["data"]
                self._json(200, cache_data)
            except Exception as ex:
                log.exception("Erro /atendimento"); self._error(502, str(ex))
            return

        if path == "/juniper":
            cluster = params.get("cluster", [MONITOR_CONFIG["cluster_default"]])[0]
            try:
                result  = juniper_fetch(cluster)
                clientes = result.get("clientes") or []
                with state._jun_known_lock:
                    primeira_poll = cluster not in state._jun_initialized
                    conhecidos    = state._jun_known.get(cluster, set())
                    novos = [] if primeira_poll else [c for c in clientes if c.get("user_name") and c["user_name"] not in conhecidos]
                    state._jun_known[cluster]    = {c["user_name"] for c in clientes if c.get("user_name")}
                    state._jun_initialized.add(cluster)
                if novos:
                    threading.Thread(target=_jun_notify_new_clients, args=(novos, cluster, result.get("ultima_coleta", "")), daemon=True).start()
                self._json(200, result)
            except Exception as ex:
                log.exception("Erro /juniper"); self._error(502, "Juniper fetch error: " + str(ex))
            return

        if path == "/juniper/historico":
            try:
                if os.path.exists(JUN_HIST_FILE):
                    with open(JUN_HIST_FILE, "r", encoding="utf-8") as f: data = json.load(f)
                else:
                    data = {"historico": [], "snapshots": {}}
                self._json(200, data)
            except Exception:
                log.exception("Erro lendo jun_historico.json")
                self._json(200, {"historico": [], "snapshots": {}})
            return

        # GET /api/sla-limits — retorna limites padrão do Python para sync com React
        if path == "/api/sla-limits":
            from cabonnet.cache import _sla_limite as _sl
            from cabonnet.config import _SLA_LIMITS
            self._json(200, {"ok": True, "limits": _SLA_LIMITS})
            return

        if path == "/api/session":
            role = _get_session_role(self) if _auth_enabled() else "gestor"
            ok   = not _auth_enabled() or role is not None
            self._json(200, {"ok": ok, "auth_enabled": _auth_enabled(), "role": role or "viewer"})
            return

        if path == "/api/logout":
            _delete_session(self)
            resp = json.dumps({"ok": True}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type",   "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(resp)))
            self.send_header("Set-Cookie", "cbn_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0")
            self.end_headers(); self.wfile.write(resp)
            log.info("[Auth] Logout React"); return

        if path == "/grafana/os-totais":
            try:
                rows = frames_to_dict_list(grafana_post(SQL_ERP_OS_TOTAIS))
                self._json(200, {"ok": True, "data": rows[0] if rows else {}})
            except Exception as exc: self._json(502, {"ok": False, "error": str(exc)})
            return

        if path == "/grafana/os-cidades":
            try: self._json(200, {"ok": True, "data": frames_to_dict_list(grafana_post(SQL_ERP_OS_CIDADES))})
            except Exception as exc: self._json(502, {"ok": False, "error": str(exc)})
            return

        if path == "/grafana/incidentes":
            try: self._json(200, {"ok": True, "data": _map_problems(zabbix_get_problems())})
            except Exception as exc: self._json(502, {"ok": False, "error": str(exc)})
            return

        _ZABBIX_ROUTES = {
            "/grafana/zabbix/discover":          zabbix_discover,
            "/grafana/zabbix/pppoe":             zabbix_get_pppoe_vlans,
            "/grafana/zabbix/mttr":              zabbix_get_mttr,
            "/grafana/zabbix/cidades":           zabbix_get_cidades,
            "/grafana/zabbix/top-equipamentos":  zabbix_get_top_equipamentos,
            "/grafana/zabbix/olt":               zabbix_get_olt,
            "/grafana/zabbix/infra":             zabbix_get_infra,
            "/grafana/zabbix/assinantes":        zabbix_get_assinantes,
        }
        if path in _ZABBIX_ROUTES:
            try: self._json(200, {"ok": True, "data": _ZABBIX_ROUTES[path]()})
            except Exception as exc: self._json(502, {"ok": False, "error": str(exc)})
            return

        # GET /events — Server-Sent Events: push de mudanças de status em tempo real
        if path == "/events":
            self.send_response(200)
            self.send_header("Content-Type",      "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control",     "no-cache")
            self.send_header("Connection",        "keep-alive")
            self.send_header("X-Accel-Buffering", "no")
            self.send_cors()
            self.end_headers()
            q = _queue.Queue()
            with state._sse_clients_lock:
                state._sse_clients.append(q)
            try:
                while True:
                    try:
                        msg = q.get(timeout=25)
                        self.wfile.write(msg)
                        self.wfile.flush()
                    except _queue.Empty:
                        # heartbeat para manter a conexão viva
                        self.wfile.write(b": keepalive\n\n")
                        self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass
            finally:
                with state._sse_clients_lock:
                    if q in state._sse_clients:
                        state._sse_clients.remove(q)
            return

        static_dirs = ("js", "css", "html")
        parts = path.lstrip("/").split("/")
        if len(parts) >= 2 and parts[0] in static_dirs:
            static_path = os.path.join(_SCRIPT_DIR_ENV, "..", *parts)
            ext  = parts[-1].rsplit(".", 1)[-1].lower() if "." in parts[-1] else ""
            mime = {"js": "application/javascript", "css": "text/css",
                    "json": "application/json", "html": "text/html"}.get(ext, "text/plain")
            self._serve_file(static_path, mime); return

        self._error(404, "Rota não encontrada")

    def _serve_csv(self, sql, label):
        try:
            log.info("  -> %s...", label)
            csv_txt = frames_to_csv(grafana_post(sql))
            if not csv_txt: raise ValueError(f"{label}: sem dados do Grafana.")
            n    = len(csv_txt.splitlines()) - 1
            body = csv_txt.encode("utf-8-sig")
            log.info("  OK %s: %d registros", label, n)
            self.send_response(200)
            self.send_header("Content-Type",   "text/csv; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_cors(); self.end_headers(); self.wfile.write(body)
        except Exception as ex:
            log.exception("Erro ao servir %s", label); self._error(502, str(ex))

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        try:
            self.send_response(code)
            self.send_header("Content-Type",   "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_cors(); self.end_headers(); self.wfile.write(body)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass

    def _error(self, code, msg):
        log.warning("HTTP %d: %s", code, msg)
        try: self._json(code, {"error": msg})
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError): pass
