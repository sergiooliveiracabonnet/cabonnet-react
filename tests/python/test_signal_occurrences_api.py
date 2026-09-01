from unittest.mock import patch
import gzip
import json

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


def test_api_aceita_importacao_comprimida(client, tmp_path):
    db_path = str(tmp_path / "cabonnet_signal_gzip.db")
    payload = {"file_name": "grande.csv", "csv_text": "x" * 1_000_000, "occurrences": [
        {"id": "occ-gzip", "sourceKey": "serial:GZIP", "status": "Aberto"},
    ]}
    compressed = gzip.compress(json.dumps(payload).encode("utf-8"))
    with patch("cabonnet.db._DB_PATH", db_path):
        db._db_init()
        response = client.post(
            "/api/nivel-sinal/ocorrencias/sync",
            content=compressed,
            headers={"Content-Type": "application/json", "Content-Encoding": "gzip"},
        )
    assert response.status_code == 200
    assert response.json()["items"][0]["id"] == "occ-gzip"


def test_api_monta_importacao_comprimida_em_blocos(client, tmp_path):
    db_path = str(tmp_path / "cabonnet_signal_chunks.db")
    payload = {"file_name": "grande.csv", "csv_text": "x" * 1_000_000, "occurrences": [
        {"id": "occ-chunk", "sourceKey": "serial:CHUNK", "status": "Aberto"},
    ]}
    compressed = gzip.compress(json.dumps(payload).encode("utf-8"))
    chunks = [compressed[index:index + 100] for index in range(0, len(compressed), 100)]
    with patch("cabonnet.db._DB_PATH", db_path):
        db._db_init()
        responses = [client.post(
            "/api/nivel-sinal/ocorrencias/sync/chunk",
            content=chunk,
            headers={
                "Content-Type": "application/octet-stream",
                "X-Upload-ID": "upload-teste-123",
                "X-Chunk-Index": str(index),
                "X-Chunk-Total": str(len(chunks)),
                "X-Payload-Encoding": "gzip",
            },
        ) for index, chunk in enumerate(chunks)]

    assert all(response.status_code == 200 for response in responses)
    assert all(response.json().get("complete") is False for response in responses[:-1])
    assert responses[-1].json()["complete"] is True
    assert responses[-1].json()["items"][0]["id"] == "occ-chunk"
