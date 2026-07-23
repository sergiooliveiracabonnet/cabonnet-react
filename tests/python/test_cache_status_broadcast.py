# -*- coding: utf-8 -*-
"""
Testes de cache.py::_dados_cache_update — foco no parâmetro detect_changes.

Contexto (ver cabonnet_server.log): o auto-refresh (3min) e outros gatilhos
independentes (resumo diário 8h/18h30, "Executadas Hoje" de hora em hora,
/atualizar, fallbacks de cache vazio) chamavam _dados_cache_update com seus
próprios fetches do Grafana, cada um comparando e sobrescrevendo o MESMO
snapshot global (state._status_snapshot). Como essas chamadas não são
serializadas entre si, uma chamada com dados um pouco mais velhos podia
rodar DEPOIS de uma com dados mais novos, revertendo o snapshot e fazendo
o ciclo seguinte "detectar" de novo a mesma mudança de status — o alerta
duplicado no grupo Alertas. Os logs mostram essa colisão de fato ocorrendo
(ex.: 05/06 07:59:43 e 08:00:20 — dois "[Status] 1 mudança(s) detectada(s)"
a 37s de distância, disparados por gatilhos diferentes).

A correção: só o ciclo de auto-refresh (detect_changes=True, o default) é
"dono" do snapshot. Chamadores que só querem linhas frescas de agendado
para montar um relatório pontual passam detect_changes=False e não tocam
no snapshot nem disparam broadcast.
"""

from unittest.mock import patch

import pytest

from cabonnet import cache, state


@pytest.fixture(autouse=True)
def reset_snapshots():
    state._status_snapshot.clear()
    state._status_snap_primed = False
    state._equipe_snapshot.clear()
    state._dados_cache["agendado"] = []
    yield
    state._status_snapshot.clear()
    state._status_snap_primed = False
    state._equipe_snapshot.clear()
    state._dados_cache["agendado"] = []


def _csv(rows):
    header = "numos,descsituacao,nomedaequipe,dataagendamento,nomedacidade,tiposervico,codigocliente"
    linhas = [header] + [
        ",".join(str(r.get(k, "")) for k in header.split(",")) for r in rows
    ]
    return "\n".join(linhas)


def _row(numos, situacao, equipe="F01"):
    return {"numos": numos, "descsituacao": situacao, "nomedaequipe": equipe,
            "dataagendamento": "01/07/2026", "nomedacidade": "Taubaté",
            "tiposervico": "Instalação", "codigocliente": "C1"}


@pytest.fixture
def no_db(monkeypatch):
    """Não persiste nada em disco — só interessa o snapshot/broadcast em memória."""
    monkeypatch.setattr(cache, "_db_save_status_changes", lambda changes: None)
    monkeypatch.setattr(cache, "_db_save_agendamento_changes", lambda changes: None)


def test_detect_changes_false_atualiza_cache_sem_tocar_no_snapshot(no_db):
    with patch("cabonnet.cache._tg_broadcast_status_changes") as mock_broadcast:
        cache._dados_cache_update(csv_agendado=_csv([_row("1111111", "Pendente")]),
                                   detect_changes=False)

    assert state._status_snapshot == {}          # snapshot global intocado
    assert state._status_snap_primed is False    # nem sequer "primed"
    assert len(state._dados_cache["agendado"]) == 1  # mas dados_cache foi atualizado
    mock_broadcast.assert_not_called()


def test_detect_changes_true_default_preserva_comportamento_atual(no_db):
    with patch("cabonnet.cache._tg_broadcast_status_changes") as mock_broadcast:
        cache._dados_cache_update(csv_agendado=_csv([_row("1111111", "Pendente")]))  # 1ª carga
        cache._dados_cache_update(csv_agendado=_csv([_row("1111111", "Atendimento")]))

    assert state._status_snapshot["1111111"] == "Atendimento"
    mock_broadcast.assert_called_once()
    changes = mock_broadcast.call_args[0][0]
    assert changes[0][1] == "Pendente"
    assert changes[0][2] == "Atendimento"


def test_fetch_secundario_com_dados_velhos_nao_reverte_nem_duplica_alerta(no_db):
    """Reproduz a corrida real do log: uma chamada 'secundária' com dados mais
    velhos chega depois de uma 'primária' já ter avançado o snapshot. Antes da
    correção, essa chamada secundária reescrevia o snapshot global e o ciclo
    seguinte reenviava a mesma mudança de status como se fosse nova."""
    with patch("cabonnet.cache._tg_broadcast_status_changes") as mock_broadcast:
        # Auto-refresh: 1ª carga (snapshot vazio -> primed) e detecta a transição real.
        cache._dados_cache_update(csv_agendado=_csv([_row("1111111", "Pendente")]))
        cache._dados_cache_update(csv_agendado=_csv([_row("1111111", "Atendimento")]))
        assert mock_broadcast.call_count == 1

        # Gatilho secundário (ex.: resumo diário / /atualizar) chega com um fetch
        # próprio, um pouco atrasado, que ainda mostra o estado antigo.
        cache._dados_cache_update(csv_agendado=_csv([_row("1111111", "Pendente")]),
                                   detect_changes=False)

        # Snapshot global não foi corrompido pela chamada secundária.
        assert state._status_snapshot["1111111"] == "Atendimento"

        # Próximo ciclo do auto-refresh, sem mudança real, não reenvia o alerta.
        cache._dados_cache_update(csv_agendado=_csv([_row("1111111", "Atendimento")]))

    assert mock_broadcast.call_count == 1
