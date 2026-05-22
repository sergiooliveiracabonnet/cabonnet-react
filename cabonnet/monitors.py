# -*- coding: utf-8 -*-
"""
cabonnet/monitors.py — Loops de monitoramento em background + scheduler de resumos.
"""

import logging
import sqlite3
import threading
import time as _time_mod
from datetime import datetime, date, timedelta

from cabonnet.config import (
    TELEGRAM_CHAT_ALERTAS, TELEGRAM_CHAT_ID,
    TELEGRAM_CHAT_INSTACABLE, TELEGRAM_CHAT_WES,
    TELEGRAM_CHAT_OPERACIONAL_THM,
)
from cabonnet import state
from cabonnet.cache import _sla_limite, _dados_cache_update
from cabonnet.utils import _parse_data_br
from cabonnet.telegram import (
    _telegram_enabled, _telegram_send, _telegram_send_long,
    _tg_esc, _abrev_equipe, _is_campo, _TG_DIV,
)
from cabonnet.grafana import grafana_post, frames_to_csv, SQL_AGENDADO
from cabonnet.builders import (
    _build_status_text, _build_executadas_hoje, _build_kpi,
    _build_pulso, _build_pendentes_semequipe, _build_resumo_diario,
    _build_manutencoes_hoje, _sugerir_equipes_bairro,
)
from cabonnet.juniper import _build_pppoe_resumo_diario

log     = logging.getLogger("CaboNetServer")
log_sla = logging.getLogger("CaboNetServer.SLA")
log_db  = logging.getLogger("CaboNetServer.DB")


def _sla_monitor_loop():
    log.info("[SLAMonitor] Iniciado")
    while True:
        _time_mod.sleep(300)
        if not TELEGRAM_CHAT_ALERTAS or not _telegram_enabled():
            continue
        try:
            hoje = date.today()
            if state._sla_alertados_data != hoje:
                state._sla_alertados = set()
                state._sla_alertados_data = hoje

            with state._dados_cache_lock:
                rows = list(state._dados_cache["agendado"])

            fila  = [r for r in rows if r.get("descsituacao") in ("Pendente", "Atendimento")
                     and not (r.get("servico") or "").upper().startswith("REDE")]
            novas = []
            for r in fila:
                numos = str(r.get("numos", ""))
                if numos in state._sla_alertados: continue
                dt    = _parse_data_br(r.get("datacadastro", ""))
                if not dt: continue
                age   = (hoje - dt).days
                lim   = _sla_limite(r.get("tiposervico","") or "")
                if age >= lim:
                    novas.append((r, age))
                    state._sla_alertados.add(numos)

            if not novas: continue
            hora_str = datetime.now().strftime("%H:%M")
            linhas   = [f"🔴 <b>ALERTA SLA — {len(novas)} OS vencida{'s' if len(novas) != 1 else ''}</b>",
                        f"<i>{hoje.strftime('%d/%m/%Y')} às {hora_str}</i>", _TG_DIV]
            for r, age in sorted(novas, key=lambda x: -x[1])[:10]:
                numos  = str(r.get("numos", "?"))
                nome   = _tg_esc((r.get("nomecliente") or "?")[:24])
                eq     = _tg_esc(_abrev_equipe(r.get("nomedaequipe", "")) or "Sem equipe")
                sit    = r.get("descsituacao") or ""
                sit_ic = "🔵" if "Atendimento" in sit else "🟡"
                linhas.append(f"{sit_ic} <b>{numos}</b> · {age}d · {nome} · {eq}")
            if len(novas) > 10: linhas.append(f"<i>… +{len(novas) - 10} OS</i>")
            linhas += ["", "<i>Use /sla para visão completa por equipe</i>"]
            _telegram_send("\n".join(linhas), chat_id_override=TELEGRAM_CHAT_ALERTAS)
            log.info("[SLAMonitor] Alerta enviado — %d novas OS vencidas", len(novas))
        except Exception as ex:
            log.warning("[SLAMonitor] Erro: %s", str(ex)[:120])


