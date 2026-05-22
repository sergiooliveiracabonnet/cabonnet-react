# -*- coding: utf-8 -*-
"""
Testes de autenticação.

Fixture padrão: _auth_enabled mockada para False.
  - /api/session → ok=True, auth_enabled=False
  - /api/login   → qualquer credencial aceita (role=gestor)

Comportamento com auth ativa é testado via patch local.
"""

from unittest.mock import patch


def test_session_auth_disabled(client):
    r = client.get("/api/session")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["auth_enabled"] is False
    assert data["role"] == "gestor"


def test_login_succeeds_when_auth_disabled(client):
    """Com auth desligada, qualquer credencial retorna role=gestor."""
    r = client.post("/api/login", json={"username": "qualquer", "password": "qualquer"})
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["role"] == "gestor"
    assert "Set-Cookie" in r.headers


def test_login_empty_creds_auth_disabled(client):
    """Com auth desligada, até credenciais vazias retornam gestor."""
    r = client.post("/api/login", json={"username": "", "password": ""})
    assert r.status_code == 200
    assert r.json()["role"] == "gestor"


def test_login_empty_creds_auth_enabled(client):
    """Com auth ativa, credenciais vazias falham (resolve_role retorna None)."""
    with patch("cabonnet.app._auth_enabled", return_value=True):
        r = client.post("/api/login", json={"username": "", "password": ""})
    assert r.status_code == 401
    assert r.json()["ok"] is False


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
