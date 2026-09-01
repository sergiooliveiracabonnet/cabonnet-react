from cabonnet.telegram import _tg_caps


def test_telegram_preserva_capitalizacao_natural_do_corpo():
    texto = "🔴 <b>VT VIOLADO</b>\nCliente: João da Silva\n/os 9307351"
    assert _tg_caps(texto) == texto
