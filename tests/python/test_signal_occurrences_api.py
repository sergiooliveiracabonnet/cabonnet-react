from unittest.mock import patch

from cabonnet import db


def test_api_sincroniza_lista_e_atualiza_tratativa(client, tmp_path):
    db_path = str(tmp_path / "cabonnet_signal_api.db")
    item = {"id": "occ-api-1", "sourceKey": "serial:XYZ", "client": "Cliente API", "status": "Aberto"}
    with patch("cabonnet.db._DB_PATH", db_path):
        db._db_init()
        synced = client.post("/api/nivel-sinal/ocorrencias/sync", json={
            "file_name": "sinais.csv", "csv_text": "Cidade;RX dBm\nTaubaté;-30", "occurrences": [item],
        })
        assert synced.status_code == 200
        assert synced.json()["items"] == [item]

        listed = client.get("/api/nivel-sinal/ocorrencias")
        assert listed.status_code == 200
        assert listed.json()["items"] == [item]

        concluded = {**item, "status": "Concluído", "note": "Tratativa realizada"}
        updated = client.post("/api/nivel-sinal/ocorrencia/update", json=concluded)
        assert updated.status_code == 200
        assert updated.json()["items"][0]["status"] == "Concluído"
