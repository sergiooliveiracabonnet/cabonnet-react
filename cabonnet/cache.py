# -*- coding: utf-8 -*-
"""
cabonnet/cache.py — Atualização de caches em memória + detecção de status.
"""

import logging
import threading
import time as _time_mod
from datetime import date

from cabonnet.config import _SLA_LIMITS, _REVISITA_TTL_DIAS, TELEGRAM_CHAT_ALERTAS
from cabonnet import state
from cabonnet.db import _db_save_agendamento_changes, _db_save_status_changes
from cabonnet.utils import _parse_csv_rows, _parse_data_br, isConcluida_str
from cabonnet.telegram import (
    _telegram_enabled, _tg_esc, _telegram_send, _telegram_send,
    _tg_broadcast_status_changes, _operadora_for_chat, _operadora_da_os,
    _TG_DIV,
)

log     = logging.getLogger("CaboNetServer")
log_sla = logging.getLogger("CaboNetServer.SLA")


def _sla_limite(tiposervico):
    """Retorna o limite de SLA em dias para um tipo de serviço."""
    t = (tiposervico or "").upper()
    for chave, dias in _SLA_LIMITS.items():
        if chave in t:
            return dias
    return _SLA_LIMITS["DEFAULT"]


def _calc_sla_exc(fila, hoje=None):
    """Conta OS na fila com SLA vencido (aging >= limite por tipo)."""
    if hoje is None:
        hoje = date.today()
    sla_exc = 0
    for r in fila:
        dt = _parse_data_br(r.get("datacadastro", ""))
        if dt:
            aging  = (hoje - dt).days
            tipo   = r.get("tiposervico", "") or ""
            limite = _sla_limite(tipo)
            if aging >= limite:
                sla_exc += 1
    return sla_exc


def _verificar_revisitas(novas_os):
    """Verifica se alguma OS nova pertence a cliente com OS concluída nos últimos 30 dias."""
    revisitas = []
    agora_ts  = _time_mod.time()
    ttl_s     = _REVISITA_TTL_DIAS * 86400
    with state._concluidas_recentes_lock:
        for r in novas_os:
            cod = r.get("codigocliente","")
            if not cod or cod not in state._concluidas_recentes:
                continue
            anteriores = [(n, ts) for n, ts in state._concluidas_recentes[cod] if agora_ts - ts < ttl_s]
            if anteriores:
                revisitas.append((r, anteriores))

    if not revisitas or not TELEGRAM_CHAT_ALERTAS or not _telegram_enabled():
        return

    for r, anteriores in revisitas[:5]:   # limita a 5 por ciclo para não spam
        numos    = _tg_esc(r.get("numos","—"))
        cliente  = _tg_esc(r.get("nomecliente","—"))[:30]
        cidade   = _tg_esc(r.get("nomedacidade","—"))
        equipe   = _tg_esc(r.get("nomedaequipe","—"))[:25]
        ant_list = ", ".join(n for n, _ in anteriores[:3])

        markup = {"inline_keyboard": [[
            {"text": "🔧 Material",  "callback_data": f"revisita_mat:{r.get('numos','')}"},
            {"text": "⚙️ Técnico",   "callback_data": f"revisita_tec:{r.get('numos','')}"},
        ], [
            {"text": "👤 Cliente",   "callback_data": f"revisita_cli:{r.get('numos','')}"},
            {"text": "📋 Outro",     "callback_data": f"revisita_out:{r.get('numos','')}"},
        ]]}
        txt = (
            f"🔄 <b>Possível Revisita</b>\n"
            f"OS <b>{numos}</b> — {cliente} ({cidade})\n"
            f"Equipe: {equipe}\n"
            f"{_TG_DIV}\n"
            f"OS anteriores concluídas: {ant_list}\n\n"
            f"<b>Qual o motivo da revisita?</b>"
        )
        operadora = _operadora_da_os(r)
        chat_dest = _operadora_for_chat(operadora) or TELEGRAM_CHAT_ALERTAS
        _telegram_send(txt, chat_id_override=chat_dest, reply_markup=markup)
        log.info("[Revisita] Alerta enviado — OS %s (cliente %s)", numos, cod if len(cod) < 20 else cod[:20]+"…")


