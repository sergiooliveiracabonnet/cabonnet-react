# -*- coding: utf-8 -*-
"""
Testes da camada db.py para custo e meta de fornecedor.

Custo tem vigência: contrato de fornecedor muda por aditivo, com data, e analisar
um período passado com o custo de hoje produz número errado silenciosamente.
Meta não tem: é decisão interna, não contrato.
"""

import pytest
from unittest.mock import patch

from cabonnet import db


@pytest.fixture
def tmp_db(tmp_path):
    db_path = str(tmp_path / "cabonnet_test.db")
    with patch("cabonnet.db._DB_PATH", db_path):
        db._db_init()
        yield db_path


# ─── custo ────────────────────────────────────────────────────────────────────

def test_sem_config_devolve_vazio(tmp_db):
    assert db._db_get_fornecedor_custo("2026-07-31") == {}


def test_define_custo_e_le_de_volta(tmp_db):
    assert db._db_set_fornecedor_custo("WES", 30000, "2026-07-01") is True
    assert db._db_get_fornecedor_custo("2026-07-15") == {"WES": 30000.0}


def test_custo_nao_vale_antes_do_inicio_da_vigencia(tmp_db):
    db._db_set_fornecedor_custo("WES", 30000, "2026-07-01")
    assert db._db_get_fornecedor_custo("2026-06-30") == {}


def test_vigencia_aberta_vale_para_o_futuro(tmp_db):
    db._db_set_fornecedor_custo("WES", 30000, "2026-07-01")
    assert db._db_get_fornecedor_custo("2027-01-01") == {"WES": 30000.0}


# O caso que motivou a Opção B: analisar março com o custo de julho dava número
# errado sem avisar. Com vigência, cada período enxerga o próprio custo.
def test_periodo_passado_enxerga_o_custo_da_epoca(tmp_db):
    db._db_set_fornecedor_custo("WES", 30000, "2026-01-01")
    db._db_set_fornecedor_custo("WES", 45000, "2026-07-01")

    assert db._db_get_fornecedor_custo("2026-03-15") == {"WES": 30000.0}
    assert db._db_get_fornecedor_custo("2026-07-15") == {"WES": 45000.0}


def test_nova_vigencia_fecha_a_anterior_sem_deixar_buraco(tmp_db):
    db._db_set_fornecedor_custo("WES", 30000, "2026-01-01")
    db._db_set_fornecedor_custo("WES", 45000, "2026-07-01")

    hist = db._db_list_fornecedor_custo_historico("WES")
    assert len(hist) == 2
    anterior = [h for h in hist if h["custo_mensal"] == 30000.0][0]
    assert anterior["vigente_ate"] == "2026-06-30"   # véspera, sem lacuna nem sobreposição

    atual = [h for h in hist if h["custo_mensal"] == 45000.0][0]
    assert atual["vigente_ate"] is None


def test_regravar_a_mesma_vigencia_corrige_em_vez_de_duplicar(tmp_db):
    db._db_set_fornecedor_custo("WES", 30000, "2026-07-01")
    db._db_set_fornecedor_custo("WES", 31000, "2026-07-01")   # correção de digitação

    hist = db._db_list_fornecedor_custo_historico("WES")
    assert len(hist) == 1
    assert hist[0]["custo_mensal"] == 31000.0


def test_fornecedores_sao_independentes(tmp_db):
    db._db_set_fornecedor_custo("WES", 30000, "2026-07-01")
    db._db_set_fornecedor_custo("THM", 12000, "2026-07-01")

    assert db._db_get_fornecedor_custo("2026-07-15") == {"WES": 30000.0, "THM": 12000.0}


def test_registra_quem_alterou(tmp_db):
    db._db_set_fornecedor_custo("WES", 30000, "2026-07-01", usuario="sergio")
    assert db._db_list_fornecedor_custo_historico("WES")[0]["atualizado_por"] == "sergio"


# ─── meta ─────────────────────────────────────────────────────────────────────

def test_meta_upsert(tmp_db):
    assert db._db_set_fornecedor_meta("WES", 85) is True
    assert db._db_get_fornecedor_meta() == {"WES": 85}

    db._db_set_fornecedor_meta("WES", 90)
    assert db._db_get_fornecedor_meta() == {"WES": 90}


def test_meta_sem_registro_devolve_vazio(tmp_db):
    assert db._db_get_fornecedor_meta() == {}


def test_meta_nula_limpa_o_valor(tmp_db):
    db._db_set_fornecedor_meta("WES", 85)
    db._db_set_fornecedor_meta("WES", None)
    assert db._db_get_fornecedor_meta() == {}