def _fila_monitor_loop():
    log.info("[FilaMonitor] Iniciado")
    _time_mod.sleep(900)
    while True:
        _time_mod.sleep(900)
        if not TELEGRAM_CHAT_ALERTAS or not _telegram_enabled():
            continue
        try:
            with state._dados_cache_lock:
                rows = list(state._dados_cache["agendado"])

            fila_atual = len([r for r in rows
                              if r.get("descsituacao") in ("Pendente", "Atendimento")
                              and not (r.get("servico") or "").upper().startswith("REDE")])
            prev = state._fila_prev_count
            state._fila_prev_count = fila_atual

            if prev == 0: continue

            crescimento = fila_atual - prev
            if crescimento >= 5 and prev > 0 and (crescimento / prev) >= 0.20:
                hora_str = datetime.now().strftime("%H:%M")
                pct = round(crescimento / prev * 100)
                txt = (f"📈 <b>ALERTA — Fila Crescendo</b>\n"
                       f"<i>{datetime.now().strftime('%d/%m/%Y')} às {hora_str}</i>\n"
                       f"{_TG_DIV}\n\n"
                       f"Fila passou de <b>{prev}</b> → <b>{fila_atual}</b> OS (+{crescimento} / +{pct}%)\n\n"
                       f"<i>Use /status · /pulso · /aging para investigar</i>")
                _telegram_send(txt, chat_id_override=TELEGRAM_CHAT_ALERTAS)
                log.info("[FilaMonitor] Alerta fila crescendo: %d → %d", prev, fila_atual)

            # OS sem equipe há mais de 4 horas
            agora  = datetime.now()
            sem_eq = []
            for r in rows:
                if r.get("descsituacao") not in ("Pendente", "Atendimento"): continue
                if (r.get("servico") or "").upper().startswith("REDE"): continue
                if (r.get("nomedaequipe") or "").strip(): continue
                dt = _parse_data_br(r.get("datacadastro", ""))
                if not dt: continue
                horas = (agora - datetime.combine(dt, datetime.min.time())).total_seconds() / 3600
                if horas > 4: sem_eq.append((r, horas))

            if sem_eq:
                sem_eq.sort(key=lambda x: -x[1])
                hora_str = agora.strftime("%H:%M")
                linhas   = [f"⚠️ <b>ALERTA — {len(sem_eq)} OS sem equipe há +4h</b>",
                             f"<i>{agora.strftime('%d/%m/%Y')} às {hora_str}</i>", _TG_DIV]
                for r, h in sem_eq[:10]:
                    numos   = _tg_esc(r.get("numos","—"))
                    cliente = _tg_esc(r.get("nomecliente","—"))[:30]
                    cidade  = _tg_esc(r.get("nomedacidade","—"))
                    linhas.append(f"• OS <b>{numos}</b> — {cliente} ({cidade}) — {round(h)}h")
                if len(sem_eq) > 10: linhas.append(f"<i>... e mais {len(sem_eq)-10} OS</i>")
                _telegram_send("\n".join(linhas), chat_id_override=TELEGRAM_CHAT_ALERTAS)
                log_sla.info("[SemEquipe] Alerta enviado — %d OS", len(sem_eq))

        except Exception as ex:
            log.warning("[FilaMonitor] Erro: %s", str(ex)[:120])


