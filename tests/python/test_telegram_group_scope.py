from unittest.mock import patch

from cabonnet import telegram
from cabonnet import builders


def _row(team="INST F08", tipo="INSTALACAO", servico="INSTALACAO", numos="9000001"):
    return {
        "numos": numos,
        "nomedaequipe": team,
        "tiposervico": tipo,
        "servico": servico,
        "nomecliente": "Cliente Teste",
    }


def test_supplier_scope_keeps_only_own_non_manut_orders():
    rows = [
        _row(team="INST F08", numos="1"),
        _row(team="INST F04", numos="2"),
        _row(team="INST F08", tipo="MANUTENCAO", servico="MANUTENCAO", numos="3"),
        _row(team="MANUT F08", tipo="SERVICO", numos="4"),
    ]

    filtered = telegram._filter_by_operadora(rows, "WES")

    assert [row["numos"] for row in filtered] == ["1"]


def test_productivity_receives_all_status_categories(monkeypatch):
    monkeypatch.setattr(telegram, "TELEGRAM_CHAT_ALERTAS", "alertas")
    monkeypatch.setattr(telegram, "TELEGRAM_CHAT_ID", "produtividade")
    monkeypatch.setattr(telegram, "TELEGRAM_CHAT_WES", "wes")
    monkeypatch.setattr(telegram, "TELEGRAM_CHAT_INSTACABLE", "inst")
    monkeypatch.setattr(telegram, "TELEGRAM_CHAT_OPERACIONAL_THM", "thm")
    monkeypatch.setattr(telegram, "TELEGRAM_CHAT_REDE", "rede")
    monkeypatch.setattr(telegram, "_telegram_enabled", lambda: True)
    changes = [
        (_row(tipo="INSTALACAO", numos="1"), "Pendente", "Atendimento"),
        (_row(tipo="SERVICO", servico="SERVICO", numos="2"), "Pendente", "Atendimento"),
        (_row(tipo="MANUTENCAO", servico="MANUTENCAO", numos="3"), "Pendente", "Atendimento"),
    ]

    with patch.object(telegram, "_telegram_send") as send:
        telegram._tg_broadcast_status_changes(changes)

    productivity_messages = [
        call.args[0]
        for call in send.call_args_list
        if call.kwargs.get("chat_id_override") == "produtividade"
    ]
    assert len(productivity_messages) == 3
    assert all(f"OS {numos}" in "\n".join(productivity_messages) for numos in ("1", "2", "3"))


def test_manut_status_never_reaches_supplier_group(monkeypatch):
    monkeypatch.setattr(telegram, "TELEGRAM_CHAT_ALERTAS", "alertas")
    monkeypatch.setattr(telegram, "TELEGRAM_CHAT_ID", "produtividade")
    monkeypatch.setattr(telegram, "TELEGRAM_CHAT_WES", "wes")
    monkeypatch.setattr(telegram, "TELEGRAM_CHAT_INSTACABLE", "inst")
    monkeypatch.setattr(telegram, "TELEGRAM_CHAT_OPERACIONAL_THM", "thm")
    monkeypatch.setattr(telegram, "TELEGRAM_CHAT_REDE", "rede")
    monkeypatch.setattr(telegram, "_telegram_enabled", lambda: True)
    changes = [
        (_row(team="INST F08", tipo="MANUTENCAO", servico="MANUTENCAO"), "Pendente", "Atendimento"),
    ]

    with patch.object(telegram, "_telegram_send") as send:
        telegram._tg_broadcast_status_changes(changes)

    destinations = {call.kwargs.get("chat_id_override") for call in send.call_args_list}
    assert destinations == {"alertas", "produtividade"}


def test_os_details_blocks_other_supplier_before_loading_sensitive_sections(monkeypatch):
    wes_order = _row(team="INST F08", numos="9000001")
    monkeypatch.setattr(builders, "grafana_post", lambda sql: {"data": "ignored"})
    monkeypatch.setattr(builders, "frames_to_dict_list", lambda payload: [wes_order])

    result = builders._build_os_detalhes("9000001", operadora="INSTACABLE")

    assert result.startswith("🔒")


def test_os_search_hides_manut_and_other_supplier(monkeypatch):
    rows = [
        {**_row(team="INST F08", numos="1"), "nomecliente": "Maria"},
        {**_row(team="INST F04", numos="2"), "nomecliente": "Maria"},
        {**_row(team="INST F08", tipo="MANUTENCAO", numos="3"), "nomecliente": "Maria"},
    ]
    monkeypatch.setitem(builders.state._dados_cache, "agendado", rows)

    text, buttons = builders._build_os_busca("Maria", operadora="WES")

    assert "OS 1" in text
    assert "OS 2" not in text
    assert "OS 3" not in text
    assert buttons is None
