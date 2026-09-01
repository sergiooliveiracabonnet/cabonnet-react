# -*- coding: utf-8 -*-
"""
Testes dos endpoints de gestão de usuários (/api/usuarios*) — gestor-only,
exceto trocar a própria senha.

Nota: estes testes criam linhas de verdade na tabela `usuarios` do banco real
usado pela sessão de testes (mesmo padrão de conftest.py — a suíte já toca o
SQLite real pra cache/histórico). Por isso todo usuário criado usa
`_usuario_ctx`, que limpa via `finally` mesmo se o teste falhar no meio —
sem isso, uma falha deixa lixo que quebra a reexecução seguinte (username é
UNIQUE).
"""

import sqlite3
from contextlib import contextmanager
from unittest.mock import patch

import pytest

from cabonnet import db


def _login(client, username, password):
    with patch("cabonnet.app._auth_enabled", return_value=True):
        r = client.post("/api/login", json={"username": username, "password": password})
    assert r.status_code == 200
    token = r.headers["set-cookie"].split("cbn_session=", 1)[1].split(";", 1)[0]
    return {"Cookie": f"cbn_session={token}"}


def _delete_usuario(username):
    with db.state._db_lock:
        con = sqlite3.connect(db._DB_PATH)
        con.execute("DELETE FROM usuarios WHERE username=?", (username,))
        con.commit()
        con.close()


@contextmanager
def _usuario_ctx(username, password, role):
    """Cria um usuário e garante a remoção ao sair do bloco, mesmo se o
    teste levantar uma exceção/assert no meio."""
    db._db_create_usuario(username, db._hash_password(password), role)
    try:
        yield
    finally:
        _delete_usuario(username)


@pytest.fixture
def gestor(client):
    """Um usuário gestor autenticado, pra chamar os endpoints admin."""
    with _usuario_ctx("gestor_teste", "senhaGestor1", "gestor"):
        yield _login(client, "gestor_teste", "senhaGestor1")


@pytest.fixture
def operador(client):
    with _usuario_ctx("operador_teste", "senhaOper1", "operador"):
        yield _login(client, "operador_teste", "senhaOper1")


def test_list_usuarios_requires_gestor(client, operador):
    with patch("cabonnet.app._auth_enabled", return_value=True):
        r = client.get("/api/usuarios", headers=operador)
    assert r.status_code == 403


def test_create_and_list_usuario(client, gestor):
    try:
        with patch("cabonnet.app._auth_enabled", return_value=True):
            create = client.post("/api/usuarios", headers=gestor,
                                  json={"username": "novo_user", "password": "senha123", "role": "viewer"})
            assert create.status_code == 200

            r = client.get("/api/usuarios", headers=gestor)
        assert r.status_code == 200
        items = r.json()["items"]
        assert any(i["username"] == "novo_user" and i["role"] == "viewer" for i in items)
    finally:
        _delete_usuario("novo_user")


def test_create_duplicate_username_returns_409(client, gestor):
    try:
        with patch("cabonnet.app._auth_enabled", return_value=True):
            client.post("/api/usuarios", headers=gestor,
                         json={"username": "dup_user", "password": "senha123", "role": "viewer"})
            r = client.post("/api/usuarios", headers=gestor,
                             json={"username": "dup_user", "password": "outrasenha", "role": "viewer"})
        assert r.status_code == 409
    finally:
        _delete_usuario("dup_user")


def test_create_short_password_returns_400(client, gestor):
    with patch("cabonnet.app._auth_enabled", return_value=True):
        r = client.post("/api/usuarios", headers=gestor,
                         json={"username": "curta", "password": "123", "role": "viewer"})
    assert r.status_code == 400


def test_create_invalid_role_returns_400(client, gestor):
    with patch("cabonnet.app._auth_enabled", return_value=True):
        r = client.post("/api/usuarios", headers=gestor,
                         json={"username": "papel_invalido", "password": "senha123", "role": "superuser"})
    assert r.status_code == 400


def test_cannot_deactivate_last_active_gestor(client, gestor):
    """Isola o guard via patch em vez de depender da contagem real de
    gestores ativos no banco (o bootstrap 'admin' também é um gestor ativo
    na mesma base — contar de verdade tornaria este teste dependente de
    estado incidental de outros usuários)."""
    user = db._db_get_usuario_by_username("gestor_teste")
    with (
        patch("cabonnet.app._auth_enabled", return_value=True),
        patch("cabonnet.app._db_count_ativos_por_role", return_value=1),
    ):
        r = client.put(f"/api/usuarios/{user['id']}", headers=gestor, json={"ativo": False})
    assert r.status_code == 409


def test_can_deactivate_gestor_when_another_gestor_active(client, gestor):
    user = db._db_get_usuario_by_username("gestor_teste")
    with (
        patch("cabonnet.app._auth_enabled", return_value=True),
        patch("cabonnet.app._db_count_ativos_por_role", return_value=2),
    ):
        r = client.put(f"/api/usuarios/{user['id']}", headers=gestor, json={"ativo": False})
    assert r.status_code == 200


def test_reset_password_by_gestor(client, gestor):
    try:
        with _usuario_ctx("resetavel", "senhaAntiga1", "viewer"):
            uid = db._db_get_usuario_by_username("resetavel")["id"]
            with patch("cabonnet.app._auth_enabled", return_value=True):
                r = client.post(f"/api/usuarios/{uid}/senha", headers=gestor, json={"password": "senhaNova12"})
            assert r.status_code == 200
            user = db._db_get_usuario_by_username("resetavel")
            assert db._verify_password("senhaNova12", user["senha_hash"]) is True
    finally:
        pass  # _usuario_ctx já limpou


def test_change_own_password_wrong_current_fails(client):
    with _usuario_ctx("dono_senha", "original123", "viewer"):
        headers = _login(client, "dono_senha", "original123")
        with patch("cabonnet.app._auth_enabled", return_value=True):
            r = client.post("/api/usuarios/me/senha", headers=headers,
                             json={"atual": "errada", "nova": "novaSenha12"})
        assert r.status_code == 403


def test_change_own_password_succeeds(client):
    with _usuario_ctx("dono_senha2", "original123", "viewer"):
        headers = _login(client, "dono_senha2", "original123")
        with patch("cabonnet.app._auth_enabled", return_value=True):
            r = client.post("/api/usuarios/me/senha", headers=headers,
                             json={"atual": "original123", "nova": "novaSenha12"})
        assert r.status_code == 200
        user = db._db_get_usuario_by_username("dono_senha2")
        assert db._verify_password("novaSenha12", user["senha_hash"]) is True
