# -*- coding: utf-8 -*-
"""Escala semanal de equipes: status/local por equipe e dia, editável via API."""

from unittest.mock import patch

from cabonnet import db

DIA_SEG = "14/09/2026"
DIA_TER = "15/09/2026"


def test_lista_vazia_quando_nao_ha_escala_salva(client, tmp_path):
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "escala_vazia.db")):
        db._db_init()
        response = client.get(f"/api/escala?dias={DIA_SEG}")
        assert response.status_code == 200
        assert response.json() == {"ok": True, "items": []}


def test_upsert_grava_e_reflete_na_listagem(client, tmp_path):
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "escala_salva.db")):
        db._db_init()
        body = {"team_code": "F01", "dia": DIA_SEG, "local1": "Caçapava", "local2": ""}
        assert client.post("/api/escala", json=body).status_code == 200

        items = client.get(f"/api/escala?dias={DIA_SEG}").json()["items"]
        assert len(items) == 1
        assert items[0]["team_code"] == "F01"
        assert items[0]["local1"] == "Caçapava"


def test_upsert_da_mesma_equipe_e_dia_atualiza_em_vez_de_duplicar(client, tmp_path):
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "escala_atualiza.db")):
        db._db_init()
        client.post("/api/escala", json={"team_code": "F01", "dia": DIA_SEG, "local1": "Caçapava"})
        client.post("/api/escala", json={"team_code": "F01", "dia": DIA_SEG, "local1": "Taubaté", "local2": "Plantão"})

        items = client.get(f"/api/escala?dias={DIA_SEG}").json()["items"]
        assert len(items) == 1
        assert items[0]["local1"] == "Taubaté"
        assert items[0]["local2"] == "Plantão"


def test_listagem_filtra_pelos_dias_pedidos(client, tmp_path):
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "escala_filtro.db")):
        db._db_init()
        client.post("/api/escala", json={"team_code": "F01", "dia": DIA_SEG, "local1": "Caçapava"})
        client.post("/api/escala", json={"team_code": "F01", "dia": DIA_TER, "local1": "Tremembé"})

        items = client.get(f"/api/escala?dias={DIA_SEG}").json()["items"]
        assert [i["dia"] for i in items] == [DIA_SEG]


def test_payload_sem_team_code_ou_dia_e_recusado(client, tmp_path):
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "escala_invalida.db")):
        db._db_init()
        assert client.post("/api/escala", json={"team_code": "", "dia": DIA_SEG}).status_code == 400
        assert client.post("/api/escala", json={"team_code": "F01", "dia": ""}).status_code == 400
