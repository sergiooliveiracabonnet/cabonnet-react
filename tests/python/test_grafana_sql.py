# -*- coding: utf-8 -*-
"""Testes das SQL templates de grafana.py (fotos/checklist/motivo, geo, precisão de hora)."""

from cabonnet.grafana import (
    SQL_AGENDADO,
    SQL_CHECKLIST_TEMPLATE,
    SQL_DETALHES_TEMPLATE,
    SQL_FOTO_BLOB_TEMPLATE,
    SQL_FOTOS_TEMPLATE,
    SQL_FUTURO,
    SQL_MOTIVO_INCONCLUSIVO_TEMPLATE,
    SQL_OS_EXECUCAO_GEO,
    SQL_BACKLOG_TEMPLATE,
    SQL_PENDENTE,
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


def test_sql_pendente_datacadastro_inclui_hora():
    assert "to_char(o.d_datacadastro,    'DD/MM/YYYY HH24:MI') as datacadastro" in SQL_PENDENTE


def test_sql_agendado_datacadastro_inclui_hora():
    assert "to_char(o.d_datacadastro,    'DD/MM/YYYY HH24:MI') as datacadastro" in SQL_AGENDADO


def test_sql_futuro_datacadastro_inclui_hora():
    assert "to_char(o.d_datacadastro,    'DD/MM/YYYY HH24:MI') as datacadastro" in SQL_FUTURO


def test_revisita_instalacao_usa_chamado_aberto_ate_30_dias_depois():
    sql = " ".join(SQL_BACKLOG_TEMPLATE.lower().split())
    bloco = sql.split("as revisita_inst", 1)[0]
    assert "o2.d_datacadastro > o.d_dataexecucao" in bloco
    assert "o2.d_datacadastro <= o.d_dataexecucao + interval '30 days'" in bloco
    assert "o2.codigocontrato = o.codigocontrato" in bloco
    assert "upper(ts.descricao) like '%instalac%'" in bloco
    assert "date_trunc('month', o2.d_dataexecucao)" not in bloco
