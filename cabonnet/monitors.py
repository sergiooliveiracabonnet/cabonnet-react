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
    TELEGRAM_CHAT_INSTACABLE, TELEGRAM_CHAT_WES, TELEGRAM_CHAT_REDE,
    TELEGRAM_CHAT_OPERACIONAL_THM,
)
from cabonnet import state
from cabonnet.cache import _sla_limite, _dados_cache_update
from cabonnet.utils import _parse_data_br, _parse_datetime_br
from cabonnet.telegram import (
    _telegram_enabled, _telegram_send, _telegram_send_long,
    _tg_esc, _abrev_equipe, _is_campo, _operadora_da_os,
    _tg_header, _tg_footer, _tg_endereco,
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


# ─── Detecção de pico diário (17h) ───────────────────────────────────────────

def _check_pico_diario():
    """Conta OS abertas hoje, compara com média móvel 30d e salva alerta se Z ≥ 2σ."""
    import math
    from cabonnet.utils import _parse_csv_rows
    from cabonnet.db import _db_save_pico_alerta

    try:
        with state._query_cache_lock:
            csv_pend = state._query_cache.get("pendente", "")
            csv_agen = state._query_cache.get("agendado", "")
            csv_fut  = state._query_cache.get("futuro",   "")

        all_rows = (
            _parse_csv_rows(csv_pend) +
            _parse_csv_rows(csv_agen) +
            _parse_csv_rows(csv_fut)
        )

        if not all_rows:
            log.info("[PicoCheck] Cache vazio, análise ignorada")
            return

        # Contar OS por dia de abertura (datacadastro)
        dia_cnt: dict[str, int] = {}
        for r in all_rows:
            dc = (r.get("datacadastro") or "").split(" ")[0]
            if dc and len(dc) == 10:
                dia_cnt[dc] = dia_cnt.get(dc, 0) + 1

        if len(dia_cnt) < 5:
            log.info("[PicoCheck] Dados insuficientes para calcular pico (%d dias)", len(dia_cnt))
            return

        hoje_str = date.today().strftime("%Y-%m-%d")
        count_hoje = dia_cnt.get(hoje_str, 0)

        if count_hoje == 0:
            log.info("[PicoCheck] Sem OS abertas hoje, análise ignorada")
            return

        # Média e desvio padrão (exclui hoje do baseline)
        baseline = [v for k, v in dia_cnt.items() if k != hoje_str]
        if len(baseline) < 3:
            log.info("[PicoCheck] Baseline insuficiente (%d dias)", len(baseline))
            return

        media = sum(baseline) / len(baseline)
        variancia = sum((x - media) ** 2 for x in baseline) / len(baseline)
        desvio = math.sqrt(variancia) if variancia > 0 else 0

        if desvio == 0:
            log.info("[PicoCheck] Desvio padrão zero, análise ignorada")
            return

        zscore = (count_hoje - media) / desvio
        log.info("[PicoCheck] %s: %d OS | média=%.1f | σ=%.1f | Z=%.2f",
                 hoje_str, count_hoje, media, desvio, zscore)

        if zscore >= 2.0:
            _db_save_pico_alerta(hoje_str, count_hoje, zscore)
            log.info("[PicoCheck] ⚠️ Pico anômalo detectado — alerta salvo")
        else:
            log.info("[PicoCheck] Volume normal, sem alerta")

    except Exception as ex:
        log.warning("[PicoCheck] Erro: %s", str(ex)[:200])


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
            linhas = _tg_header("🔴", "ALERTA SLA", None,
                                f"{len(novas)} OS vencida{'s' if len(novas) != 1 else ''}")
            for r, age in sorted(novas, key=lambda x: -x[1])[:10]:
                numos  = str(r.get("numos", "?"))
                nome   = _tg_esc((r.get("nomecliente") or "?")[:24])
                eq     = _tg_esc(_abrev_equipe(r.get("nomedaequipe", "")) or "Sem equipe")
                sit    = r.get("descsituacao") or ""
                sit_ic = "🔵" if "Atendimento" in sit else "🟡"
                linhas.append(f"{sit_ic} <b>{numos}</b> · {age}d · {nome} · {eq}")
                end = _tg_endereco(r, bairro_cidade=True)
                if end: linhas.append(f"   📍 {end}")
            if len(novas) > 10: linhas.append(f"<i>… +{len(novas) - 10} OS</i>")
            linhas += _tg_footer("/sla para visão por equipe")
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
                pct = round(crescimento / prev * 100)
                linhas_fila = _tg_header("📈", "ALERTA — FILA CRESCENDO") + [
                    f"Fila passou de <b>{prev}</b> → <b>{fila_atual}</b> OS (+{crescimento} / +{pct}%)"
                ] + _tg_footer("/status", "/pulso", "/aging")
                _telegram_send("\n".join(linhas_fila), chat_id_override=TELEGRAM_CHAT_ALERTAS)
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
                linhas = _tg_header("⚠️", "OS SEM EQUIPE HÁ +4H", None, f"{len(sem_eq)} OS")
                for r, h in sem_eq[:10]:
                    numos   = _tg_esc(r.get("numos","—"))
                    cliente = _tg_esc(r.get("nomecliente","—"))[:30]
                    cidade  = _tg_esc(r.get("nomedacidade","—"))
                    linhas.append(f"• OS <b>{numos}</b> — {cliente} ({cidade}) — {round(h)}h")
                    end = _tg_endereco(r, bairro_cidade=True)
                    if end: linhas.append(f"   📍 {end}")
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
                end_manut = _tg_endereco(r)
                linhas = _tg_header("🔧", "NOVA OS MANUTENÇÃO", f"{sit_ic} OS {numos}") + [
                          f"👤 <b>Cliente:</b> {nome}"]
                if end_manut:
                    linhas.append(f"📍 <b>Endereço:</b> {end_manut}")
                linhas += [
                          f"🏘 <b>Bairro:</b> " + " · ".join(x for x in (_tg_esc(bairro), _tg_esc(cidade)) if x),
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
                linhas += _tg_footer(f"/os {numos}", "/manutencoes")
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
            linhas = _tg_header("⏳", "EM ATENDIMENTO HÁ 2H+", None, f"{len(novas)} OS paradas")
            for r, mins in novas[:10]:
                numos  = str(r.get("numos", "?"))
                nome   = _tg_esc((r.get("nomecliente") or "?")[:24])
                eq     = _tg_esc(_abrev_equipe(r.get("nomedaequipe", "")) or "Sem equipe")
                h, m   = divmod(mins, 60)
                tempo  = f"{h}h{m:02d}min"
                linhas.append(f"🔵 <b>{numos}</b> · ⏱ <b>{tempo}</b> · {nome} · {eq}")
                end = _tg_endereco(r, bairro_cidade=True)
                if end: linhas.append(f"   📍 {end}")
            if len(novas) > 10: linhas.append(f"<i>… +{len(novas) - 10} OS</i>")
            linhas += _tg_footer("Verifique com a equipe e atualize o status no sistema")
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
            linhas = _tg_header("🚫", "SEM EXECUÇÃO ACUMULADA")
            for eq, os_list in sorted(alertar, key=lambda x: -len(x[1])):
                linhas.append(f"\n⚠️ <b>{_tg_esc(eq)}</b> — {len(os_list)} OS Sem Execução hoje")
                for r in os_list[:4]:
                    numos  = str(r.get("numos", "?"))
                    nome   = _tg_esc((r.get("nomecliente") or "?")[:24])
                    linhas.append(f"  /os{numos} · {nome}")
                    end = _tg_endereco(r, bairro_cidade=True)
                    if end: linhas.append(f"      📍 {end}")
                if len(os_list) > 4: linhas.append(f"  <i>… +{len(os_list) - 4} OS</i>")
            linhas += _tg_footer("/semexec para o relatório completo")
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

        chave_m            = f"{agora.date()}_manha"
        chave_t            = f"{agora.date()}_tarde"
        chave_h            = f"{agora.date()}_{agora.hour:02d}_exec"
        chave_pppoe        = f"{agora.date()}_pppoe"
        chave_alerta_pend  = f"{agora.date()}_alerta_pendentes"
        chave_pulso_12h    = f"{agora.date()}_pulso12h"
        chave_alerta_15h   = f"{agora.date()}_alerta15h"
        chave_ritmo_14h    = f"{agora.date()}_ritmo14h"
        chave_briefing_7h  = f"{agora.date()}_briefing7h"
        chave_pico_17h     = f"{agora.date()}_pico17h"

        if agora.hour == 7 and agora.minute < 2 and chave_briefing_7h not in enviados:
            enviados.add(chave_briefing_7h)
            if TELEGRAM_CHAT_ALERTAS:
                def _briefing_7h():
                    try:
                        from cabonnet.stats import compute_stats
                        from cabonnet.ai import _ai_daily_briefing
                        with state._query_cache_lock:
                            cached = dict(state._query_cache)
                        stats = compute_stats(
                            cached.get("pendente", ""),
                            cached.get("agendado", ""),
                            cached.get("futuro", ""),
                        )
                        ontem = date.today() - timedelta(days=1)
                        payload = {
                            **stats,
                            "data": date.today().strftime("%d/%m/%Y"),
                            "ontem": {"executadas": None, "abertas": None, "taxa": None},
                        }
                        result = _ai_daily_briefing(payload)
                        if not result:
                            return
                        linhas = _tg_header("🌄", "BRIEFING EXECUTIVO") + [
                            result["texto"],
                            "",
                            "<b>Ações do dia:</b>",
                        ]
                        for i, acao in enumerate(result.get("acoes", []), 1):
                            linhas.append(f"  {i}. {_tg_esc(acao)}")
                        _telegram_send("\n".join(linhas), chat_id_override=TELEGRAM_CHAT_ALERTAS)
                        log.info("[Scheduler] Briefing 7h enviado")
                    except Exception as ex:
                        log.warning("[Scheduler] Erro briefing 7h: %s", str(ex)[:200])
                threading.Thread(target=_briefing_7h, daemon=True).start()

        if agora.hour == 8 and agora.minute < 2 and chave_m not in enviados:
            enviados.add(chave_m)
            threading.Thread(target=_build_resumo_diario, args=("manha",), daemon=True).start()
            if TELEGRAM_CHAT_ALERTAS:
                def _kpi_manha():
                    try:
                        _telegram_send("🌅 <b>RESUMO MATINAL</b>\n" + _build_kpi().split("\n", 1)[1],
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
                            titulo = f"🌅 <b>RESUMO MATINAL — {op}</b>"
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
                        _telegram_send("🌆 <b>FECHAMENTO DO DIA</b>\n" + _build_kpi().split("\n", 1)[1],
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
                            titulo = f"🌆 <b>FECHAMENTO DO DIA — {op}</b>"
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
                        linhas = pulso.split("\n"); linhas[0] = "☀️ <b>PULSO INTERMEDIÁRIO — 12h</b>"
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
                        linhas = _tg_header("⛔", "ALERTA 15H — EQUIPES SEM EXECUÇÃO")
                        for eq, fila_cnt in paradas:
                            linhas.append(f"  ⚠️ <b>{_tg_esc(eq)}</b> — {fila_cnt} OS na fila, nenhuma executada")
                        linhas += _tg_footer("/equipe", "/turno", "/ranking")
                        _telegram_send("\n".join(linhas), chat_id_override=TELEGRAM_CHAT_ALERTAS)
                    except Exception as ex:
                        log.warning("[Scheduler] Erro alerta 15h: %s", str(ex)[:120])
                threading.Thread(target=_alerta_equipes_15h, daemon=True).start()

        if agora.hour == 17 and agora.minute < 2 and chave_pico_17h not in enviados:
            enviados.add(chave_pico_17h)
            threading.Thread(target=_check_pico_diario, daemon=True).start()

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
                        linhas    = _tg_header("🔴", "ALERTA 14H — RITMO ABAIXO DO ESPERADO") + [
                                     f"✅ Executadas até agora: <b>{len(exec_h)}</b> de {total} OS",
                                     f"📉 Taxa atual: <b>{taxa}%</b>  <code>{bar}</code>",
                                     f"🔭 Projeção ao fechar: <b>~{proj} OS ({pct_proj}%)</b>", "",
                                     "<b>Intervenção necessária para atingir a meta de 80%.</b>"]
                        linhas   += _tg_footer("/ranking", "/equipes", "/turno")
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
                        _telegram_send(txt)
                except Exception as ex:
                    log.warning("[Scheduler] Erro alerta pendentes: %s", str(ex)[:120])
            threading.Thread(target=_alerta_pendentes, daemon=True).start()

        if agora.hour == 18 and agora.minute >= 30 and chave_pppoe not in enviados:
            enviados.add(chave_pppoe)
            threading.Thread(target=_build_pppoe_resumo_diario, daemon=True).start()

        if agora.hour != 8 and agora.minute < 2 and 7 <= agora.hour <= 23 and chave_h not in enviados:
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


# ── Monitor de VT (Fila de Prioridade) ────────────────────────────────────────

_VT_RISK_WINDOW_H      = 4     # horas restantes para entrar em estágio de risco
_VT_REPEAT_INTERVAL_S  = 1800  # segundos entre repetições do alerta de violação (30min)
_VT_MIN_AGING_H        = 12    # não alerta VT aberta há menos de 12h (evita ruído em VT recém-abertas)


def _classificar_vt_alerta(restante, registro, agora, aging_h=float("inf")):
    """Decide se uma OS deve disparar alerta neste ciclo. Não muta estado.

    Estágios: None -> risco (uma vez) -> violado (uma vez) -> violado repetido (a cada 30min).
    Retorna 'violado', 'risco', ou None (sem alerta neste ciclo).

    VT aberta há menos de _VT_MIN_AGING_H horas nunca alerta.
    """
    if aging_h < _VT_MIN_AGING_H:
        return None
    estagio_atual = registro["estagio"] if registro else None
    if restante <= 0:
        if estagio_atual != "violado":
            return "violado"
        last_sent = registro["last_sent"]
        if (agora - last_sent).total_seconds() >= _VT_REPEAT_INTERVAL_S:
            return "violado"
        return None
    if restante <= _VT_RISK_WINDOW_H and estagio_atual is None:
        return "risco"
    return None


_VT_CHAT_POR_OPERADORA = {
    "WES":        TELEGRAM_CHAT_WES,
    "INSTACABLE": TELEGRAM_CHAT_INSTACABLE,
    "REDE":       TELEGRAM_CHAT_REDE,
    "THM":        TELEGRAM_CHAT_OPERACIONAL_THM,
}


def _enviar_alertas_vt(items, tipo):
    """items: lista de (row, restante_h, prazo_h). tipo: 'violado' | 'risco'."""
    if not items:
        return

    por_op = {}
    for r, restante, prazo_h in items:
        op = _operadora_da_os(r) or "ALERTAS"
        por_op.setdefault(op, []).append((r, restante, prazo_h))

    for op, batch in por_op.items():
        batch  = sorted(batch, key=lambda item: item[1])
        chat   = _VT_CHAT_POR_OPERADORA.get(op, TELEGRAM_CHAT_ALERTAS)
        if tipo == "violado":
            linhas = _tg_header("🔴", "VT VIOLADO", None, f"{len(batch)} OS")
        else:
            linhas = _tg_header("🟠", "VT EM RISCO", None, f"{len(batch)} OS")
        for r, restante, prazo_h in batch[:10]:
            numos = _tg_esc(r.get("numos", "?"))
            cli   = _tg_esc((r.get("nomecliente") or "?")[:28])
            eq    = _tg_esc(_abrev_equipe(r.get("nomedaequipe", "")) or "Sem equipe")
            if restante <= 0:
                linhas.append(f"🔴 <b>OS {numos}</b> · VT {prazo_h}h · violado há {round(abs(restante), 1)}h · {cli} · {eq}")
            else:
                linhas.append(f"🟠 <b>OS {numos}</b> · VT {prazo_h}h · faltam {round(restante, 1)}h · {cli} · {eq}")
            end = _tg_endereco(r, bairro_cidade=True)
            if end: linhas.append(f"   📍 {end}")
        if len(batch) > 10:
            linhas.append(f"<i>… +{len(batch) - 10} OS</i>")
        texto = "\n".join(linhas)
        _telegram_send(texto, chat_id_override=chat)
        if chat != TELEGRAM_CHAT_ALERTAS:
            _telegram_send(texto, chat_id_override=TELEGRAM_CHAT_ALERTAS)

    log.info("[VTMonitor] %s — %d OS notificadas", tipo, len(items))


def _vt_monitor_loop():
    log.info("[VTMonitor] Iniciado")
    while True:
        _time_mod.sleep(180)
        if not _telegram_enabled():
            continue
        try:
            hoje = date.today()
            if state._vt_alertados_data != hoje:
                state._vt_alertados = {}
                state._vt_alertados_data = hoje

            with state._dados_cache_lock:
                rows = list(state._dados_cache["agendado"])

            agora  = datetime.now()
            ativos = [r for r in rows if r.get("descsituacao") in ("Pendente", "Atendimento")]

            novas_viol  = []
            novas_risco = []

            for r in ativos:
                servico = (r.get("servico") or "").upper()
                if "VT 08H" in servico:
                    prazo_h = 8
                elif "VT 24H" in servico:
                    prazo_h = 24
                elif "VT 48H" in servico:
                    prazo_h = 48
                else:
                    continue

                numos = str(r.get("numos", ""))
                dt    = _parse_datetime_br(r.get("datacadastro", ""))
                if not dt:
                    continue
                aging_h   = (agora - dt).total_seconds() / 3600
                restante  = prazo_h - aging_h

                registro = state._vt_alertados.get(numos)
                decisao  = _classificar_vt_alerta(restante, registro, agora, aging_h=aging_h)
                if decisao == "violado":
                    novas_viol.append((r, restante, prazo_h))
                    state._vt_alertados[numos] = {"estagio": "violado", "last_sent": agora}
                elif decisao == "risco":
                    novas_risco.append((r, restante, prazo_h))
                    state._vt_alertados[numos] = {"estagio": "risco", "last_sent": agora}

            _enviar_alertas_vt(novas_viol, "violado")
            _enviar_alertas_vt(novas_risco, "risco")

        except Exception as ex:
            log.warning("[VTMonitor] Erro: %s", str(ex)[:120])
