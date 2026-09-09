# -*- coding: utf-8 -*-
"""Papel supervisor: nasce com tudo, como o gestor, mas pode ser recortado.

A diferenca real entre os dois esta em _db_get_permissoes: gestor devolve
ALL_MODULOS direto do codigo e _db_set_permissoes recusa grava-lo; supervisor
le da tabela role_permissoes, entao a tela de permissoes consegue edita-lo.

Administrar usuarios continua exclusivo do gestor — se o supervisor pudesse,
desfaria sozinho qualquer corte e poderia se promover.
"""

import sqlite3
from unittest.mock import patch

import pytest

from cabonnet import db
from cabonnet.app import _ROLES_PERMISSOES_EDITAVEIS, _ROLES_VALIDOS
from cabonnet.db import ALL_MODULOS


@pytest.fixture
def banco(tmp_path):
    caminho = str(tmp_path / "supervisor.db")
    with patch("cabonnet.db._DB_PATH", caminho):
        db._db_init()
        yield caminho


def test_supervisor_e_papel_valido_e_editavel():
    assert "supervisor" in _ROLES_VALIDOS
    assert "supervisor" in _ROLES_PERMISSOES_EDITAVEIS


def test_nasce_com_todos_os_modulos_como_o_gestor(banco):
    with patch("cabonnet.db._DB_PATH", banco):
        assert sorted(db._db_get_permissoes("supervisor")) == sorted(ALL_MODULOS)
        assert sorted(db._db_get_permissoes("gestor")) == sorted(ALL_MODULOS)


def test_diferente_do_gestor_os_modulos_podem_ser_recortados(banco):
    with patch("cabonnet.db._DB_PATH", banco):
        db._db_set_permissoes("supervisor", ["dashboard", "ordens"])
        assert sorted(db._db_get_permissoes("supervisor")) == ["dashboard", "ordens"]

        # gestor continua imutavel
        with pytest.raises(ValueError):
            db._db_set_permissoes("gestor", ["dashboard"])
        assert sorted(db._db_get_permissoes("gestor")) == sorted(ALL_MODULOS)


def test_startup_nao_desfaz_o_corte(banco):
    """A semeadura roda uma vez so. Semear a cada boot apagaria em silencio o
    que foi ajustado na tela de permissoes."""
    with patch("cabonnet.db._DB_PATH", banco):
        db._db_set_permissoes("supervisor", ["dashboard"])
        db._db_init()   # como em todo restart
        db._db_init()
        assert db._db_get_permissoes("supervisor") == ["dashboard"]


def test_corte_total_sobrevive_ao_restart(banco):
    """Caso limite: supervisor sem nenhum modulo. Se a semeadura olhasse so
    'a tabela esta vazia?', o restart devolveria os 15."""
    with patch("cabonnet.db._DB_PATH", banco):
        db._db_set_permissoes("supervisor", [])
        db._db_init()
        assert db._db_get_permissoes("supervisor") == []


def test_marco_de_migracao_fica_registrado(banco):
    con = sqlite3.connect(banco)
    marco = con.execute("SELECT valor FROM app_meta WHERE chave='seed_supervisor'").fetchone()
    con.close()
    assert marco, "a semeadura precisa deixar marco, senao repete a cada boot"


def test_supervisor_nao_administra_usuarios(client, tmp_path):
    """Endpoints de usuario e permissao seguem em _require_gestor."""
    caminho = str(tmp_path / "supervisor_api.db")
    with patch("cabonnet.db._DB_PATH", caminho), \
         patch("cabonnet.app._auth_enabled", return_value=True), \
         patch("cabonnet.app._get_optional_role", return_value="supervisor"):
        db._db_init()
        for metodo, rota in (("get", "/api/usuarios"), ("get", "/api/permissoes")):
            r = getattr(client, metodo)(rota)
            assert r.status_code in (401, 403), "%s %s devolveu %s" % (metodo, rota, r.status_code)


def test_api_aceita_criar_usuario_supervisor(client, tmp_path):
    caminho = str(tmp_path / "supervisor_crud.db")
    with patch("cabonnet.db._DB_PATH", caminho):
        db._db_init()
        r = client.post("/api/usuarios", json={
            "username": "sup1", "password": "senha12345", "role": "supervisor", "cluster_key": "VALE",
        })
        assert r.status_code in (200, 201), r.text[:200]
        criado = next(u for u in client.get("/api/usuarios").json()["items"] if u["username"] == "sup1")
        assert criado["role"] == "supervisor"