def _dados_cache_update(csv_pendente="", csv_agendado="", csv_futuro="", detect_changes=True, origem="?"):
    """Atualiza state._dados_cache e, quando detect_changes=True, compara contra o
    snapshot global de status/equipe para detectar mudanças e disparar alertas.

    detect_changes=False é usado por chamadores que só precisam de linhas frescas
    de 'agendado' para montar um relatório pontual (resumo diário, /atualizar,
    fallback de cache vazio etc.) — eles buscam do Grafana de forma independente
    do ciclo de auto-refresh de 3min, e SEMPRE tratar essas buscas como fonte de
    verdade do snapshot global causava corrida: duas atualizações concorrentes
    (uma com dados mais novos, outra com dados um pouco mais velhos) podiam se
    sobrescrever fora de ordem e reenviar a MESMA mudança de status como se fosse
    nova. O ciclo de auto-refresh (_refresh_cache_from_grafana) é o único writer
    do snapshot — só ele deve chamar com detect_changes=True.
    """
    rows_agendado = _parse_csv_rows(csv_agendado)

    if not detect_changes:
        with state._dados_cache_lock:
            state._dados_cache["agendado"] = rows_agendado
            state._dados_cache["ts"]       = _time_mod.time()
        log.info("[Cache] Dados atualizados (sem detecção de mudança) — %d linhas", len(rows_agendado))
        return

    all_rows = (
        _parse_csv_rows(csv_pendente) +
        _parse_csv_rows(csv_agendado) +
        _parse_csv_rows(csv_futuro)
    )
    row_map     = {r["numos"]: r for r in all_rows if r.get("numos")}
    new_snap    = {n: r.get("descsituacao", "")  for n, r in row_map.items()}
    new_eq_snap = {n: (r.get("nomedaequipe", ""), r.get("dataagendamento", "")) for n, r in row_map.items()}

    tid = threading.get_ident()
    log.info("[Cache][diag] _dados_cache_update início — origem=%s thread=%s", origem, tid)

    with state._status_snapshot_lock:
        old_snap              = state._status_snapshot.copy()
        state._status_snapshot.clear()
        state._status_snapshot.update(new_snap)
        first_load            = not state._status_snap_primed
        state._status_snap_primed = True

    with state._equipe_snapshot_lock:
        old_eq_snap = state._equipe_snapshot.copy()
        state._equipe_snapshot.clear()
        state._equipe_snapshot.update(new_eq_snap)

    with state._dados_cache_lock:
        state._dados_cache["agendado"] = rows_agendado
        state._dados_cache["ts"]       = _time_mod.time()
    log.info("[Cache] Dados atualizados — %d linhas (origem=%s thread=%s)", len(rows_agendado), origem, tid)

    if first_load:
        log.info("[Status] Snapshot inicial — %d OS indexadas", len(new_snap))
        return

    # Troca de equipe e/ou reagendamento — independente de descsituacao mudar.
    # Cobre tanto OS que já existia e mudou de equipe/data quanto OS nova que
    # aparece já com um agendamento definido (primeiro registro do seu histórico).
    eq_changes = [
        row_map[n] for n, val in new_eq_snap.items()
        if val[1] and (n not in old_eq_snap or old_eq_snap[n] != val)
    ]
    if eq_changes:
        log.info("[Agendamento] %d troca(s) de equipe/agendamento detectada(s)", len(eq_changes))
        threading.Thread(target=_db_save_agendamento_changes, args=(eq_changes,), daemon=True).start()

    changes = [
        (row_map[n], old_st, new_snap[n])
        for n, old_st in old_snap.items()
        if n in new_snap and old_st != new_snap[n]
    ]
    if not changes:
        return
    changes_desc = ", ".join(f"{r.get('numos','?')}({old}->{new})" for r, old, new in changes)
    log.info("[Status] %d mudança(s) detectada(s) (origem=%s thread=%s) — %s",
              len(changes), origem, tid, changes_desc)
    threading.Thread(target=_db_save_status_changes, args=(changes,), daemon=True).start()
    _tg_broadcast_status_changes(changes)
    threading.Thread(target=state.sse_broadcast,
        args=('os-status-changed', {'count': len(changes)}), daemon=True).start()

    agora_ts = _time_mod.time()
    ttl_s    = _REVISITA_TTL_DIAS * 86400

    concluidas_agora = [(r, old) for r, old, new in changes if isConcluida_str(new)]
    with state._concluidas_recentes_lock:
        for r, _ in concluidas_agora:
            cod = r.get("codigocliente") or ""
            if not cod:
                continue
            if cod not in state._concluidas_recentes:
                state._concluidas_recentes[cod] = []
            state._concluidas_recentes[cod].append((r.get("numos",""), agora_ts))
        for cod in list(state._concluidas_recentes):
            state._concluidas_recentes[cod] = [(n, ts) for n, ts in state._concluidas_recentes[cod] if agora_ts - ts < ttl_s]
            if not state._concluidas_recentes[cod]:
                del state._concluidas_recentes[cod]

    novas_os = [r for r in all_rows
                if r.get("numos") not in old_snap
                and r.get("codigocliente")
                and r.get("descsituacao") in ("Pendente", "Atendimento")]
    if novas_os:
        threading.Thread(target=_verificar_revisitas, args=(novas_os,), daemon=True).start()
