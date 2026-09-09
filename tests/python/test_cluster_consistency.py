# -*- coding: utf-8 -*-
"""CLUSTERS é a fonte única das cidades atendidas.

A lista já esteve cravada em 15 pontos do grafana.py, mais stats.py, imanager_bi.py
e servidor.js. Cada cópia é uma chance de o filtro sair de sincronia em silêncio —
foi assim que o mapa de operadoras deixou frentes de fora do Fechamento.
"""

import io
import re

from cabonnet import grafana, imanager_bi, stats
from cabonnet.config import CIDADES_ATENDIDAS, CIDADES_VALIDAS, CLUSTERS, CLUSTER_DE_CIDADE


def test_os_dois_clusters_cobrem_as_doze_cidades():
    assert set(CLUSTERS) == {"VALE", "ADAMANTINA"}
    assert len(CLUSTERS["VALE"]["cidades"]) == 5
    assert len(CLUSTERS["ADAMANTINA"]["cidades"]) == 7
    assert len(CIDADES_ATENDIDAS) == 12


def test_e_osvaldo_com_v_como_no_erp():
    """O ERP grafa OSVALDO CRUZ. Com W a cidade sumiria do filtro sem erro."""
    assert "OSVALDO CRUZ" in CIDADES_ATENDIDAS
    assert "OSWALDO CRUZ" not in CIDADES_ATENDIDAS
    assert CLUSTER_DE_CIDADE["OSVALDO CRUZ"] == "ADAMANTINA"


def test_aliases_resolvem_para_o_cluster_da_cidade_canonica():
    assert CLUSTER_DE_CIDADE["SAO JOSE"] == "VALE"
    assert CLUSTER_DE_CIDADE["SJCAMPOS"] == "VALE"
    assert CIDADES_VALIDAS == set(CLUSTER_DE_CIDADE)


def test_stats_e_imanager_usam_a_mesma_fonte():
    assert stats._CIDADES_VALIDAS is CIDADES_VALIDAS
    assert imanager_bi._VALID_CITIES is CIDADES_ATENDIDAS


def test_toda_sql_filtra_pelas_doze_cidades():
    """Nenhuma query pode ter ficado com a lista antiga cravada."""
    sqls = {n: v for n, v in vars(grafana).items() if n.startswith("SQL_") and isinstance(v, str)}
    com_filtro = {n: v for n, v in sqls.items() if " in (" in v.lower() and "t.nome" in v}
    assert com_filtro, "esperava encontrar SQL filtrando por cidade"

    for nome, sql in com_filtro.items():
        for cidade in CIDADES_ATENDIDAS:
            assert "'{}'".format(cidade) in sql, "{} nao filtra {}".format(nome, cidade)
        assert "__CIDADES_" not in sql, "{} ficou com sentinela sem resolver".format(nome)


def test_case_de_exibicao_traduz_toda_cidade():
    for nome, sql in vars(grafana).items():
        if not (nome.startswith("SQL_") and isinstance(sql, str) and "nomedacidade" in sql):
            continue
        for chave, exibicao in CIDADES_ATENDIDAS.items():
            if "when '{}'".format(chave) in sql:
                assert "then '{}'".format(exibicao) in sql, "{}: {} sem nome de exibicao".format(nome, chave)


def test_servidor_js_espelha_a_lista():
    js = io.open("servidor.js", encoding="utf-8").read()
    bloco = js[js.index("const CIDADES_ATENDIDAS = ["):js.index("const CIDADES_SQL")]
    nomes = set(re.findall(r"'([^']+)'", bloco))
    assert nomes == set(CIDADES_ATENDIDAS.values())


def test_adamantina_tem_operadora_propria_e_o_vale_segue_com_as_tres():
    assert CLUSTERS["ADAMANTINA"]["operadoras"] == ["ADA"]
    assert CLUSTERS["VALE"]["operadoras"] == ["INSTACABLE", "WES", "THM"]


# ── Classificação de operadora: o prefixo decide, não o número da frente ─────

def _op(equipe, servico=""):
    from cabonnet.telegram import _operadora_da_os
    return _operadora_da_os({"nomedaequipe": equipe, "servico": servico})


def test_equipes_do_vale_seguem_nas_operadoras_de_sempre():
    assert _op("03- VAL - INSTALACAO F01") == "INSTACABLE"
    assert _op("03- VAL - INSTALACAO F04") == "INSTACABLE"
    assert _op("03- VAL - INSTALACAO F08") == "WES"
    assert _op("03- VAL - INSTALACAO F11") == "WES"
    assert _op("03- VAL - INSTALACAO F12") == "THM"
    assert _op("03- VAL - INSTALACAO F13") == "THM"


def test_adamantina_nao_cai_nas_frentes_do_vale():
    """As duas operações usam a mesma numeração: Vale escreve F01, Adamantina
    escreve F 01. Sem resolver o prefixo antes, "05 - ADA - INSTALACAO F 01"
    normaliza para F01 e seria contabilizada como INSTACABLE."""
    for equipe in (
        "05 - ADA - INSTALACAO F 01",
        "05 - ADA - INSTALACAO F 04",
        "05 - ADA - MANUTENCAO F 05",
        "05 - ADA - MANUTENCAO F 07",
        "05 - ADA - INSTALACAO FCT 05",
        "05 - ADA - REDE F 01",
        "05 - ADA - RETIRADA 01",
    ):
        assert _op(equipe) == "ADA", equipe


def test_prefixo_vence_ate_o_servico_rede():
    """REDE de Adamantina fica no cluster dela, não no grupo REDE do Vale."""
    assert _op("05 - ADA - REDE F 01", servico="REDE FTTH") == "ADA"
    assert _op("03- VAL - REDE F01", servico="REDE FTTH") == "REDE"


def test_equipe_de_fora_dos_clusters_continua_sem_operadora():
    assert _op("COPE - INSTALACAO") is None
    assert _op("01 - TUP - RETIRADA") is None
