# -*- coding: utf-8 -*-
"""
Testes dos endpoints de dados: /query, /revisitas, /detalhes.

grafana_post mockada para retornar {} → frames_to_csv({}) → None → CSV vazio.
Os endpoints degradam graciosamente: retornam estrutura válida com dados vazios.
"""


def test_query_returns_expected_keys(client):
    r = client.get("/query")
    assert r.status_code == 200
    data = r.json()
    for key in ("pendente", "agendado", "futuro", "n_pendente", "n_agendado", "n_futuro", "date"):
        assert key in data, f"chave ausente: {key}"
    assert isinstance(data["n_pendente"], int)


def test_query_v1_path(client):
    """Mesmo endpoint acessível via prefixo versionado."""
    r = client.get("/api/v1/query")
    assert r.status_code == 200
    assert "pendente" in r.json()


def test_query_legacy_and_v1_consistent(client):
    r_legacy = client.get("/query")
    r_v1     = client.get("/api/v1/query")
    assert r_legacy.status_code == r_v1.status_code == 200


def test_query_with_date_param(client):
    r = client.get("/query?date=hoje")
    assert r.status_code == 200


def test_query_invalid_date_param(client):
    r = client.get("/query?date=INVALIDO_QUE_NAO_EXISTE")
    assert r.status_code == 400


def test_revisitas_returns_expected_keys(client):
    r = client.get("/revisitas")
    assert r.status_code == 200
    data = r.json()
    assert "concluidas" in data
    assert "n" in data
    assert isinstance(data["n"], int)


def test_revisitas_v1_path(client):
    r = client.get("/api/v1/revisitas")
    assert r.status_code == 200
    assert "concluidas" in r.json()


def test_detalhes_non_numeric_numos_returns_400(client):
    r = client.get("/detalhes?numos=abc")
    assert r.status_code == 400


def test_detalhes_numeric_numos_not_found(client):
    """Numos numérico válido que não existe no Grafana mockado → 404."""
    r = client.get("/detalhes?numos=1234567")
    assert r.status_code == 404
