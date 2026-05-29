# -*- coding: utf-8 -*-
"""
cabonnet/auth.py — Autenticação: sessões com role, login, logout.

Roles suportados: 'gestor' | 'operador' | 'viewer'
Configurados via .env (ver config.py → _resolve_role).
"""

import logging
import secrets
import time as _time_mod

from cabonnet.config import LOGIN_PASS, LOGIN_GESTOR_PASS, SESSION_DURATION
from cabonnet import state

log = logging.getLogger("CaboNetServer")


def _auth_enabled():
    """Retorna True se ao menos um par de credenciais está configurado."""
    return bool(LOGIN_PASS or LOGIN_GESTOR_PASS)


def _role_from_cookie(cookie_str: str | None) -> str | None:
    """Extrai a role da sessão do valor bruto do header Cookie.

    Retorna 'gestor' | 'operador' | 'viewer' ou None se a sessão for
    inválida, expirada ou ausente.
    """
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
                # Formato legado: sess = timestamp float
                if _time_mod.time() > sess:
                    with state._sessions_lock:
                        state._sessions.pop(token, None)
                    return None
                return "gestor"
    return None


def _create_session(role: str = "gestor") -> str:
    """Cria uma sessão persistida com role e retorna o token."""
    token = secrets.token_hex(32)
    with state._sessions_lock:
        state._sessions[token] = {
            "exp":  _time_mod.time() + SESSION_DURATION,
            "role": role,
        }
    return token
