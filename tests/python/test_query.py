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


def test_stats_returns_expected_keys(client):
    r = client.get("/stats")
    assert r.status_code == 200
    data = r.json()
    assert "fila" in data
    assert "por_cidade" in data
    assert "por_tipo" in data
    fila = data["fila"]
    for key in ("pendente", "atendimento", "total", "rede", "criticas",
                "sem_equipe", "sem_agendamento", "sla_pct", "aging_med", "aging_dist"):
        assert key in fila, f"chave ausente em fila: {key}"
    assert isinstance(fila["total"], int)
    assert isinstance(fila["sla_pct"], int)
    assert isinstance(data["por_cidade"], list)
    assert isinstance(data["por_tipo"], list)


def test_stats_v1_path(client):
    r = client.get("/api/v1/stats")
    assert r.status_code == 200
    assert "fila" in r.json()


def test_stats_fila_totals_consistent(client):
    """pendente + atendimento deve ser igual a total."""
    data = client.get("/stats").json()
    f = data["fila"]
    assert f["pendente"] + f["atendimento"] == f["total"]


def test_stats_sla_pct_range(client):
    """SLA % deve estar entre 0 e 100."""
    data = client.get("/stats").json()
    assert 0 <= data["fila"]["sla_pct"] <= 100
