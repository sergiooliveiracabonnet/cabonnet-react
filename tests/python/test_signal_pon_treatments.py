# -*- coding: utf-8 -*-
"""Tratativa por PON: log append-only, estado = último evento."""

from unittest.mock import patch

from cabonnet import db

PON_KEY = "OLT Caçapava · 2/1"
SNAPSHOT = {
    "olt": "OLT Caçapava", "pon": "2/1", "cidade": "Cacapava", "bairro": "VITORIA VALE",
    "total": 18, "criticos": 9, "concentracao": 0.5, "rxMediano": -28.4, "piorRx": -31.2, "nivel": "alto",
}


def _treat(client, action, pon_key=PON_KEY, snapshot=None):
    return client.post(
        f"/api/nivel-sinal/pon/{action}",
        json={"pon_key": pon_key, "snapshot": SNAPSHOT if snapshot is None else snapshot},
    )


def test_tratar_pon_guarda_snapshot_e_marca_como_tratada(client, tmp_path):
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "pon_tratar.db")):
        db._db_init()

        assert client.get("/api/nivel-sinal/pons-tratadas").json()["items"] == []

        response = _treat(client, "tratar")
        assert response.status_code == 200
        item = response.json()["items"][0]
        assert item["pon_key"] == PON_KEY
        assert item["action"] == "tratada"
        assert item["snapshot"]["criticos"] == 9
        assert item["snapshot"]["rxMediano"] == -28.4
        assert item["treated_count"] == 1
        assert item["reopened_count"] == 0


def test_ciclo_tratada_reaberta_tratada_conta_reincidencia(client, tmp_path):
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "pon_ciclo.db")):
        db._db_init()

        _treat(client, "tratar")
        reopened = _treat(client, "reabrir").json()["items"][0]
        assert reopened["action"] == "reaberta"
        assert reopened["treated_count"] == 1
        assert reopened["reopened_count"] == 1

        again = _treat(client, "tratar").json()["items"][0]
        assert again["action"] == "tratada"
        assert again["treated_count"] == 2
        assert again["reopened_count"] == 1


def test_pons_diferentes_nao_se_misturam(client, tmp_path):
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "pon_isolamento.db")):
        db._db_init()

        _treat(client, "tratar")
        _treat(client, "tratar", pon_key="OLT Taubaté 1 · 3/4")
        _treat(client, "reabrir")

        items = {item["pon_key"]: item for item in client.get("/api/nivel-sinal/pons-tratadas").json()["items"]}
        assert items[PON_KEY]["action"] == "reaberta"
        assert items["OLT Taubaté 1 · 3/4"]["action"] == "tratada"


def test_pon_key_vazia_e_recusada(client, tmp_path):
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "pon_invalida.db")):
        db._db_init()
        assert client.post("/api/nivel-sinal/pon/tratar", json={"pon_key": "  ", "snapshot": {}}).status_code == 400
        assert client.post("/api/nivel-sinal/pon/tratar", json={"pon_key": PON_KEY, "snapshot": []}).status_code == 400


def test_acao_invalida_e_recusada_na_camada_de_dados(tmp_path):
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "pon_acao.db")):
        db._db_init()
        try:
            db._db_add_pon_treatment(PON_KEY, "arquivada", SNAPSHOT)
        except ValueError as ex:
            assert "invalida" in str(ex).lower()
        else:
            raise AssertionError("ação inválida deveria levantar ValueError")


def test_historico_de_importacoes_e_podado(client, tmp_path):
    """csv_text pesa MB e só a última importação é lida — o resto não pode acumular."""
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "pon_poda.db")):
        db._db_init()
        for index in range(db._SIGNAL_IMPORT_HISTORY + 3):
            client.post("/api/nivel-sinal/ocorrencias/sync", json={
                "file_name": f"sinais-{index}.csv",
                "csv_text": f"Cidade;RX dBm\nTaubaté;-3{index}",
                "occurrences": [{"id": f"occ-poda-{index}", "sourceKey": f"serial:PODA{index}", "status": "Aberto"}],
            })

        import sqlite3
        con = sqlite3.connect(str(tmp_path / "pon_poda.db"))
        total, newest = con.execute("SELECT COUNT(*), MAX(file_name) FROM signal_imports").fetchone()
        con.close()
        assert total == db._SIGNAL_IMPORT_HISTORY
        assert newest == "sinais-7.csv"

        latest = client.get("/api/nivel-sinal/import/latest").json()["item"]
        assert latest["file_name"] == "sinais-7.csv"
