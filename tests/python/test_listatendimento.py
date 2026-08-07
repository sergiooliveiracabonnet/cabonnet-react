import pytest

from cabonnet import state
from cabonnet.builders import _build_listatendimento


def test_listatendimento_exibe_nome_do_cliente_escapado(monkeypatch):
    monkeypatch.setitem(state._dados_cache, "agendado", [
        {
            "numos": "7654321",
            "descsituacao": "Atendimento",
            "servico": "ASSISTENCIA TECNICA",
            "nomedaequipe": "EQUIPE F01",
            "nomecliente": "JOÃO & MARIA <SILVA>",
            "nomedacidade": "TAUBATE",
            "tiposervico": "MANUTENCAO",
            "dataagendamento": "07/08/2026",
        },
    ])

    mensagem = _build_listatendimento()

    assert "/os7654321 · JOÃO &amp; MARIA &lt;SILVA&gt;" in mensagem
    assert "TAUBATE · Manut · 07/08/2026" in mensagem


@pytest.mark.parametrize(("operadora", "equipe", "cliente"), [
    ("INSTACABLE", "EQUIPE F01", "CLIENTE INSTACABLE"),
    ("WES", "EQUIPE F08", "CLIENTE WES"),
    ("THM", "EQUIPE F12", "CLIENTE THM"),
    (None, "EQUIPE F01", "CLIENTE ALERTAS"),
])
def test_listatendimento_exibe_cliente_em_todos_os_grupos_de_campo(
    monkeypatch, operadora, equipe, cliente,
):
    monkeypatch.setitem(state._dados_cache, "agendado", [
        {
            "numos": "7654321",
            "descsituacao": "Atendimento",
            "servico": "INSTALACAO",
            "nomedaequipe": equipe,
            "nomecliente": cliente,
            "nomedacidade": "SAO JOSE DOS CAMPOS",
            "tiposervico": "INSTALACAO",
            "dataagendamento": "07/08/2026",
        },
    ])

    mensagem = _build_listatendimento(operadora)

    assert f"/os7654321 · {cliente}" in mensagem
