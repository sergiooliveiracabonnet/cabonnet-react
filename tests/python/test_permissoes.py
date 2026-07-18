# -*- coding: utf-8 -*-
"""
Testes dos endpoints de permissões por papel (/api/permissoes*) e do guard
_require_modulo aplicado em endpoints reais (ex: /api/tecnicos → erp_ranking).
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
    db._db_create_usuario(username, db._hash_password(password), role)
    try:
        yield
    finally:
        _delete_usuario(username)


@pytest.fixture
def gestor(client):
    with _usuario_ctx("gestor_perm", "senhaGestor1", "gestor"):
        yield _login(client, "gestor_perm", "senhaGestor1")


@contextmanager
def _operador_ctx(username, modulos):
    with _usuario_ctx(username, "senhaOper1", "operador"):
        db._db_set_permissoes("operador", modulos)
        yield


def test_get_permissoes_returns_all_roles_and_modulos(client, gestor):
    with patch("cabonnet.app._auth_enabled", return_value=True):
        r = client.get("/api/permissoes", headers=gestor)
    assert r.status_code == 200
    data = r.json()
    assert set(data["permissoes"].keys()) == {"gestor", "operador", "viewer"}
    assert data["permissoes"]["gestor"] == db.ALL_MODULOS
    keys = {m["key"] for m in data["modulos"]}
    assert keys == set(db.ALL_MODULOS)


def test_set_permissoes_gestor_rejected(client, gestor):
    with patch("cabonnet.app._auth_enabled", return_value=True):
        r = client.put("/api/permissoes/gestor", headers=gestor, json={"modulos": ["dashboard"]})
    assert r.status_code == 400


def test_set_permissoes_invalid_role_rejected(client, gestor):
    with patch("cabonnet.app._auth_enabled", return_value=True):
        r = client.put("/api/permissoes/superuser", headers=gestor, json={"modulos": ["dashboard"]})
    assert r.status_code == 400


def test_set_and_get_permissoes_operador(client, gestor):
    with patch("cabonnet.app._auth_enabled", return_value=True):
        r = client.put("/api/permissoes/operador", headers=gestor,
                        json={"modulos": ["dashboard", "ordens"]})
        assert r.status_code == 200
        got = client.get("/api/permissoes", headers=gestor)
    assert set(got.json()["permissoes"]["operador"]) == {"dashboard", "ordens"}


def test_require_modulo_blocks_role_without_module(client):
    with _operador_ctx("oper_sem_ranking", modulos=["dashboard"]):  # sem erp_ranking
        headers = _login(client, "oper_sem_ranking", "senhaOper1")
        with patch("cabonnet.app._auth_enabled", return_value=True):
            r = client.get("/api/tecnicos", headers=headers)
        assert r.status_code == 403


def test_require_modulo_allows_role_with_module(client):
    with _operador_ctx("oper_com_ranking", modulos=["erp_ranking"]):
        headers = _login(client, "oper_com_ranking", "senhaOper1")
        with patch("cabonnet.app._auth_enabled", return_value=True):
            r = client.get("/api/tecnicos", headers=headers)
        assert r.status_code == 200


def test_gestor_always_passes_require_modulo_regardless_of_table(client, gestor):
    # Gestor nunca é gravado em role_permissoes — mesmo assim passa em tudo.
    with patch("cabonnet.app._auth_enabled", return_value=True):
        r = client.get("/api/tecnicos", headers=gestor)
    assert r.status_code == 200


def _insert_permissoes_direto(role, modulos):
    """Insere permissões diretamente no DB sem validar contra ALL_MODULOS.
    Usada para simular estado pré-migração com módulos antigos."""
    with db.state._db_lock:
        con = sqlite3.connect(db._DB_PATH)
        con.execute("DELETE FROM role_permissoes WHERE role=?", (role,))
        if modulos:
            con.executemany(
                "INSERT INTO role_permissoes (role, modulo) VALUES (?,?)",
                [(role, m) for m in modulos]
            )
        con.commit()
        con.close()


def test_migra_erp_produtividade_para_erp_planner():
    _insert_permissoes_direto("operador", ["dashboard", "erp_produtividade"])
    db._db_migrate_onda3a_modulos()
    modulos = db._db_get_permissoes("operador")
    assert "erp_produtividade" not in modulos
    assert "erp_planner" in modulos
    assert "dashboard" in modulos


def test_migra_erp_acao_para_dashboard():
    _insert_permissoes_direto("viewer", ["erp_acao", "graficos"])
    db._db_migrate_onda3a_modulos()
    modulos = db._db_get_permissoes("viewer")
    assert "erp_acao" not in modulos
    assert "dashboard" in modulos
    assert "graficos" in modulos


def test_migracao_e_idempotente_e_nao_duplica_modulo_ja_presente():
    _insert_permissoes_direto("operador", ["erp_produtividade", "erp_planner"])
    db._db_migrate_onda3a_modulos()
    db._db_migrate_onda3a_modulos()  # roda de novo, não deve quebrar nem duplicar
    modulos = db._db_get_permissoes("operador")
    assert modulos.count("erp_planner") == 1
    assert "erp_produtividade" not in modulos


def test_migracao_nao_afeta_papel_sem_modulos_antigos():
    db._db_set_permissoes("operador", ["dashboard", "erp_fila"])
    db._db_migrate_onda3a_modulos()
    assert set(db._db_get_permissoes("operador")) == {"dashboard", "erp_fila"}
