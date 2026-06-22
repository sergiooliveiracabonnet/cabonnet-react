# -*- coding: utf-8 -*-
"""Testes dos helpers de parsing de data em cabonnet/utils.py."""

from datetime import datetime

from cabonnet.utils import _parse_datetime_br


def test_parse_datetime_br_com_hora():
    dt = _parse_datetime_br("22/06/2026 14:35")
    assert dt == datetime(2026, 6, 22, 14, 35)


def test_parse_datetime_br_sem_hora_assume_meia_noite():
    dt = _parse_datetime_br("22/06/2026")
    assert dt == datetime(2026, 6, 22, 0, 0)


def test_parse_datetime_br_string_vazia_retorna_none():
    assert _parse_datetime_br("") is None
    assert _parse_datetime_br(None) is None


def test_parse_datetime_br_invalida_retorna_none():
    assert _parse_datetime_br("não é uma data") is None
