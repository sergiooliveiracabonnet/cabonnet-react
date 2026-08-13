from unittest.mock import patch
import gzip
import json
import logging
import sqlite3

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


def test_api_explica_falha_de_banco_ao_guardar_bloco(client, tmp_path, caplog):
    """Erro de infraestrutura ao guardar o bloco não pode virar 500 mudo: o
    usuário precisa de uma mensagem e o traceback precisa cair no log."""
    db_path = str(tmp_path / "cabonnet_signal_chunk_falha.db")
    with patch("cabonnet.db._DB_PATH", db_path):
        db._db_init()
        with patch("cabonnet.db._db_store_signal_import_chunk",
                   side_effect=sqlite3.OperationalError("no such table: signal_import_chunks")):
            with caplog.at_level(logging.ERROR):
                response = client.post(
                    "/api/nivel-sinal/ocorrencias/sync/chunk",
                    content=b"bloco",
                    headers={
                        "Content-Type": "application/octet-stream",
                        "X-Upload-ID": "upload-falha-1",
                        "X-Chunk-Index": "0",
                        "X-Chunk-Total": "1",
                        "X-Payload-Encoding": "gzip",
                    },
                )

    assert response.status_code == 500
    assert "signal_import_chunks" in response.json()["detail"]
    assert any("upload-falha-1" in record.getMessage() for record in caplog.records)


def test_api_explica_falha_de_banco_ao_persistir_ocorrencias(client, tmp_path):
    """Mesma garantia no fim do fluxo: falha ao gravar as ocorrências deve
    chegar ao frontend como mensagem, não como 500 sem corpo."""
    db_path = str(tmp_path / "cabonnet_signal_persist_falha.db")
    payload = {"file_name": "s.csv", "csv_text": "Cidade;RX dBm\nTaubaté;-30", "occurrences": [
        {"id": "occ-falha", "status": "Aberto"},
    ]}
    compressed = gzip.compress(json.dumps(payload).encode("utf-8"))
    with patch("cabonnet.db._DB_PATH", db_path):
        db._db_init()
        with patch("cabonnet.db._db_sync_signal_occurrences",
                   side_effect=sqlite3.OperationalError("database is locked")):
            response = client.post(
                "/api/nivel-sinal/ocorrencias/sync/chunk",
                content=compressed,
                headers={
                    "Content-Type": "application/octet-stream",
                    "X-Upload-ID": "upload-falha-2",
                    "X-Chunk-Index": "0",
                    "X-Chunk-Total": "1",
                    "X-Payload-Encoding": "gzip",
                },
            )

    assert response.status_code == 500
    assert "database is locked" in response.json()["detail"]
