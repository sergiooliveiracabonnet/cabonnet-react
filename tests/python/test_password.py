# -*- coding: utf-8 -*-
"""
Testes de hashing de senha e bootstrap do usuário admin — isolados, sem
tocar no banco real (usam um SQLite temporário via tmp_path + patch de
cabonnet.db._DB_PATH, que é onde a constante é efetivamente usada).
"""

import pytest
from unittest.mock import patch

from cabonnet import db


def test_hash_and_verify_roundtrip():
    stored = db._hash_password("minhaSenh@123")
    assert db._verify_password("minhaSenh@123", stored) is True


def test_verify_wrong_password_fails():
    stored = db._hash_password("correta")
    assert db._verify_password("errada", stored) is False


def test_hash_uses_random_salt():
    a = db._hash_password("mesmaSenha")
    b = db._hash_password("mesmaSenha")
    assert a != b  # salts diferentes → hashes diferentes mesmo com a mesma senha
    assert db._verify_password("mesmaSenha", a) is True
    assert db._verify_password("mesmaSenha", b) is True


def test_verify_malformed_hash_returns_false():
    assert db._verify_password("qualquer", "lixo-nao-e-um-hash-valido") is False
    assert db._verify_password("qualquer", "") is False


@pytest.fixture
def tmp_db(tmp_path):
    db_path = str(tmp_path / "cabonnet_test.db")
    with patch("cabonnet.db._DB_PATH", db_path):
        db._db_init()
        yield db_path


def test_bootstrap_creates_one_admin(tmp_db):
    senha = db._db_bootstrap_admin()
    assert senha is not None
    assert db._db_count_usuarios() == 1

    admin = db._db_get_usuario_by_username("admin")
    assert admin is not None
    assert admin["role"] == "gestor"
    assert admin["ativo"] is True
    assert db._verify_password(senha, admin["senha_hash"]) is True


def test_bootstrap_is_idempotent(tmp_db):
    first = db._db_bootstrap_admin()
    assert first is not None

    second = db._db_bootstrap_admin()
    assert second is None
    assert db._db_count_usuarios() == 1  # não duplicou


def test_bootstrap_seeds_default_permissions(tmp_db):
    db._db_bootstrap_admin()
    assert db._db_get_permissoes("gestor") == db.ALL_MODULOS
    assert set(db._db_get_permissoes("operador")) <= set(db.ALL_MODULOS)
    assert set(db._db_get_permissoes("viewer")) <= set(db.ALL_MODULOS)
    assert len(db._db_get_permissoes("operador")) > 0
