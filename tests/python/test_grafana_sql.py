# -*- coding: utf-8 -*-
"""Testes das novas SQL templates (Bloco A: fotos/checklist/motivo; Bloco B: geo)."""

from cabonnet.grafana import (
    SQL_CHECKLIST_TEMPLATE,
    SQL_DETALHES_TEMPLATE,
    SQL_FOTO_BLOB_TEMPLATE,
    SQL_FOTOS_TEMPLATE,
    SQL_MOTIVO_INCONCLUSIVO_TEMPLATE,
    SQL_OS_EXECUCAO_GEO,
)


def test_sql_fotos_template_referencia_tabela_e_numos():
    sql = SQL_FOTOS_TEMPLATE.format(numos=9999999)
    assert "mobile.vis_os_fotos" in sql
    assert "WHERE numos = 9999999" in sql
    assert "imagem" not in sql  # bytea nunca entra na listagem de metadados


def test_sql_foto_blob_template_referencia_numos_e_codfoto():
    sql = SQL_FOTO_BLOB_TEMPLATE.format(numos=9999999, codfoto=3)
    assert "mobile.vis_os_fotos" in sql
    assert "numos = 9999999" in sql
    assert "codfoto = 3" in sql
    assert "encode(imagem, 'base64')" in sql


def test_sql_checklist_template_referencia_tabela_e_numos():
    sql = SQL_CHECKLIST_TEMPLATE.format(numos=9999999)
    assert "mobile.vis_os_checklist_status" in sql
    assert "WHERE numos = 9999999" in sql


def test_sql_detalhes_template_nao_referencia_mobile():
    sql = SQL_DETALHES_TEMPLATE.format(numos=9999999)
    assert "mobile." not in sql


def test_sql_motivo_inconclusivo_template_referencia_tabelas_e_numos():
    sql = SQL_MOTIVO_INCONCLUSIVO_TEMPLATE.format(numos=9999999)
    assert "mobile.vis_os_ordemservico" in sql
    assert "mobile.vis_os_motivosinconclusivos" in sql
    assert "WHERE mo.numos = 9999999" in sql


def test_sql_os_execucao_geo_filtra_atendimento_e_cidades_vale():
    sql = SQL_OS_EXECUCAO_GEO
    assert "situacaoos = 2" in sql
    assert "TAUBATE" in sql and "SAO JOSE DOS CAMPOS" in sql
    assert "latitudeinicio" in sql and "longitudeinicio" in sql
