# -*- coding: utf-8 -*-
"""
cabonnet/auth.py — Autenticação: usuários no banco, sessões com role, login, logout.

Roles suportados: 'gestor' | 'operador' | 'viewer'
Usuários e senhas (hash) vivem na tabela `usuarios` (ver cabonnet/db.py) —
não há mais credenciais fixas via .env. O primeiro usuário ('admin'/gestor)
é criado automaticamente por db._db_bootstrap_admin() no startup.
"""

import logging
import secrets
import time as _time_mod

from cabonnet.config import SESSION_DURATION
from cabonnet import state, db

log = logging.getLogger("CaboNetServer")


def _auth_enabled():
    """Autenticação está sempre ativa a partir do momento em que existe pelo
    menos 1 usuário cadastrado — o que o bootstrap garante já no primeiro
    startup. Mantida como função (em vez de constante `True`) porque a
    suíte de testes patcheia isso pra rodar sem precisar de sessão real
    (ver tests/python/conftest.py)."""
    return db._db_count_usuarios() > 0


def _authenticate(username: str, password: str) -> dict | None:
    """Verifica usuário/senha contra o banco. Retorna {"id","username","role"}
    em caso de sucesso, ou None se credenciais inválidas ou usuário inativo."""
    username = (username or "").strip()
    if not username or not password:
        return None
    user = db._db_get_usuario_by_username(username)
    if not user or not user["ativo"]:
        return None
    if not db._verify_password(password, user["senha_hash"]):
        return None
    return {"id": user["id"], "username": user["username"], "role": user["role"]}


def _role_from_cookie(cookie_str: str | None) -> str | None:
    """Extrai a role da sessão do valor bruto do header Cookie.

    Retorna 'gestor' | 'operador' | 'viewer' ou None se a sessão for
    inválida, expirada ou ausente.
    """
    sess = _session_from_cookie(cookie_str)
    return sess["role"] if sess else None


def _session_from_cookie(cookie_str: str | None) -> dict | None:
    """Extrai a sessão completa ({"role","username"}) do header Cookie.
    Usado por endpoints que precisam saber QUEM está agindo (ex: trocar a
    própria senha), não só o papel."""
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
            if _time_mod.time() > sess.get("exp", 0):
                with state._sessions_lock:
                    state._sessions.pop(token, None)
                return None
            return {"role": sess.get("role", "gestor"), "username": sess.get("username")}
    return None


def _create_session(role: str = "gestor", username: str | None = None) -> str:
    """Cria uma sessão persistida com role (+ username, quando aplicável) e
    retorna o token. `username=None` é usado por sessões internas do sistema
    (ex: geração de PDF headless via Playwright em builders.py), que não
    correspondem a um usuário real."""
    token = secrets.token_hex(32)
    with state._sessions_lock:
        state._sessions[token] = {
            "exp":      _time_mod.time() + SESSION_DURATION,
            "role":     role,
            "username": username,
        }
    return token
