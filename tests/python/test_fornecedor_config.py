# -*- coding: utf-8 -*-
"""
Testes HTTP das rotas de custo e meta de fornecedor.

A camada de banco (vigência, fechamento de período) é coberta em
test_db_fornecedor.py. Aqui o foco é validação de entrada e autorização.
"""

import pytest
from unittest.mock import patch

from cabonnet import db


@pytest.fixture
def tmp_db(tmp_path):
    db_path = str(tmp_path / "cabonnet_rotas_test.db")
    with patch("cabonnet.db._DB_PATH", db_path):
        db._db_init()
        yield db_path


def test_config_vazia_responde_ok(client, tmp_db):
    r = client.get("/api/fornecedor/config")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "custo": {}, "meta": {}}


def test_grava_e_le_custo(client, tmp_db):
    r = client.post("/api/fornecedor/custo",
                    json={"forn_key": "WES", "custo_mensal": 30000, "vigente_de": "2026-07-01"})
    assert r.status_code == 200

    r = client.get("/api/fornecedor/config", params={"data_ref": "2026-07-15"})
    assert r.json()["custo"] == {"WES": 30000.0}


def test_data_ref_seleciona_a_vigencia_certa(client, tmp_db):
    client.post("/api/fornecedor/custo",
                json={"forn_key": "WES", "custo_mensal": 30000, "vigente_de": "2026-01-01"})
    client.post("/api/fornecedor/custo",
                json={"forn_key": "WES", "custo_mensal": 45000, "vigente_de": "2026-07-01"})

    assert client.get("/api/fornecedor/config", params={"data_ref": "2026-03-10"}).json()["custo"] == {"WES": 30000.0}
    assert client.get("/api/fornecedor/config", params={"data_ref": "2026-08-10"}).json()["custo"] == {"WES": 45000.0}


# Sem a lista de chaves aceitas, um erro de digitação no frontend criaria uma
# operadora fantasma que nunca apareceria em tela nenhuma.
def test_forn_key_desconhecido_e_rejeitado(client, tmp_db):
    r = client.post("/api/fornecedor/custo", json={"forn_key": "WESS", "custo_mensal": 100})
    assert r.status_code == 400

    r = client.post("/api/fornecedor/custo", json={"custo_mensal": 100})
    assert r.status_code == 400


def test_custo_negativo_e_rejeitado(client, tmp_db):
    r = client.post("/api/fornecedor/custo", json={"forn_key": "WES", "custo_mensal": -1})
    assert r.status_code == 400


def test_data_de_vigencia_malformada_e_rejeitada(client, tmp_db):
    r = client.post("/api/fornecedor/custo",
                    json={"forn_key": "WES", "custo_mensal": 100, "vigente_de": "01/07/2026"})
    assert r.status_code == 400


def test_meta_fora_da_faixa_e_rejeitada(client, tmp_db):
    assert client.post("/api/fornecedor/meta", json={"forn_key": "WES", "meta_sla": 101}).status_code == 400
    assert client.post("/api/fornecedor/meta", json={"forn_key": "WES", "meta_sla": -1}).status_code == 400


def test_meta_nula_limpa(client, tmp_db):
    client.post("/api/fornecedor/meta", json={"forn_key": "WES", "meta_sla": 85})
    assert client.get("/api/fornecedor/config").json()["meta"] == {"WES": 85}

    client.post("/api/fornecedor/meta", json={"forn_key": "WES", "meta_sla": None})
    assert client.get("/api/fornecedor/config").json()["meta"] == {}


def test_historico_lista_as_vigencias(client, tmp_db):
    client.post("/api/fornecedor/custo",
                json={"forn_key": "THM", "custo_mensal": 10000, "vigente_de": "2026-01-01"})
    client.post("/api/fornecedor/custo",
                json={"forn_key": "THM", "custo_mensal": 12000, "vigente_de": "2026-07-01"})

    items = client.get("/api/fornecedor/custo/historico", params={"forn_key": "THM"}).json()["items"]
    assert [i["custo_mensal"] for i in items] == [10000.0, 12000.0]
    assert items[0]["vigente_ate"] == "2026-06-30"
    assert items[1]["vigente_ate"] is None


def test_escrita_exige_gestor(client, tmp_db):
    # Com auth ligada e sessão de operador, escrever deve dar 403.
    with (
        patch("cabonnet.app._auth_enabled", return_value=True),
        patch("cabonnet.app._session_from_cookie", return_value={"role": "operador", "username": "op"}),
    ):
        r = client.post("/api/fornecedor/custo", json={"forn_key": "WES", "custo_mensal": 100})
        assert r.status_code == 403
