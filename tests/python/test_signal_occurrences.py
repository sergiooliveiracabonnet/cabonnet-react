import json
from unittest.mock import patch

import pytest

from cabonnet import db


@pytest.fixture
def tmp_db(tmp_path):
    db_path = str(tmp_path / "cabonnet_signal_test.db")
    with patch("cabonnet.db._DB_PATH", db_path):
        db._db_init()
        yield db_path


def occurrence(occurrence_id="occ-1", status="Aberto"):
    return {"id": occurrence_id, "sourceKey": "serial:ABC123", "client": "Cliente Teste", "status": status}


def test_sync_persiste_csv_e_ocorrencias(tmp_db):
    import_id = db._db_sync_signal_occurrences("sinais.csv", "Cidade;RX dBm\nTaubaté;-30", [occurrence()], "sergio")

    assert import_id is not None
    assert db._db_list_signal_occurrences() == [occurrence()]
    saved = db._db_get_signal_import(import_id)
    assert saved["file_name"] == "sinais.csv"
    assert "Taubaté" in saved["csv_text"]
    assert saved["created_by"] == "sergio"


def test_update_tratativa_persiste_payload(tmp_db):
    db._db_sync_signal_occurrences("sinais.csv", "csv", [occurrence()], "sergio")
    updated = occurrence(status="Concluído") | {"note": "Conector substituído"}

    assert db._db_update_signal_occurrence(updated, "operador") is True
    assert db._db_list_signal_occurrences()[0]["note"] == "Conector substituído"


def test_sync_atualiza_sem_duplicar(tmp_db):
    db._db_sync_signal_occurrences("a.csv", "csv-a", [occurrence()], "sergio")
    db._db_sync_signal_occurrences("b.csv", "csv-b", [occurrence(status="Em atendimento")], "sergio")

    assert len(db._db_list_signal_occurrences()) == 1
    assert db._db_list_signal_occurrences()[0]["status"] == "Em atendimento"
