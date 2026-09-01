# -*- coding: utf-8 -*-
"""
Testes da camada db.py para usuarios/role_permissoes — CRUD puro, sem passar
pelos endpoints HTTP (isso é testado em test_usuarios.py/test_permissoes.py).
"""

import sqlite3

import pytest
from unittest.mock import patch

from cabonnet import db


@pytest.fixture
def tmp_db(tmp_path):
    db_path = str(tmp_path / "cabonnet_test.db")
    with patch("cabonnet.db._DB_PATH", db_path):
        db._db_init()
        yield db_path


def test_create_and_list_usuario(tmp_db):
    uid = db._db_create_usuario("joao", db._hash_password("senha123"), "operador")
    assert uid is not None

    items = db._db_list_usuarios()
    assert len(items) == 1
    assert items[0]["username"] == "joao"
    assert items[0]["role"] == "operador"
    assert items[0]["ativo"] is True
    assert "senha_hash" not in items[0]  # nunca vaza o hash na listagem


def test_create_duplicate_username_raises(tmp_db):
    db._db_create_usuario("joao", db._hash_password("a"), "operador")
    with pytest.raises(sqlite3.IntegrityError):
        db._db_create_usuario("joao", db._hash_password("b"), "viewer")


def test_create_duplicate_username_case_insensitive(tmp_db):
    db._db_create_usuario("Joao", db._hash_password("a"), "operador")
    with pytest.raises(sqlite3.IntegrityError):
        db._db_create_usuario("joao", db._hash_password("b"), "viewer")


def test_update_usuario_role_and_ativo(tmp_db):
    uid = db._db_create_usuario("maria", db._hash_password("x"), "viewer")
    updated = db._db_update_usuario(uid, role="operador", ativo=False)
    assert updated["role"] == "operador"
    assert updated["ativo"] is False


def test_username_immutable_via_update(tmp_db):
    # _db_update_usuario não aceita username — confirma que a assinatura
    # não permite renomear (username é a chave usada nas sessões em memória).
    import inspect
    params = inspect.signature(db._db_update_usuario).parameters
    assert "username" not in params


def test_set_password(tmp_db):
    uid = db._db_create_usuario("pedro", db._hash_password("antiga"), "viewer")
    ok = db._db_set_password(uid, db._hash_password("nova"))
    assert ok is True

    user = db._db_get_usuario_by_username("pedro")
    assert db._verify_password("nova", user["senha_hash"]) is True
    assert db._verify_password("antiga", user["senha_hash"]) is False


def test_count_ativos_por_role(tmp_db):
    db._db_create_usuario("g1", db._hash_password("a"), "gestor")
    uid2 = db._db_create_usuario("g2", db._hash_password("b"), "gestor")
    db._db_create_usuario("op", db._hash_password("c"), "operador")
    assert db._db_count_ativos_por_role("gestor") == 2

    db._db_update_usuario(uid2, ativo=False)
    assert db._db_count_ativos_por_role("gestor") == 1


def test_permissoes_gestor_is_fixed_and_not_editable(tmp_db):
    assert db._db_get_permissoes("gestor") == db.ALL_MODULOS
    with pytest.raises(ValueError):
        db._db_set_permissoes("gestor", ["dashboard"])


def test_permissoes_roundtrip_for_operador(tmp_db):
    db._db_set_permissoes("operador", ["dashboard", "ordens", "modulo-invalido"])
    got = db._db_get_permissoes("operador")
    assert set(got) == {"dashboard", "ordens"}  # módulo inválido é filtrado

    # Substituir a lista remove o que não está mais presente
    db._db_set_permissoes("operador", ["mapa"])
    assert db._db_get_permissoes("operador") == ["mapa"]


def test_permissoes_empty_role_returns_empty_list(tmp_db):
    assert db._db_get_permissoes("viewer") == []