def _manut_monitor_loop():
    log.info("[ManutMonitor] Iniciado")
    while True:
        _time_mod.sleep(300)
        if not TELEGRAM_CHAT_ALERTAS or not _telegram_enabled():
            continue
        try:
            hoje = date.today()
            if state._manut_vistos_data != hoje:
                state._manut_vistos = set()
                state._manut_vistos_data = hoje

            with state._dados_cache_lock:
                rows = list(state._dados_cache["agendado"])

            hoje_str   = hoje.strftime("%d/%m/%Y")
            hora_str   = datetime.now().strftime("%H:%M")
            manut_hoje = [r for r in rows if "MANUTENC" in (r.get("tiposervico") or "").upper()
                          and (r.get("datacadastro") or "").startswith(hoje_str)]
            por_bairro = {}
            for r in manut_hoje:
                cidade = (r.get("nomedacidade") or "?").strip()
                bairro = (r.get("bairro") or "").strip()
                por_bairro.setdefault((cidade, bairro), []).append(r)

            novas = [r for r in manut_hoje if str(r.get("numos", "")) not in state._manut_vistos]
            for r in novas:
                state._manut_vistos.add(str(r.get("numos", "")))
            if not novas: continue

            for r in novas:
                numos    = str(r.get("numos", "?"))
                nome     = _tg_esc((r.get("nomecliente") or "?")[:32])
                cidade   = (r.get("nomedacidade") or "?").strip()
                bairro   = (r.get("bairro") or "").strip()
                servico  = _tg_esc((r.get("servico") or "?")[:40])
                eq_atual = _tg_esc(_abrev_equipe(r.get("nomedaequipe", "")) or "Sem equipe")
                sit      = r.get("descsituacao") or ""
                sit_ic   = "🔵" if "Atendimento" in sit else "🟡"
                cnt_bairro  = len(por_bairro.get((cidade, bairro), []))
                alerta_cto  = bairro and cnt_bairro >= 3
                linhas = [f"🔧 <b>Nova OS Manutenção — {sit_ic} OS {numos}</b>",
                          f"<i>{hoje_str} às {hora_str}</i>", _TG_DIV,
                          f"👤 <b>Cliente:</b> {nome}",
                          f"📍 <b>Cidade:</b> {_tg_esc(cidade)}" + (f" · <b>Bairro:</b> {_tg_esc(bairro)}" if bairro else ""),
                          f"🔧 <b>Serviço:</b> {servico}",
                          f"👷 <b>Equipe:</b> {eq_atual}"]
                if alerta_cto:
                    linhas += ["", f"🔴 <b>{cnt_bairro}ª manutenção no bairro {_tg_esc(bairro)} hoje</b>",
                               "<b>⚠️ Possível problema em CTO ou porta PON na área.</b>"]
                sugestoes = _sugerir_equipes_bairro(bairro, cidade, rows)
                if not sugestoes:
                    log.info("[ManutMonitor] OS %s sem equipe em Atendimento no bairro — sem alerta", numos)
                    continue
                linhas += ["", f"💡 <b>Equipes com OS no bairro {_tg_esc(bairro) if bairro else cidade}:</b>"]
                for eq, cnt in sugestoes[:4]:
                    linhas.append(f"  • <b>{_tg_esc(eq)}</b> — {cnt} OS na área")
                linhas += ["", f"<i>Use /os {numos} · /manutencoes para visão geral</i>"]
                _telegram_send("\n".join(linhas), chat_id_override=TELEGRAM_CHAT_ALERTAS)
                log.info("[ManutMonitor] Alerta enviado — OS %s (%s)", numos, cidade)
        except Exception as ex:
            log.warning("[ManutMonitor] Erro: %s", str(ex)[:120])


