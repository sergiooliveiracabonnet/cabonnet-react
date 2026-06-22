# -*- coding: utf-8 -*-
"""Testes da precisão de hora em datacadastro (Fila VT)."""

from cabonnet.grafana import SQL_PENDENTE, SQL_AGENDADO, SQL_FUTURO


def test_sql_pendente_datacadastro_inclui_hora():
    assert "to_char(o.d_datacadastro,    'DD/MM/YYYY HH24:MI') as datacadastro" in SQL_PENDENTE


def test_sql_agendado_datacadastro_inclui_hora():
    assert "to_char(o.d_datacadastro,    'DD/MM/YYYY HH24:MI') as datacadastro" in SQL_AGENDADO


def test_sql_futuro_datacadastro_inclui_hora():
    assert "to_char(o.d_datacadastro,    'DD/MM/YYYY HH24:MI') as datacadastro" in SQL_FUTURO
