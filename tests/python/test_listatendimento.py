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
    assert "📍 <b>TAUBATE</b> — 1 OS" in mensagem
    assert "Manut · 07/08/2026" in mensagem


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


def test_listatendimento_organiza_por_cidade_e_depois_por_equipe(monkeypatch):
    def row(numos, cidade, equipe):
        return {
            "numos": numos,
            "descsituacao": "Atendimento",
            "servico": "INSTALACAO",
            "nomedaequipe": equipe,
            "nomecliente": f"CLIENTE {numos}",
            "nomedacidade": cidade,
            "tiposervico": "INSTALACAO",
            "dataagendamento": "07/08/2026",
        }

    monkeypatch.setitem(state._dados_cache, "agendado", [
        row("7000003", "TAUBATÉ", "EQUIPE F13"),
        row("7000001", "SAO JOSE DOS CAMPOS", "EQUIPE F01"),
        row("7000002", "TAUBATÉ", "EQUIPE F12"),
    ])

    mensagem = _build_listatendimento()

    sao_jose = mensagem.index("📍 <b>SAO JOSE DOS CAMPOS</b>")
    taubate = mensagem.index("📍 <b>TAUBATÉ</b>")
    equipe_f12 = mensagem.index("👤 <b>F12</b>")
    os_f12 = mensagem.index("/os7000002")
    equipe_f13 = mensagem.index("👤 <b>F13</b>")
    os_f13 = mensagem.index("/os7000003")

    assert sao_jose < taubate < equipe_f12 < os_f12 < equipe_f13 < os_f13