def _atendimento_travado_loop():
    log.info("[AtendTravado] Iniciado")
    _time_mod.sleep(600)
    while True:
        _time_mod.sleep(1800)
        if not TELEGRAM_CHAT_ALERTAS or not _telegram_enabled():
            continue
        try:
            agora = datetime.now()
            hoje  = agora.date()
            if state._atend_travados_data != hoje:
                state._atend_travados = set()
                state._atend_travados_data = hoje

            with state._dados_cache_lock:
                rows = list(state._dados_cache["agendado"])

            novas = []
            for r in rows:
                if r.get("descsituacao") != "Atendimento": continue
                numos = str(r.get("numos", ""))
                if numos in state._atend_travados: continue
                ini = (r.get("datainicio") or "").strip()
                if not ini: continue
                try:
                    dt_ini = datetime.strptime(ini[:16], "%d/%m/%Y %H:%M")
                    mins   = int((agora - dt_ini).total_seconds() / 60)
                    if mins >= 120:
                        novas.append((r, mins))
                        state._atend_travados.add(numos)
                except ValueError:
                    pass

            if not novas: continue
            novas.sort(key=lambda x: -x[1])
            hora_str = agora.strftime("%H:%M")
            hoje_str = hoje.strftime("%d/%m/%Y")
            linhas   = [f"⏳ <b>Alerta — OS em Atendimento há 2h+</b>",
                        f"<i>{hoje_str} às {hora_str} · {len(novas)} OS paradas</i>", _TG_DIV]
            for r, mins in novas[:10]:
                numos  = str(r.get("numos", "?"))
                nome   = _tg_esc((r.get("nomecliente") or "?")[:24])
                eq     = _tg_esc(_abrev_equipe(r.get("nomedaequipe", "")) or "Sem equipe")
                cidade = _tg_esc((r.get("nomedacidade") or "")[:14])
                h, m   = divmod(mins, 60)
                tempo  = f"{h}h{m:02d}min"
                linhas.append(f"🔵 <b>{numos}</b> · ⏱ <b>{tempo}</b> · {nome} · {eq} · {cidade}")
            if len(novas) > 10: linhas.append(f"<i>… +{len(novas) - 10} OS</i>")
            linhas += ["", "<i>Verifique com a equipe e atualize o status no sistema.</i>"]
            _telegram_send("\n".join(linhas), chat_id_override=TELEGRAM_CHAT_ALERTAS)
            log.info("[AtendTravado] Alerta enviado — %d OS travadas em Atendimento", len(novas))
        except Exception as ex:
            log.warning("[AtendTravado] Erro: %s", str(ex)[:120])


def _sem_exec_monitor_loop():
    log.info("[SemExecMonitor] Iniciado")
    _time_mod.sleep(900)
    while True:
        _time_mod.sleep(1800)
        if not TELEGRAM_CHAT_ALERTAS or not _telegram_enabled():
            continue
        try:
            hoje = date.today()
            if state._sem_exec_alertadas_data != hoje:
                state._sem_exec_alertadas = {}
                state._sem_exec_alertadas_data = hoje

            with state._dados_cache_lock:
                rows = list(state._dados_cache["agendado"])

            hoje_str     = hoje.strftime("%d/%m/%Y")
            hora_str     = datetime.now().strftime("%H:%M")
            sem_exec_hoje = [r for r in rows if "Sem Execução" in (r.get("descsituacao") or "")
                             and _parse_data_br(r.get("databaixa") or r.get("dataagendamento")) == hoje]
            por_equipe   = {}
            for r in sem_exec_hoje:
                eq = _abrev_equipe(r.get("nomedaequipe", "")) or "Sem equipe"
                por_equipe.setdefault(eq, []).append(r)

            alertar = []
            for eq, os_list in por_equipe.items():
                prev = state._sem_exec_alertadas.get(eq, 0)
                if len(os_list) >= 3 and len(os_list) > prev:
                    alertar.append((eq, os_list))
                    state._sem_exec_alertadas[eq] = len(os_list)

            if not alertar: continue
            linhas = [f"🚫 <b>Alerta — Sem Execução Acumulada</b>",
                      f"<i>{hoje_str} às {hora_str}</i>", _TG_DIV]
            for eq, os_list in sorted(alertar, key=lambda x: -len(x[1])):
                linhas.append(f"\n⚠️ <b>{_tg_esc(eq)}</b> — {len(os_list)} OS Sem Execução hoje")
                for r in os_list[:4]:
                    numos  = str(r.get("numos", "?"))
                    nome   = _tg_esc((r.get("nomecliente") or "?")[:24])
                    cidade = _tg_esc((r.get("nomedacidade") or "")[:14])
                    linhas.append(f"  /os{numos} · {nome} · {cidade}")
                if len(os_list) > 4: linhas.append(f"  <i>… +{len(os_list) - 4} OS</i>")
            linhas += ["", "<i>Use /semexec para o relatório completo.</i>"]
            _telegram_send("\n".join(linhas), chat_id_override=TELEGRAM_CHAT_ALERTAS)
            log.info("[SemExecMonitor] Alerta enviado — %d equipes", len(alertar))
        except Exception as ex:
            log.warning("[SemExecMonitor] Erro: %s", str(ex)[:120])


