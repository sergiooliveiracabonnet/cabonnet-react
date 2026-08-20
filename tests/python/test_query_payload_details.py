from cabonnet.query_payload import extract_os_details


CSV = """numos,nomecliente,observacoes,observacaocritica
1234567,Cliente A,Texto da execução,
7654321,Cliente B,,Prioridade técnica
1111111,Cliente C,Não solicitado,
"""


def test_extract_os_details_returns_only_requested_rows():
    assert extract_os_details([CSV], {"1234567", "7654321"}) == {
        "1234567": {"observacoes": "Texto da execução", "observacaocritica": ""},
        "7654321": {"observacoes": "", "observacaocritica": "Prioridade técnica"},
    }


def test_extract_os_details_normalizes_leading_zeroes_and_ignores_invalid_ids():
    assert extract_os_details([CSV], {"01234567", "invalida"}) == {
        "1234567": {"observacoes": "Texto da execução", "observacaocritica": ""},
    }
