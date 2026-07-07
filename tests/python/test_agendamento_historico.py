# -*- coding: utf-8 -*-
"""
Testes do histórico de agendamento/equipe — cobre a camada de persistência
(db.py) e a detecção de troca de equipe independente de status (cache.py).
Ver CLAUDE.md/conversa: o Grafana só reflete o estado atual da OS, então esse
histórico é a única forma de saber por quais equipes uma OS passou.
"""

from unittest.mock import patch

import pytest

from cabonnet import cache, db, state


@pytest.fixture
def tmp_db(tmp_path):
    db_path = str(tmp_path / "cabonnet_test.db")
    with patch("cabonnet.db._DB_PATH", db_path):
        db._db_init()
        yield db_path


@pytest.fixture(autouse=True)
def reset_snapshots():
    """Os snapshots de status/equipe são globals em state.py — isolar entre testes."""
    state._status_snapshot.clear()
    state._status_snap_primed = False
    state._equipe_snapshot.clear()
    yield
    state._status_snapshot.clear()
    state._status_snap_primed = False
    state._equipe_snapshot.clear()


def _csv(rows):
    header = "numos,descsituacao,nomedaequipe,dataagendamento,nomedacidade,tiposervico,codigocliente"
    linhas = [header] + [
        ",".join(str(r.get(k, "")) for k in header.split(",")) for r in rows
    ]
    return "\n".join(linhas)


# ── db.py — persistência pura ─────────────────────────────────────────────────

def test_save_and_get_agendamento_history(tmp_db):
    db._db_save_agendamento_changes([
        {"numos": "1234567", "nomedaequipe": "F01", "dataagendamento": "01/07/2026",
         "descsituacao": "Pendente", "nomedacidade": "Taubaté", "tiposervico": "Instalação"},
    ])
    db._db_save_agendamento_changes([
        {"numos": "1234567", "nomedaequipe": "F04", "dataagendamento": "03/07/2026",
         "descsituacao": "Pendente", "nomedacidade": "Taubaté", "tiposervico": "Instalação"},
    ])

    hist = db._db_get_agendamento_history("1234567")
    assert len(hist) == 2
    assert hist[0]["nomedaequipe"] == "F01"
    assert hist[1]["nomedaequipe"] == "F04"
    assert hist[0]["ts"] <= hist[1]["ts"]


def test_get_agendamento_history_empty_for_unknown_os(tmp_db):
    assert db._db_get_agendamento_history("9999999") == []


def test_save_agendamento_changes_noop_on_empty_list(tmp_db):
    db._db_save_agendamento_changes([])
    assert db._db_get_agendamento_history("1234567") == []


# ── cache.py — detecção de troca de equipe independente do status ────────────

def test_equipe_change_without_status_change_is_detected(tmp_db):
    csv_v1 = _csv([{"numos": "1111111", "descsituacao": "Pendente", "nomedaequipe": "F01",
                     "dataagendamento": "01/07/2026", "nomedacidade": "Taubaté",
                     "tiposervico": "Instalação", "codigocliente": "C1"}])
    csv_v2 = _csv([{"numos": "1111111", "descsituacao": "Pendente", "nomedaequipe": "F04",
                     "dataagendamento": "03/07/2026", "nomedacidade": "Taubaté",
                     "tiposervico": "Instalação", "codigocliente": "C1"}])

    with patch("cabonnet.db._DB_PATH", tmp_db):
        cache._dados_cache_update(csv_pendente="")       # primeira carga do processo — snapshot vazio
        cache._dados_cache_update(csv_pendente=csv_v1)   # OS aparece pela 1ª vez — vira o registro inicial
        cache._dados_cache_update(csv_pendente=csv_v2)   # equipe mudou, status igual — detectado mesmo assim

        import time
        time.sleep(0.2)  # salva em thread daemon — dá tempo do insert acontecer

        hist = db._db_get_agendamento_history("1111111")

    assert len(hist) == 2
    assert hist[0]["nomedaequipe"] == "F01"
    assert hist[1]["nomedaequipe"] == "F04"


def test_first_load_does_not_flood_history(tmp_db):
    csv_v1 = _csv([{"numos": "2222222", "descsituacao": "Pendente", "nomedaequipe": "F01",
                     "dataagendamento": "01/07/2026", "nomedacidade": "Taubaté",
                     "tiposervico": "Instalação", "codigocliente": "C2"}])

    with patch("cabonnet.db._DB_PATH", tmp_db):
        cache._dados_cache_update(csv_pendente=csv_v1)  # primeira carga do processo

        import time
        time.sleep(0.2)

        hist = db._db_get_agendamento_history("2222222")

    assert hist == []


def test_no_change_produces_no_new_history_entry(tmp_db):
    csv_v1 = _csv([{"numos": "3333333", "descsituacao": "Pendente", "nomedaequipe": "F01",
                     "dataagendamento": "01/07/2026", "nomedacidade": "Taubaté",
                     "tiposervico": "Instalação", "codigocliente": "C3"}])

    with patch("cabonnet.db._DB_PATH", tmp_db):
        cache._dados_cache_update(csv_pendente=csv_v1)
        cache._dados_cache_update(csv_pendente=csv_v1)  # mesmo CSV, nada mudou

        import time
        time.sleep(0.2)

        hist = db._db_get_agendamento_history("3333333")

    assert hist == []