def _resumo_scheduler_loop():
    log.info("[Telegram] Scheduler iniciado — 08h/18h30 por grupo · Executadas hora cheia")
    enviados = set()
    while True:
        _time_mod.sleep(30)
        if not _telegram_enabled(): continue
        agora  = datetime.now()
        enviados = {k for k in enviados if k.startswith(str(agora.date()))}
        if agora.minute % 30 >= 2: continue

        chave_m          = f"{agora.date()}_manha"
        chave_t          = f"{agora.date()}_tarde"
        chave_h          = f"{agora.date()}_{agora.hour:02d}_exec"
        chave_pppoe      = f"{agora.date()}_pppoe"
        chave_alerta_pend  = f"{agora.date()}_alerta_pendentes"
        chave_pulso_12h    = f"{agora.date()}_pulso12h"
        chave_alerta_15h   = f"{agora.date()}_alerta15h"
        chave_ritmo_14h    = f"{agora.date()}_ritmo14h"

        if agora.hour == 8 and agora.minute < 2 and chave_m not in enviados:
            enviados.add(chave_m)
            threading.Thread(target=_build_resumo_diario, args=("manha",), daemon=True).start()
            if TELEGRAM_CHAT_ALERTAS:
                def _kpi_manha():
                    try:
                        _telegram_send("🌅 <b>Resumo Matinal — Cabonnet</b>\n" + _build_kpi().split("\n", 1)[1],
                                       chat_id_override=TELEGRAM_CHAT_ALERTAS)
                    except Exception as ex:
                        log.warning("[Scheduler] Erro KPI manha: %s", str(ex)[:120])
                threading.Thread(target=_kpi_manha, daemon=True).start()
            for _op, _chat in [("INSTACABLE", TELEGRAM_CHAT_INSTACABLE),
                                ("WES",        TELEGRAM_CHAT_WES),
                                ("THM",        TELEGRAM_CHAT_OPERACIONAL_THM)]:
                if _chat:
                    def _status_manha_op(op=_op, chat=_chat):
                        try:
                            titulo = f"🌅 <b>Resumo Matinal — {op}</b>"
                            corpo  = _build_status_text(operadora=op).split("\n", 1)[1]
                            _telegram_send(titulo + "\n" + corpo, chat_id_override=chat)
                        except Exception as ex:
                            log.warning("[Scheduler] Erro status manha %s: %s", op, str(ex)[:120])
                    threading.Thread(target=_status_manha_op, daemon=True).start()

        elif agora.hour == 18 and agora.minute >= 30 and chave_t not in enviados:
            enviados.add(chave_t)
            threading.Thread(target=_build_resumo_diario, args=("tarde",), daemon=True).start()
            if TELEGRAM_CHAT_ALERTAS:
                def _kpi_tarde():
                    try:
                        _telegram_send("🌆 <b>Fechamento do Dia — Cabonnet</b>\n" + _build_kpi().split("\n", 1)[1],
                                       chat_id_override=TELEGRAM_CHAT_ALERTAS)
                    except Exception as ex:
                        log.warning("[Scheduler] Erro KPI tarde: %s", str(ex)[:120])
                threading.Thread(target=_kpi_tarde, daemon=True).start()
            for _op, _chat in [("INSTACABLE", TELEGRAM_CHAT_INSTACABLE),
                                ("WES",        TELEGRAM_CHAT_WES),
                                ("THM",        TELEGRAM_CHAT_OPERACIONAL_THM)]:
                if _chat:
                    def _status_tarde_op(op=_op, chat=_chat):
                        try:
                            titulo = f"🌆 <b>Fechamento do Dia — {op}</b>"
                            corpo  = _build_status_text(operadora=op).split("\n", 1)[1]
                            _telegram_send(titulo + "\n" + corpo, chat_id_override=chat)
                        except Exception as ex:
                            log.warning("[Scheduler] Erro status tarde %s: %s", op, str(ex)[:120])
                    threading.Thread(target=_status_tarde_op, daemon=True).start()

        if agora.hour == 12 and agora.minute < 2 and chave_pulso_12h not in enviados:
            enviados.add(chave_pulso_12h)
            if TELEGRAM_CHAT_ALERTAS:
                def _pulso_12h():
                    try:
                        pulso  = _build_pulso()
                        linhas = pulso.split("\n"); linhas[0] = "☀️ <b>Pulso Intermediário — 12h</b>"
                        _telegram_send("\n".join(linhas), chat_id_override=TELEGRAM_CHAT_ALERTAS)
                    except Exception as ex:
                        log.warning("[Scheduler] Erro pulso 12h: %s", str(ex)[:120])
                threading.Thread(target=_pulso_12h, daemon=True).start()

        if agora.hour == 15 and agora.minute < 2 and chave_alerta_15h not in enviados:
            enviados.add(chave_alerta_15h)
            if TELEGRAM_CHAT_ALERTAS:
                def _alerta_equipes_15h():
                    try:
                        with state._dados_cache_lock:
                            rows = list(state._dados_cache["agendado"])
                        hoje     = date.today()
                        sem_rede = [r for r in rows if not (r.get("servico") or "").upper().startswith("REDE")]
                        is_hoje  = lambda r: _parse_data_br(r.get("dataexecucao") or r.get("databaixa")) == hoje
                        eq_exec  = {}; eq_fila = {}
                        for r in sem_rede:
                            raw = r.get("nomedaequipe", "") or ""
                            if not _is_campo(raw): continue
                            eq = _abrev_equipe(raw) or "(sem equipe)"
                            if r.get("descsituacao") == "Concluída" and "Sem" not in (r.get("descsituacao") or "") and is_hoje(r):
                                eq_exec[eq] = eq_exec.get(eq, 0) + 1
                            if r.get("descsituacao") in ("Pendente", "Atendimento"):
                                eq_fila[eq] = eq_fila.get(eq, 0) + 1
                        paradas = [(eq, eq_fila[eq]) for eq in eq_fila if eq_exec.get(eq, 0) == 0 and eq_fila[eq] >= 1]
                        if not paradas: return
                        paradas.sort(key=lambda x: -x[1])
                        hora_str = datetime.now().strftime("%H:%M"); hoje_str = hoje.strftime("%d/%m/%Y")
                        linhas   = [f"⛔ <b>Alerta 15h — Equipes sem Execução</b>",
                                    f"<i>{hoje_str} às {hora_str}</i>", _TG_DIV]
                        for eq, fila_cnt in paradas:
                            linhas.append(f"  ⚠️ <b>{_tg_esc(eq)}</b> — {fila_cnt} OS na fila, nenhuma executada")
                        linhas += ["", "<i>Use /equipe · /turno · /ranking para investigar</i>"]
                        _telegram_send("\n".join(linhas), chat_id_override=TELEGRAM_CHAT_ALERTAS)
                    except Exception as ex:
                        log.warning("[Scheduler] Erro alerta 15h: %s", str(ex)[:120])
                threading.Thread(target=_alerta_equipes_15h, daemon=True).start()

        if agora.hour == 14 and agora.minute < 2 and chave_ritmo_14h not in enviados:
            enviados.add(chave_ritmo_14h)
            if TELEGRAM_CHAT_ALERTAS:
                def _alerta_ritmo_14h():
                    try:
                        with state._dados_cache_lock:
                            rows = list(state._dados_cache["agendado"])
                        agora_r  = datetime.now(); hoje = agora_r.date()
                        sem_rede = [r for r in rows if not (r.get("servico") or "").upper().startswith("REDE")]
                        is_hoje  = lambda r: _parse_data_br(r.get("dataexecucao") or r.get("databaixa")) == hoje
                        exec_h   = [r for r in sem_rede if r.get("descsituacao") == "Concluída" and "Sem" not in (r.get("descsituacao") or "") and is_hoje(r)]
                        fila     = [r for r in sem_rede if r.get("descsituacao") in ("Pendente", "Atendimento")]
                        total    = len(exec_h) + len(fila)
                        taxa     = round(len(exec_h) / total * 100) if total else 0
                        if taxa >= 50: return
                        hora_ini  = agora_r.replace(hour=7, minute=0, second=0, microsecond=0)
                        hora_fim  = agora_r.replace(hour=18, minute=30, second=0, microsecond=0)
                        decorrido = max((agora_r - hora_ini).total_seconds() / 3600, 0.25)
                        restante  = max((hora_fim - agora_r).total_seconds() / 3600, 0)
                        ritmo     = len(exec_h) / decorrido
                        proj      = round(len(exec_h) + ritmo * restante)
                        pct_proj  = round(proj / total * 100) if total else 0
                        bar       = "▓" * min(10, round(taxa / 10)) + "░" * max(0, 10 - round(taxa / 10))
                        hora_str  = agora_r.strftime("%H:%M"); hoje_str = hoje.strftime("%d/%m/%Y")
                        linhas    = [f"🔴 <b>Alerta 14h — Ritmo Abaixo do Esperado</b>",
                                     f"<i>{hoje_str} às {hora_str}</i>", _TG_DIV, "",
                                     f"✅ Executadas até agora: <b>{len(exec_h)}</b> de {total} OS",
                                     f"📉 Taxa atual: <b>{taxa}%</b>  <code>{bar}</code>",
                                     f"🔭 Projeção ao fechar: <b>~{proj} OS ({pct_proj}%)</b>", "",
                                     "<b>Intervenção necessária para atingir a meta de 80%.</b>", "",
                                     "<i>Use /ranking · /equipes · /turno para identificar gargalos</i>"]
                        _telegram_send("\n".join(linhas), chat_id_override=TELEGRAM_CHAT_ALERTAS)
                        log.info("[Scheduler] Alerta ritmo 14h enviado — taxa %d%%", taxa)
                    except Exception as ex:
                        log.warning("[Scheduler] Erro alerta ritmo 14h: %s", str(ex)[:120])
                threading.Thread(target=_alerta_ritmo_14h, daemon=True).start()

        if agora.hour == 17 and agora.minute < 2 and chave_alerta_pend not in enviados:
            enviados.add(chave_alerta_pend)
            def _alerta_pendentes():
                try:
                    txt = _build_pendentes_semequipe()
                    if "Sem OS pendentes" not in txt:
                        _telegram_send("⚠️ <b>Alerta — OS sem agendamento de equipe</b>\n" + txt)
                except Exception as ex:
                    log.warning("[Scheduler] Erro alerta pendentes: %s", str(ex)[:120])
            threading.Thread(target=_alerta_pendentes, daemon=True).start()

        if agora.hour == 18 and agora.minute >= 30 and chave_pppoe not in enviados:
            enviados.add(chave_pppoe)
            threading.Thread(target=_build_pppoe_resumo_diario, daemon=True).start()

        if agora.hour != 8 and agora.minute < 2 and 7 <= agora.hour <= 20 and chave_h not in enviados:
            enviados.add(chave_h)
            def _enviar_executadas(hora=agora.hour):
                try:
                    csv_a = frames_to_csv(grafana_post(SQL_AGENDADO))
                    _dados_cache_update(csv_agendado=csv_a or "")
                    texto_global = _build_executadas_hoje(operadora=None)
                    if texto_global: _telegram_send(texto_global)
                    for _op, _chat in [("INSTACABLE", TELEGRAM_CHAT_INSTACABLE),
                                       ("WES",        TELEGRAM_CHAT_WES),
                                       ("THM",        TELEGRAM_CHAT_OPERACIONAL_THM)]:
                        if _chat:
                            texto_op = _build_executadas_hoje(operadora=_op)
                            if texto_op: _telegram_send(texto_op, chat_id_override=_chat)
                    log.info("[Telegram] Executadas Hoje enviado por grupo — %02dh", hora)
                except Exception as ex:
                    log.warning("[Telegram] Erro Executadas Hoje: %s", str(ex)[:120])
            threading.Thread(target=_enviar_executadas, daemon=True).start()
