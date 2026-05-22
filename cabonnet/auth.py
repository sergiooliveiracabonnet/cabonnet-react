# -*- coding: utf-8 -*-
"""
cabonnet/auth.py — Autenticação: sessões com role, login, logout.

Roles suportados: 'gestor' | 'operador' | 'viewer'
Configurados via .env (ver config.py → _resolve_role).
"""

import hashlib
import logging
import secrets
import time as _time_mod

from cabonnet.config import LOGIN_USER, LOGIN_PASS, LOGIN_GESTOR_PASS, SESSION_DURATION
from cabonnet import state

log = logging.getLogger("CaboNetServer")


def _hash_pass(p):
    return hashlib.sha256(p.encode()).hexdigest()


def _auth_enabled():
    """Retorna True se ao menos um par de credenciais está configurado."""
    return bool(LOGIN_PASS or LOGIN_GESTOR_PASS)


def _check_auth(handler):
    """Retorna True se a requisição tem sessão válida (qualquer role)."""
    if not _auth_enabled():
        return True
    return _get_session_role(handler) is not None


def _get_session_role(handler):
    """Retorna a role da sessão atual ('gestor'|'operador'|'viewer') ou None."""
    cookie = handler.headers.get("Cookie", "")
    for part in cookie.split(";"):
        part = part.strip()
        if part.startswith("cbn_session="):
            token = part[len("cbn_session="):]
            with state._sessions_lock:
                sess = state._sessions.get(token)
            if not sess:
                return None
            # Suporte ao formato legado (float) e novo (dict)
            if isinstance(sess, dict):
                if _time_mod.time() > sess.get("exp", 0):
                    with state._sessions_lock:
                        state._sessions.pop(token, None)
                    return None
                return sess.get("role", "gestor")
            else:
                # Formato legado: sess = timestamp float
                if _time_mod.time() > sess:
                    with state._sessions_lock:
                        state._sessions.pop(token, None)
                    return None
                return "gestor"
    return None


def _require_gestor(handler):
    """Retorna True e envia 403 se o role não for 'gestor'."""
    role = _get_session_role(handler)
    if role != "gestor":
        import json
        body = json.dumps({"error": "Permissão negada — requer role gestor"}).encode()
        handler.send_response(403)
        handler.send_header("Content-Type",   "application/json; charset=utf-8")
        handler.send_header("Content-Length", str(len(body)))
        handler.send_cors()
        handler.end_headers()
        handler.wfile.write(body)
        return False
    return True


def _create_session(role="gestor"):
    """Cria uma sessão persistida com role e retorna o token."""
    token = secrets.token_hex(32)
    with state._sessions_lock:
        state._sessions[token] = {
            "exp":  _time_mod.time() + SESSION_DURATION,
            "role": role,
        }
    return token


def _delete_session(handler):
    """Remove a sessão do cookie atual."""
    cookie = handler.headers.get("Cookie", "")
    for part in cookie.split(";"):
        part = part.strip()
        if part.startswith("cbn_session="):
            token = part[len("cbn_session="):]
            with state._sessions_lock:
                state._sessions.pop(token, None)
            break
