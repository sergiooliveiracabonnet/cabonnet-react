# -*- coding: utf-8 -*-
"""
Testes de autenticação.

O fixture `client` (conftest.py) patcheia cabonnet.app._auth_enabled → False,
então _get_optional_role trata qualquer request como role=gestor sem precisar
de sessão real — é assim que test_query.py, test_health.py etc. funcionam sem
se preocupar com login. Aqui testamos especificamente o fluxo COM auth ativa,
usando um usuário semeado no banco real da sessão de testes.
"""

from unittest.mock import patch

import pytest

from cabonnet import db


@pytest.fixture
def usuario_teste():
    """Garante um usuário conhecido no banco (usa o mesmo _DB_PATH real da
    sessão de testes — cabonnet.app._auth_enabled é patcheada nos outros
    testes, então isso não afeta o resto da suíte)."""
    uid = db._db_create_usuario("teste_auth", db._hash_password("senha_correta"), "gestor")
    yield {"username": "teste_auth", "password": "senha_correta"}
    with db.state._db_lock:
        import sqlite3
        con = sqlite3.connect(db._DB_PATH)
        con.execute("DELETE FROM usuarios WHERE id=?", (uid,))
        con.commit()
        con.close()


def test_session_unauthenticated(client):
    with patch("cabonnet.app._auth_enabled", return_value=True):
        r = client.get("/api/session")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is False


def test_login_succeeds_with_valid_credentials(client, usuario_teste):
    with patch("cabonnet.app._auth_enabled", return_value=True):
        r = client.post("/api/login", json={
            "username": usuario_teste["username"],
            "password": usuario_teste["password"],
        })
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["role"] == "gestor"
    assert data["username"] == usuario_teste["username"]
    assert data["modulos"] == db.ALL_MODULOS
    assert "Set-Cookie" in r.headers


def test_login_fails_with_wrong_password(client, usuario_teste):
    with patch("cabonnet.app._auth_enabled", return_value=True):
        r = client.post("/api/login", json={
            "username": usuario_teste["username"],
            "password": "senha_errada",
        })
    assert r.status_code == 401
    assert r.json()["ok"] is False


def test_login_fails_for_deactivated_user(client, usuario_teste):
    user = db._db_get_usuario_by_username(usuario_teste["username"])
    db._db_update_usuario(user["id"], ativo=False)
    with patch("cabonnet.app._auth_enabled", return_value=True):
        r = client.post("/api/login", json={
            "username": usuario_teste["username"],
            "password": usuario_teste["password"],
        })
    assert r.status_code == 401


def test_login_empty_creds_fails(client):
    with patch("cabonnet.app._auth_enabled", return_value=True):
        r = client.post("/api/login", json={"username": "", "password": ""})
    assert r.status_code == 401
    assert r.json()["ok"] is False


def test_login_then_session_returns_modulos(client, usuario_teste):
    # O cookie de sessão é Secure por padrão (_COOKIE_SECURE) e o TestClient
    # usa http://testserver — o cookie jar do httpx descarta cookies Secure
    # fora de https, então extraímos o token do header bruto e reenviamos
    # manualmente em vez de depender do jar automático do client.
    with patch("cabonnet.app._auth_enabled", return_value=True):
        login = client.post("/api/login", json={
            "username": usuario_teste["username"],
            "password": usuario_teste["password"],
        })
        assert login.status_code == 200
        set_cookie = login.headers["set-cookie"]
        token = set_cookie.split("cbn_session=", 1)[1].split(";", 1)[0]
        r = client.get("/api/session", headers={"Cookie": f"cbn_session={token}"})
    data = r.json()
    assert data["ok"] is True
    assert data["role"] == "gestor"
    assert data["username"] == usuario_teste["username"]
    assert data["modulos"] == db.ALL_MODULOS


def test_logout_clears_cookie(client):
    r = client.get("/api/logout")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_sla_limits(client):
    r = client.get("/api/sla-limits")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    limits = data["limits"]
    assert "INSTALAC" in limits
    assert "MANUTENC" in limits
    assert isinstance(limits["INSTALAC"], int)
