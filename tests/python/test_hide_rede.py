# -*- coding: utf-8 -*-
"""O toggle "Rede" do header deve valer também para as telas do BI.

Com o botão OFF (hide_rede=1) nenhuma OS de Rede pode aparecer — nem nas
linhas, nem nos agregados que o backend calcula.
"""

from unittest.mock import patch

from cabonnet.imanager_bi import is_rede_row


def _row(numos, equipe, cadastro="10/07/2026", execucao="12/07/2026", recorrencia=0, **overrides):
    row = {
        "numos": str(numos),
        "nomecliente": "CLIENTE",
        "codigocliente": "C1",
        "codigocontrato": "1001",
        "servico": "ASSISTENCIA TECNICA",
        "tiposervico": "MANUTENCAO",
        "nomedacidade": "Taubaté",
        "bairro": "CENTRO",
        "descsituacao": "Executada",
        "nomedaequipe": equipe,
        "equipeexecutou": equipe,
        "datacadastro": cadastro,
        "dataagendamento": cadastro,
        "dataexecucao": execucao,
        "horas_resolucao": 10,
        "recorrencia": recorrencia,
        "is_revisita": recorrencia > 0,
        "revisita_inst": 0,
        "revisita_manut": 0,
        "revisita_serv": 0,
    }
    row.update(overrides)
    return row


BI_ROWS = [
    _row(1, "F01"),
    _row(2, "REDE 02"),
    _row(3, "F08"),
    _row(4, "REDE 05", recorrencia=1),
]


def test_is_rede_row_usa_a_mesma_regra_do_frontend():
    # getEquipeTipo (transform.ts) casa \bREDE\b no nome da equipe
    assert is_rede_row({"nomedaequipe": "REDE 02"}) is True
    assert is_rede_row({"nomedaequipe": "rede 05"}) is True
    assert is_rede_row({"nomedaequipe": "F01"}) is False
    assert is_rede_row({"nomedaequipe": "PAREDE 01"}) is False
    assert is_rede_row({"nomedaequipe": ""}) is False
    assert is_rede_row({}) is False


def test_backlog_remove_rede_quando_toggle_esta_off(client):
    with patch("cabonnet.imanager_bi.fetch_bi_rows", return_value=list(BI_ROWS)):
        resp = client.get("/backlog?inicio=2026-07-01&fim=2026-08-01&hide_rede=1")

    assert resp.status_code == 200
    data = resp.json()
    equipes = {row["nomedaequipe"] for row in data["rows"]}
    assert equipes == {"F01", "F08"}
    assert data["kpis"]["total"] == 2


def test_backlog_mantem_rede_quando_toggle_esta_on(client):
    with patch("cabonnet.imanager_bi.fetch_bi_rows", return_value=list(BI_ROWS)):
        resp = client.get("/backlog?inicio=2026-07-01&fim=2026-08-01")

    assert resp.status_code == 200
    data = resp.json()
    equipes = {row["nomedaequipe"] for row in data["rows"]}
    assert "REDE 02" in equipes
    assert data["kpis"]["total"] == 4


def test_backlog_nao_serve_cache_de_um_estado_do_toggle_para_o_outro(client):
    with patch("cabonnet.imanager_bi.fetch_bi_rows", return_value=list(BI_ROWS)):
        com_rede = client.get("/backlog?inicio=2026-07-02&fim=2026-08-01").json()
        sem_rede = client.get("/backlog?inicio=2026-07-02&fim=2026-08-01&hide_rede=1").json()

    assert com_rede["kpis"]["total"] == 4
    assert sem_rede["kpis"]["total"] == 2


def test_revisit_journeys_remove_rede_quando_toggle_esta_off(client):
    with patch("cabonnet.imanager_bi.fetch_bi_rows", return_value=list(BI_ROWS)):
        resp = client.get("/api/revisit-journeys?inicio=2026-07-01&fim=2026-08-01&hide_rede=1")

    assert resp.status_code == 200
    revisitas = {j["revisit"]["nomedaequipe"] for j in resp.json()["journeys"]}
    assert not any("REDE" in equipe.upper() for equipe in revisitas)
