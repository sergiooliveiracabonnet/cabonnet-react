# -*- coding: utf-8 -*-
"""
cabonnet/builders.py — Todas as funções _build_* de mensagens Telegram.
"""

import logging
import threading
import os
import time as _time_mod
from collections import defaultdict
from datetime import datetime, date, timedelta

from cabonnet.config import (
    TELEGRAM_CHAT_ALERTAS, TELEGRAM_CHAT_ID,
    TELEGRAM_CHAT_INSTACABLE, TELEGRAM_CHAT_WES,
    TELEGRAM_CHAT_OPERACIONAL_THM, TELEGRAM_CHAT_REDE,
    _OPERADORA_GRUPOS,
)
from cabonnet import state
from cabonnet.cache import _sla_limite, _calc_sla_exc, _dados_cache_update
from cabonnet.utils import _parse_data_br
from cabonnet.telegram import (
    _telegram_send, _tg_esc, _abrev_equipe, _is_campo,
    _filter_by_operadora, _TG_DIV, _TG_DIVS,
)
from cabonnet.grafana import (
    grafana_post, frames_to_csv, frames_to_dict_list,
    SQL_AGENDADO,
    sql_detalhes, sql_ocorrencias,
    sql_materiais_utilizados, sql_materiais_retirados,
)

log = logging.getLogger("CaboNetServer")


def _normalizar_busca(s):
    import unicodedata
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().upper()


def _build_status_text(rede=False, operadora=None):
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
        ts   = state._dados_cache["ts"]

    if not rows:
        return "⏳ Nenhum dado disponível. Acesse o dashboard para carregar os dados."

    if rede:
        rows = [r for r in rows if (r.get("servico") or "").upper().startswith("REDE")]
    elif operadora:
        rows = _filter_by_operadora(rows, operadora)
        rows = [r for r in rows if not (r.get("servico") or "").upper().startswith("REDE")]
    else:
        rows = [r for r in rows if not (r.get("servico") or "").upper().startswith("REDE")]

    hoje     = date.today()
    hoje_str = hoje.strftime("%d/%m/%Y")
    hora_str = datetime.now().strftime("%H:%M")

    pendentes   = [r for r in rows if r.get("descsituacao") == "Pendente"]
    atendimento = [r for r in rows if r.get("descsituacao") == "Atendimento"]
    concluidas  = [r for r in rows if "Concluída" in r.get("descsituacao","") and "Sem" not in r.get("descsituacao","")]
    sem_exec    = [r for r in rows if "Sem Execução" in r.get("descsituacao","")
                   and (r.get("databaixa","") or r.get("dataagendamento","")).startswith(hoje_str)]
    fila        = pendentes + atendimento

    concl_hoje = [
        r for r in concluidas
        if (r.get("dataexecucao","") or r.get("databaixa","")).startswith(hoje_str)
    ]

    inst_h  = sum(1 for r in concl_hoje if "INSTALAC" in (r.get("tiposervico","") or "").upper())
    manut_h = sum(1 for r in concl_hoje if "MANUTENC" in (r.get("tiposervico","") or "").upper())
    serv_h  = len(concl_hoje) - inst_h - manut_h

    sla_exc  = _calc_sla_exc(fila, hoje)
    total_op = len(concl_hoje) + len(fila)
    taxa     = round(len(concl_hoje) / total_op * 100) if total_op else 0
    taxa_em  = "🟢" if taxa >= 80 else "🟡" if taxa >= 60 else "🔴"

    eq_cnt = {}
    for r in fila:
        eq = (r.get("nomedaequipe","") or "").strip() or "Sem equipe"
        eq_cnt[eq] = eq_cnt.get(eq, 0) + 1
    top_eq = sorted(eq_cnt.items(), key=lambda x: -x[1])[:5]

    cache_hora = datetime.fromtimestamp(ts).strftime("%H:%M") if ts else "?"

    if rede:
        titulo = "📡 <b>CABONNET — STATUS REDE</b>"
    elif operadora:
        titulo = f"📊 <b>CABONNET — STATUS {operadora}</b>"
    else:
        titulo = "📊 <b>CABONNET — STATUS OPERACIONAL</b>"

    lines = [
        titulo,
        f"📅 <i>{hoje_str} às {hora_str}</i>",
        _TG_DIV, "",
        f"🟡 Pendentes: <b>{len(pendentes)}</b>",
        f"🔵 Em Atendimento: <b>{len(atendimento)}</b>",
        f"✅ Concluídas hoje: <b>{len(concl_hoje)}</b>",
    ]
    if inst_h or manut_h or serv_h:
        partes = []
        if inst_h:  partes.append(f"{inst_h} Inst")
        if manut_h: partes.append(f"{manut_h} Manut")
        if serv_h:  partes.append(f"{serv_h} Serv")
        lines.append(f"   <i>{'  ·  '.join(partes)}</i>")
    if sem_exec:
        lines.append(f"⚠️ Sem Execução: <b>{len(sem_exec)}</b>")
    if sla_exc:
        lines.append(f"🔴 SLA vencido na fila: <b>{sla_exc}</b>")
    lines.append(f"{taxa_em} Taxa de execução: <b>{taxa}%</b>")
    if top_eq:
        lines.append("")
        lines.append(f"👥 <b>Fila por equipe:</b>")
        total_fila = len(fila) or 1
        for eq, cnt in top_eq:
            eq_s  = _tg_esc(eq[:24] + ("…" if len(eq) > 24 else ""))
            pct   = round(cnt / total_fila * 100)
            bar   = "▓" * round(pct/10) + "░" * (10 - round(pct/10))
            lines.append(f"  <b>{eq_s}</b>: {cnt} <code>{bar}</code> {pct}%")
    lines.append("")
    lines.append(f"<i>Dados às {cache_hora} · Cabonnet · Gestão de OS</i>")
    return "\n".join(lines)


def _build_executadas_hoje(operadora=None):
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        return None

    rows     = _filter_by_operadora(rows, operadora)
    hoje     = date.today()
    hora_str = datetime.now().strftime("%H:%M")
    hoje_str = hoje.strftime("%d/%m/%Y")
    label    = f" — {operadora}" if operadora else ""

    exec_hoje = [r for r in rows if r.get("descsituacao") == "Concluída"
                 and _parse_data_br(r.get("dataexecucao") or r.get("dataagendamento")) == hoje]
    sem_exec  = [r for r in rows if r.get("descsituacao") == "Concluída/Sem Execução"
                 and _parse_data_br(r.get("dataexecucao") or r.get("dataagendamento")) == hoje]

    if not exec_hoje:
        return (f"📋 <b>CABONNET — EXECUTADAS HOJE{label}</b>\n"
                f"📅 <i>{hoje_str} às {hora_str}</i>\n{_TG_DIV}\n\n"
                "Nenhuma OS executada em campo hoje.\n\n"
                f"{_TG_DIV}\n<i>Cabonnet · Gestão de OS · {hoje_str}</i>")

    by_cidade = {}
    for r in exec_hoje:
        cidade = (r.get("nomedacidade") or "(sem cidade)").upper()
        if cidade not in by_cidade:
            by_cidade[cidade] = {"inst": 0, "manut": 0, "serv": 0}
        tipo = (r.get("tiposervico") or "").upper()
        if "INSTALACAO" in tipo:   by_cidade[cidade]["inst"]  += 1
        elif "MANUTENCAO" in tipo: by_cidade[cidade]["manut"] += 1
        else:                      by_cidade[cidade]["serv"]  += 1

    cidades = sorted(
        [{"c": c, **d, "total": d["inst"] + d["manut"] + d["serv"]} for c, d in by_cidade.items()],
        key=lambda x: -x["total"]
    )
    tI = sum(c["inst"]  for c in cidades)
    tM = sum(c["manut"] for c in cidades)
    tS = sum(c["serv"]  for c in cidades)

    linhas = [f"📋 <b>CABONNET — EXECUTADAS HOJE{label}</b>",
              f"📅 <i>{hoje_str} às {hora_str}</i>", _TG_DIV, ""]
    for c in cidades:
        linhas.append(f"<b>{_tg_esc(c['c'])} — {c['total']} OS</b>")
        if c["inst"]:  linhas.append(f"Instalação: {c['inst']}")
        if c["manut"]: linhas.append(f"Manutenção: {c['manut']}")
        if c["serv"]:  linhas.append(f"Serviços: {c['serv']}")
        linhas.append("")
    linhas.append(_TG_DIVS)
    linhas.append(f"<b>TOTAL: {len(exec_hoje)} OS executadas</b>")
    if tI: linhas.append(f"Instalação: {tI}")
    if tM: linhas.append(f"Manutenção: {tM}")
    if tS: linhas.append(f"Serviços: {tS}")
    if sem_exec:
        linhas += ["", f"⚠️ Encerradas sem execução: <b>{len(sem_exec)}</b> OS"]
    linhas += ["", _TG_DIV, f"<i>Cabonnet · Gestão de OS · {hoje_str}</i>"]
    return "\n".join(linhas)


def _build_listatendimento(operadora=None):
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    base  = _filter_by_operadora(rows, operadora)
    atend = [r for r in base if r.get("descsituacao") == "Atendimento"
             and not (r.get("servico") or "").upper().startswith("REDE")]
    if not atend:
        return "✅ Nenhuma OS em <b>Atendimento</b> no momento."
    hoje     = date.today()
    hoje_str = hoje.strftime("%d/%m/%Y")
    hora_str = datetime.now().strftime("%H:%M")
    label    = f" — {operadora}" if operadora else ""

    def _data_ord(d):
        if not d or "/" not in d: return "9999/99/99"
        p = d.split("/")
        return f"{p[2]}/{p[1]}/{p[0]}" if len(p) == 3 else "9999/99/99"

    def _is_futura(r):
        dt = _parse_data_br(r.get("dataagendamento") or r.get("dataatendimento") or "")
        return dt is not None and dt > hoje

    atuais  = [r for r in atend if not _is_futura(r)]
    futuras = [r for r in atend if _is_futura(r)]

    def _bloco_por_equipe(lista, titulo, icone):
        if not lista: return []
        por_eq = {}
        for r in lista:
            eq = (r.get("nomedaequipe") or "Sem equipe").strip()
            por_eq.setdefault(eq, []).append(r)
        ls = [f"\n{icone} <b>{titulo} — {len(lista)} OS</b>", _TG_DIV]
        for eq in sorted(por_eq.keys(), key=lambda e: (1 if "COPE" in e.upper() else 0, e)):
            grupo = sorted(por_eq[eq], key=lambda r: _data_ord(r.get("dataagendamento") or r.get("dataatendimento") or ""))
            ls.append(f"\n👤 <b>{eq}</b> — {len(grupo)} OS")
            for r in grupo:
                numos  = r.get("numos", "?")
                cidade = (r.get("nomedacidade") or "").upper()
                ts     = (r.get("tiposervico") or "").replace("INSTALACAO","Inst").replace("MANUTENCAO","Manut")
                dt     = r.get("dataagendamento") or r.get("dataatendimento") or "Sem data"
                ls.append(f"  /os{numos} · {cidade} · {ts} · {dt}")
        return ls

    linhas = [f"🔵 <b>OS EM ATENDIMENTO{label} — {len(atend)} total</b>",
              f"📅 <i>{hoje_str} às {hora_str}</i>"]
    linhas += _bloco_por_equipe(atuais,  "Em Atendimento", "🔵")
    linhas += _bloco_por_equipe(futuras, "Reagendadas (datas futuras)", "📅")
    linhas += ["", _TG_DIV, f"<i>Cabonnet · Gestão de OS · {hoje_str}</i>"]
    return "\n".join(linhas)


def _build_ordens_resumo(operadora=None):
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        return "⏳ Sem dados disponíveis. Acesse o dashboard para carregar os dados."
    rows   = _filter_by_operadora(rows, operadora)
    ativos = [r for r in rows if r.get("descsituacao") in ("Pendente", "Atendimento")
              and not (r.get("servico") or "").upper().startswith("REDE")]
    if not ativos:
        return "✅ Nenhuma OS ativa no momento."
    hoje     = date.today()
    hoje_str = hoje.strftime("%d/%m/%Y")
    hora_str = datetime.now().strftime("%H:%M")
    label    = f" — {operadora}" if operadora else ""
    grupos = {}
    for r in ativos:
        eq = (r.get("nomedaequipe") or "Sem equipe").strip()
        if eq not in grupos:
            grupos[eq] = {"pendente": 0, "atend": 0, "aging": [], "criticas": 0}
        g  = grupos[eq]
        st = r.get("descsituacao", "")
        if st == "Pendente":    g["pendente"] += 1
        if st == "Atendimento": g["atend"]    += 1
        dt = _parse_data_br(r.get("datacadastro", ""))
        if dt:
            a   = (hoje - dt).days
            g["aging"].append(a)
            lim = _sla_limite(r.get("tiposervico","") or "")
            if a >= lim * 2: g["criticas"] += 1
    ordenado   = sorted(grupos.items(), key=lambda x: x[1]["pendente"] + x[1]["atend"])
    total_os   = len(ativos)
    total_crit = sum(g["criticas"] for _, g in ordenado)
    all_aging  = [a for _, g in ordenado for a in g["aging"]]
    med_aging  = round(sum(all_aging) / len(all_aging), 1) if all_aging else 0
    linhas = [f"📊 <b>RESUMO POR EQUIPE{label}</b>",
              f"📅 <i>{hoje_str} às {hora_str}</i>",
              f"<b>{total_os} OS</b> ativas · {len(ordenado)} equipes · menor → maior", _TG_DIV]
    for eq, g in ordenado:
        total     = g["pendente"] + g["atend"]
        aging_med = round(sum(g["aging"]) / len(g["aging"]), 1) if g["aging"] else 0
        crit      = g["criticas"]
        emoji     = "🔴" if crit > 0 else ("⚠️" if aging_med >= 3 else "🟢")
        crit_txt  = f" · 🔴 <b>{crit} crítica{'s' if crit != 1 else ''}</b>" if crit else ""
        aging_txt = f"Aging: <b>{aging_med}d</b>" if g["aging"] else "Aging: —"
        linhas.append(f"\n{emoji} <b>{eq}</b> — {total} OS")
        linhas.append(f"  Pend: {g['pendente']} · Atend: {g['atend']} · {aging_txt}{crit_txt}")
    linhas += ["", _TG_DIV, f"Total: <b>{total_os} OS</b> · Aging médio: <b>{med_aging}d</b>"]
    if total_crit:
        linhas.append(f"🔴 <b>{total_crit} OS crítica{'s' if total_crit != 1 else ''}</b> (SLA 2× excedido)")
    linhas.append(f"<i>Cabonnet · {hoje_str}</i>")
    return "\n".join(linhas)


def _build_ordens_detalhado(operadora=None):
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        return "⏳ Sem dados disponíveis. Acesse o dashboard para carregar os dados."
    rows   = _filter_by_operadora(rows, operadora)
    ativos = [r for r in rows if r.get("descsituacao") in ("Pendente", "Atendimento")
              and not (r.get("servico") or "").upper().startswith("REDE")]
    if not ativos:
        return "✅ Nenhuma OS ativa no momento."
    hoje     = date.today()
    hoje_str = hoje.strftime("%d/%m/%Y")
    hora_str = datetime.now().strftime("%H:%M")
    label    = f" — {operadora}" if operadora else ""

    def _aging_r(r):
        dt = _parse_data_br(r.get("datacadastro", ""))
        return (hoje - dt).days if dt else 0

    grupos   = {}
    for r in ativos:
        eq = (r.get("nomedaequipe") or "Sem equipe").strip()
        grupos.setdefault(eq, []).append(r)
    ordenado = sorted(grupos.items(), key=lambda x: len(x[1]))
    linhas = [f"📋 <b>RELATÓRIO DETALHADO{label}</b>",
              f"📅 <i>{hoje_str} às {hora_str}</i>",
              f"<b>{len(ativos)} OS</b> ativas · {len(ordenado)} equipes · menor → maior", _TG_DIV]
    for eq, os_list in ordenado:
        os_sorted = sorted(os_list, key=_aging_r, reverse=True)
        linhas.append(f"\n▸ <b>{eq}</b>  ({len(os_list)} OS)")
        for r in os_sorted:
            numos   = r.get("numos", "?")
            cliente = (r.get("nomecliente") or "?")[:22]
            cidade  = (r.get("nomedacidade") or "").upper()[:14]
            tipo_s  = (r.get("tiposervico") or "").replace("INSTALACAO","Inst").replace("MANUTENCAO","Manut")[:10]
            ag      = _aging_r(r)
            status  = r.get("descsituacao", "")[:12]
            ag_ico  = " 🔴" if ag >= 6 else (" ⚠️" if ag >= 3 else "")
            linhas.append(f"  /os{numos} · {cliente} · {cidade} · {tipo_s} · {ag}d{ag_ico} · {status}")
    linhas += ["", _TG_DIV, f"<i>Cabonnet · {len(ativos)} OS · {hoje_str}</i>"]
    return "\n".join(linhas)


def _build_pulso(operadora=None):
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        return "⏳ Sem dados disponíveis."
    rows     = _filter_by_operadora(rows, operadora)
    hoje     = date.today()
    hoje_str = hoje.strftime("%d/%m/%Y")
    hora_str = datetime.now().strftime("%H:%M")
    label    = f" {operadora}" if operadora else ""
    is_hoje  = lambda r: _parse_data_br(r.get("dataexecucao") or r.get("dataagendamento")) == hoje
    exec_h   = [r for r in rows if r.get("descsituacao") == "Concluída" and is_hoje(r)]
    fila     = [r for r in rows if r.get("descsituacao") in ("Pendente", "Atendimento")]
    total_op = len(exec_h) + len(fila)
    taxa     = round(len(exec_h) / total_op * 100) if total_op else 0
    taxa_em  = "🟢" if taxa >= 80 else "🟡" if taxa >= 50 else "🔴"
    bar      = "▓" * round(taxa / 10) + "░" * (10 - round(taxa / 10))
    sla_crit = _calc_sla_exc(fila, hoje)
    eq_exec = {}; eq_fila = {}
    for r in rows:
        eq = _abrev_equipe(r.get("nomedaequipe", "")) or "(sem equipe)"
        if not _is_campo(r.get("nomedaequipe", "")): continue
        if r.get("descsituacao") == "Concluída" and is_hoje(r): eq_exec[eq] = eq_exec.get(eq, 0) + 1
        if r.get("descsituacao") in ("Pendente", "Atendimento"): eq_fila[eq] = eq_fila.get(eq, 0) + 1
    paradas = [eq for eq in eq_fila if eq_exec.get(eq, 0) == 0 and eq_fila[eq] >= 2]
    sla_line = f"🔴 SLA crítico: <b>{sla_crit}</b> OS" if sla_crit else "🟢 SLA: sem críticos"
    if paradas:
        nomes_par = ", ".join(_tg_esc(e) for e in paradas[:3]) + ("…" if len(paradas) > 3 else "")
        paradas_line = f"⛔ Equipes paradas: <b>{len(paradas)}</b> — {nomes_par}"
    else:
        paradas_line = "🏃 Todas equipes em atividade"
    lines = [f"⚡ <b>CABONNET — PULSO{label} {hora_str}</b>",
             f"📅 <i>{hoje_str}</i>", _TG_DIV, "",
             f"✅ Executadas hoje: <b>{len(exec_h)}</b>",
             f"📋 Fila atual: <b>{len(fila)}</b>",
             f"{taxa_em} Taxa: <b>{taxa}%</b>  <code>{bar}</code>",
             sla_line, paradas_line, "", _TG_DIV,
             f"<i>Cabonnet · Gestão de OS · {hoje_str}</i>"]
    return "\n".join(lines)


def _build_equipes(operadora=None):
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        return "⏳ Sem dados disponíveis."
    rows     = _filter_by_operadora(rows, operadora)
    hoje     = date.today()
    hoje_str = hoje.strftime("%d/%m/%Y")
    hora_str = datetime.now().strftime("%H:%M")
    label    = f" — {operadora}" if operadora else ""
    is_hoje  = lambda r: _parse_data_br(r.get("dataexecucao") or r.get("dataagendamento")) == hoje
    eq_data  = {}
    for r in rows:
        raw = r.get("nomedaequipe", "") or ""
        if not _is_campo(raw): continue
        eq = _abrev_equipe(raw) or "(sem equipe)"
        if eq not in eq_data: eq_data[eq] = {"exec": 0, "fila": 0}
        if r.get("descsituacao") == "Concluída" and is_hoje(r): eq_data[eq]["exec"] += 1
        if r.get("descsituacao") in ("Pendente", "Atendimento"): eq_data[eq]["fila"] += 1
    ativas  = {eq: d for eq, d in eq_data.items() if d["exec"] > 0 or d["fila"] > 0}
    paradas = {eq: d for eq, d in eq_data.items() if d["exec"] == 0 and d["fila"] >= 1}
    lines   = [f"👥 <b>CABONNET — EQUIPES HOJE{label}</b>",
               f"📅 <i>{hoje_str} às {hora_str}</i>", _TG_DIV, ""]
    if ativas:
        lines.append("<b>Em atividade:</b>")
        for eq, d in sorted(ativas.items(), key=lambda x: -x[1]["exec"]):
            status = "✅" if d["exec"] > 0 else "⏳"
            lines.append(f"{status} <b>{_tg_esc(eq)}</b> — {d['exec']} exec · {d['fila']} fila")
    if paradas:
        lines.append(""); lines.append(f"⛔ <b>Sem execução hoje ({len(paradas)}):</b>")
        for eq, d in sorted(paradas.items(), key=lambda x: -x[1]["fila"]):
            lines.append(f"  • {_tg_esc(eq)} — {d['fila']} OS na fila")
    if not ativas and not paradas:
        lines.append("<i>Nenhuma equipe com OS hoje.</i>")
    lines += ["", _TG_DIV, f"<i>Cabonnet · Gestão de OS · {hoje_str}</i>"]
    return "\n".join(lines)


def _build_meta_inst(operadora="INSTACABLE"):
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        return "⏳ Sem dados disponíveis."
    global_view = operadora is None
    META     = 33 if global_view else 16
    hoje     = date.today()
    hoje_str = hoje.strftime("%d/%m/%Y")
    hora_str = datetime.now().strftime("%H:%M")
    label    = "" if global_view else f" — {operadora}"
    is_hoje  = lambda r: _parse_data_br(r.get("dataexecucao") or r.get("dataagendamento")) == hoje
    is_inst  = lambda r: "INSTALAC" in (r.get("tiposervico", "") or "").upper()
    rows_f   = rows if global_view else _filter_by_operadora(rows, operadora)
    inst_hoje = [r for r in rows_f if r.get("descsituacao") == "Concluída" and is_hoje(r) and is_inst(r)]
    total    = len(inst_hoje)
    pct      = round(total / META * 100)
    bar      = "▓" * min(10, round(pct / 10)) + "░" * max(0, 10 - round(pct / 10))
    exec_por_eq = {}
    for r in inst_hoje:
        eq = _abrev_equipe(r.get("nomedaequipe", "")) or "(sem equipe)"
        exec_por_eq[eq] = exec_por_eq.get(eq, 0) + 1
    fila_inst = [r for r in rows_f if r.get("descsituacao") in ("Pendente","Atendimento") and is_inst(r) and _is_campo(r.get("nomedaequipe",""))]
    fila_por_eq = {}
    for r in fila_inst:
        eq = _abrev_equipe(r.get("nomedaequipe","")) or "(sem equipe)"
        fila_por_eq[eq] = fila_por_eq.get(eq, 0) + 1
    menos_eq    = min(fila_por_eq, key=lambda eq: exec_por_eq.get(eq, 0), default=None)
    menos_count = exec_por_eq.get(menos_eq, 0) if menos_eq else 0
    if total >= META:
        lines = [f"🎯 <b>CABONNET — META INSTALAÇÕES{label}</b>",
                 f"📅 <i>{hoje_str} às {hora_str}</i>", _TG_DIV, "",
                 f"✅ Meta atingida! <b>{total}/{META}</b> instalações",
                 f"<code>{bar} {pct}%</code>"]
    else:
        faltam = META - total
        lines  = [f"🎯 <b>CABONNET — META INSTALAÇÕES{label}</b>",
                  f"📅 <i>{hoje_str} às {hora_str}</i>", _TG_DIV, "",
                  f"Meta: <b>{META} instalações</b>",
                  f"Realizado: <b>{total}</b> ❌  <i>faltam {faltam}</i>",
                  f"<code>{bar} {pct}%</code>"]
        if menos_eq:
            lines += ["", "Equipe com menos instalações hoje:",
                      f"⚠️ <b>{_tg_esc(menos_eq)}</b> — {menos_count} instalação{'ões' if menos_count != 1 else ''}"]
    lines += ["", _TG_DIV, f"<i>Cabonnet · Gestão de OS · {hoje_str}</i>"]
    return "\n".join(lines)


def _build_kpi():
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
        ts   = state._dados_cache["ts"]
    if not rows:
        return "⏳ Sem dados disponíveis para o KPI."
    hoje     = date.today()
    hoje_str = hoje.strftime("%d/%m/%Y")
    hora_str = datetime.now().strftime("%H:%M")
    cache_hora = datetime.fromtimestamp(ts).strftime("%H:%M") if ts else "?"
    is_hoje  = lambda r: _parse_data_br(r.get("dataexecucao") or r.get("dataagendamento")) == hoje
    is_inst  = lambda r: "INSTALAC" in (r.get("tiposervico", "") or "").upper()
    sem_rede = [r for r in rows if not (r.get("servico") or "").upper().startswith("REDE")]
    exec_g   = [r for r in sem_rede if r.get("descsituacao") == "Concluída" and is_hoje(r)]
    fila_g   = [r for r in sem_rede if r.get("descsituacao") in ("Pendente", "Atendimento")]
    total_g  = len(exec_g) + len(fila_g)
    taxa_g   = round(len(exec_g) / total_g * 100) if total_g else 0
    icon_g   = "🟢" if taxa_g >= 80 else "🟡" if taxa_g >= 60 else "🔴"
    sla_g    = _calc_sla_exc(fila_g, hoje)

    def _resumo_op(operadora):
        r_op   = _filter_by_operadora(sem_rede, operadora)
        exec_o = [r for r in r_op if r.get("descsituacao") == "Concluída" and is_hoje(r)]
        fila_o = [r for r in r_op if r.get("descsituacao") in ("Pendente", "Atendimento")]
        pend_o = [r for r in r_op if r.get("descsituacao") == "Pendente"]
        atnd_o = [r for r in r_op if r.get("descsituacao") == "Atendimento"]
        tot_o  = len(exec_o) + len(fila_o)
        taxa_o = round(len(exec_o) / tot_o * 100) if tot_o else 0
        icon_o = "🟢" if taxa_o >= 80 else "🟡" if taxa_o >= 60 else "🔴"
        inst_o = sum(1 for r in exec_o if is_inst(r))
        return exec_o, pend_o, atnd_o, taxa_o, icon_o, inst_o

    exec_i, pend_i, atnd_i, taxa_i, icon_i, inst_i = _resumo_op("INSTACABLE")
    exec_w, pend_w, atnd_w, taxa_w, icon_w, inst_w = _resumo_op("WES")
    META      = 33
    inst_total = sum(1 for r in sem_rede if r.get("descsituacao") == "Concluída" and is_hoje(r) and is_inst(r))
    pct_meta  = round(inst_total / META * 100)
    bar_meta  = "▓" * min(10, round(pct_meta / 10)) + "░" * max(0, 10 - round(pct_meta / 10))
    meta_icon = "✅" if inst_total >= META else ("🟡" if inst_total >= META * 0.7 else "🔴")
    rede_rows = [r for r in rows if (r.get("servico") or "").upper().startswith("REDE")]
    exec_r    = [r for r in rede_rows if r.get("descsituacao") == "Concluída" and is_hoje(r)]
    fila_r    = [r for r in rede_rows if r.get("descsituacao") in ("Pendente", "Atendimento")]
    eq_exec_g = {}; eq_fila_g = {}
    for r in sem_rede:
        eq = _abrev_equipe(r.get("nomedaequipe", "")) or "(sem equipe)"
        if not _is_campo(r.get("nomedaequipe", "")): continue
        if r.get("descsituacao") == "Concluída" and is_hoje(r): eq_exec_g[eq] = eq_exec_g.get(eq, 0) + 1
        if r.get("descsituacao") in ("Pendente", "Atendimento"): eq_fila_g[eq] = eq_fila_g.get(eq, 0) + 1
    paradas_g   = [eq for eq in eq_fila_g if eq_exec_g.get(eq, 0) == 0 and eq_fila_g[eq] >= 2]
    sla_kpi_line = (f"🔴 SLA crítico: <b>{sla_g}</b> OS" if sla_g else "🟢 SLA: sem críticos")
    lines = [f"📊 <b>CABONNET — PAINEL KPI</b>",
             f"📅 <i>{hoje_str} às {hora_str}</i>", _TG_DIV, "",
             "<b>VISÃO GLOBAL</b>",
             f"✅ Executadas hoje: <b>{len(exec_g)}</b>   📋 Fila: <b>{len(fila_g)}</b>",
             f"{icon_g} Taxa global: <b>{taxa_g}%</b>", sla_kpi_line,
             f"{meta_icon} Meta instalações: <b>{inst_total}/{META}</b>  <code>{bar_meta} {pct_meta}%</code>",
             "", _TG_DIV, "",
             "<b>INSTACABLE</b>",
             f"  ✅ {len(exec_i)} exec  ·  🔵 {len(atnd_i)} atend  ·  🟡 {len(pend_i)} pend",
             f"  {icon_i} Taxa: <b>{taxa_i}%</b>", "",
             "<b>WES</b>",
             f"  ✅ {len(exec_w)} exec  ·  🔵 {len(atnd_w)} atend  ·  🟡 {len(pend_w)} pend",
             f"  {icon_w} Taxa: <b>{taxa_w}%</b>", "",
             "<b>REDE</b>",
             f"  ✅ {len(exec_r)} exec  ·  📋 {len(fila_r)} fila"]
    if paradas_g:
        nomes = ", ".join(_tg_esc(e) for e in paradas_g[:4]) + ("…" if len(paradas_g) > 4 else "")
        lines += ["", f"⛔ <b>Equipes paradas ({len(paradas_g)}):</b> {nomes}"]
    lines += ["", _TG_DIV, f"<i>Dados às {cache_hora} · Cabonnet · KPI Gerencial</i>"]
    return "\n".join(lines)


def _build_sla_detalhado():
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        return "⏳ Sem dados disponíveis."
    hoje     = date.today()
    hora_str = datetime.now().strftime("%H:%M")
    hoje_str = hoje.strftime("%d/%m/%Y")
    sem_rede = [r for r in rows if not (r.get("servico") or "").upper().startswith("REDE")]
    fila     = [r for r in sem_rede if r.get("descsituacao") in ("Pendente", "Atendimento") and _is_campo(r.get("nomedaequipe", ""))]
    eq_data  = {}
    for r in fila:
        eq  = _abrev_equipe(r.get("nomedaequipe", "")) or "(sem equipe)"
        dt  = _parse_data_br(r.get("datacadastro", ""))
        age = (hoje - dt).days if dt else 0
        lim = _sla_limite(r.get("tiposervico","") or "")
        if eq not in eq_data: eq_data[eq] = {"total": 0, "vencidas": 0, "ages": []}
        eq_data[eq]["total"]  += 1
        eq_data[eq]["ages"].append(age)
        if age >= lim: eq_data[eq]["vencidas"] += 1
    if not eq_data:
        return f"✅ <b>SLA — Sem OS na fila.</b>\n<i>{hoje_str} às {hora_str}</i>"
    equipes_sorted = sorted(eq_data.items(), key=lambda x: (-x[1]["vencidas"], -max(x[1]["ages"])))
    linhas = [f"🕐 <b>SLA por Equipe — {hoje_str}</b>",
              f"<i>Referência: Inst ≥2d · Manut ≥1d · às {hora_str}</i>", _TG_DIV]
    for eq, d in equipes_sorted:
        avg    = round(sum(d["ages"]) / len(d["ages"]), 1) if d["ages"] else 0
        maximo = max(d["ages"]) if d["ages"] else 0
        venc   = d["vencidas"]
        icon   = "🔴" if venc >= 3 else "🟡" if venc >= 1 else "🟢"
        venc_s = f" · <b>{venc} vencida{'s' if venc != 1 else ''}</b>" if venc else ""
        linhas.append(f"{icon} <b>{_tg_esc(eq)}</b> — {d['total']} OS  ·  avg {avg}d  ·  max {maximo}d{venc_s}")
    total_venc = sum(d["vencidas"] for d in eq_data.values())
    linhas += ["", _TG_DIV, f"🔴 Total vencidas: <b>{total_venc}</b>  ·  <i>Fila total: {len(fila)} OS</i>"]
    return "\n".join(linhas)


def _build_equipe_ficha(sigla):
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        return "⏳ Sem dados disponíveis."
    sig_up   = sigla.strip().upper()
    hoje     = date.today()
    seg      = hoje - timedelta(days=hoje.weekday())
    hora_str = datetime.now().strftime("%H:%M")
    hoje_str = hoje.strftime("%d/%m/%Y")
    eq_rows  = [r for r in rows if sig_up in (r.get("nomedaequipe") or "").upper()]
    if not eq_rows:
        return f"❌ Equipe <code>{_tg_esc(sigla)}</code> não encontrada.\nVerifique a sigla e tente novamente."
    nome_eq  = _abrev_equipe(eq_rows[0].get("nomedaequipe", "")) or sigla
    is_hoje  = lambda r: _parse_data_br(r.get("dataexecucao") or r.get("databaixa")) == hoje
    is_semana = lambda r: seg <= (_parse_data_br(r.get("dataexecucao") or r.get("databaixa")) or date.min) <= hoje
    exec_h   = [r for r in eq_rows if r.get("descsituacao") == "Concluída" and "Sem" not in (r.get("descsituacao") or "") and is_hoje(r)]
    exec_sem = [r for r in eq_rows if r.get("descsituacao") == "Concluída" and "Sem" not in (r.get("descsituacao") or "") and is_semana(r)]
    atend    = [r for r in eq_rows if r.get("descsituacao") == "Atendimento"]
    pend     = [r for r in eq_rows if r.get("descsituacao") == "Pendente"]
    sem_exec = [r for r in eq_rows if "Sem Execução" in (r.get("descsituacao") or "")
                and (r.get("databaixa","") or r.get("dataagendamento","")).startswith(hoje_str)]
    fila     = atend + pend
    sla_venc = sum(1 for r in fila if (
        (lambda d, t: (hoje - d).days >= _sla_limite(t))(
            _parse_data_br(r.get("datacadastro", "")) or hoje,
            r.get("tiposervico", "") or ""
        )
    ))
    linhas = [f"👷 <b>Equipe: {_tg_esc(nome_eq)}</b>",
              f"<i>{hoje_str} às {hora_str}</i>", _TG_DIV,
              f"✅ Executadas hoje: <b>{len(exec_h)}</b>  ·  Semana: <b>{len(exec_sem)}</b>",
              f"🔵 Em atendimento: <b>{len(atend)}</b>",
              f"🟡 Pendentes: <b>{len(pend)}</b>"]
    if sem_exec: linhas.append(f"⚠️ Sem Execução: <b>{len(sem_exec)}</b>")
    if sla_venc: linhas.append(f"🔴 SLA vencido na fila: <b>{sla_venc}</b>")
    if atend:
        linhas += ["", "<b>Em campo agora:</b>"]
        for r in atend[:5]:
            numos  = str(r.get("numos", "?"))
            nome   = _tg_esc((r.get("nomecliente") or "?")[:28])
            cidade = _tg_esc((r.get("nomedacidade") or "")[:18])
            ini    = (r.get("datainicio") or "").strip()
            ini_s  = f" · desde {_tg_esc(ini[-5:])}" if ini else ""
            linhas.append(f"  🔵 <b>{numos}</b> · {nome} · {cidade}{ini_s}")
    if pend:
        linhas += ["", f"<b>Próximas ({min(len(pend),5)} de {len(pend)}):</b>"]
        for r in sorted(pend, key=lambda r: _parse_data_br(r.get("dataagendamento","")) or date.max)[:5]:
            numos = str(r.get("numos", "?"))
            nome  = _tg_esc((r.get("nomecliente") or "?")[:28])
            dt    = (r.get("dataagendamento") or "")[:10]
            linhas.append(f"  🟡 <b>{numos}</b> · {nome} · {dt}")
    linhas += ["", _TG_DIV, f"<i>Cabonnet · Ficha {_tg_esc(nome_eq)}</i>"]
    return "\n".join(linhas)


def _build_aging():
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        return "⏳ Sem dados disponíveis."
    hoje     = date.today()
    hora_str = datetime.now().strftime("%H:%M")
    hoje_str = hoje.strftime("%d/%m/%Y")
    sem_rede = [r for r in rows if not (r.get("servico") or "").upper().startswith("REDE")]
    fila     = [r for r in sem_rede if r.get("descsituacao") in ("Pendente", "Atendimento")]
    def _age(r):
        dt = _parse_data_br(r.get("datacadastro", ""))
        return (hoje - dt).days if dt else 0
    fila_sorted = sorted(fila, key=_age, reverse=True)[:20]
    if not fila_sorted:
        return f"✅ <b>Sem OS na fila.</b>\n<i>{hoje_str} às {hora_str}</i>"
    linhas = [f"⏳ <b>OS Mais Antigas na Fila — {hoje_str}</b>",
              f"<i>Top 20 por tempo de espera · {hora_str}</i>", _TG_DIV]
    for r in fila_sorted:
        numos  = str(r.get("numos", "?"))
        nome   = _tg_esc((r.get("nomecliente") or "?")[:24])
        eq     = _tg_esc(_abrev_equipe(r.get("nomedaequipe", "")) or "Sem equipe")
        sit    = r.get("descsituacao") or ""
        sit_ic = "🔵" if "Atendimento" in sit else "🟡"
        age    = _age(r)
        tipo   = (r.get("tiposervico", "") or "").upper()
        limite = _sla_limite(tipo)
        age_ic = "🔴" if age >= limite else "🟡"
        linhas.append(f"{sit_ic} <b>{numos}</b> · {age_ic} <b>{age}d</b> · {nome} · {eq}")
    linhas += ["", f"<i>Total na fila: {len(fila)} OS</i>"]
    return "\n".join(linhas)


def _build_ranking():
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        return "⏳ Sem dados disponíveis."
    hoje     = date.today()
    hora_str = datetime.now().strftime("%H:%M")
    hoje_str = hoje.strftime("%d/%m/%Y")
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
    todas = set(list(eq_exec.keys()) + list(eq_fila.keys()))
    if not todas:
        return f"⏳ Sem equipes com OS hoje.\n<i>{hoje_str} às {hora_str}</i>"
    ranking = sorted(todas, key=lambda eq: (-eq_exec.get(eq, 0), eq))
    maximo  = max((eq_exec.get(eq, 0) for eq in ranking), default=1) or 1
    linhas  = [f"🏆 <b>Ranking de Produtividade — {hoje_str}</b>",
               f"<i>Executadas hoje por equipe · {hora_str}</i>", _TG_DIV]
    for i, eq in enumerate(ranking, 1):
        exec_ = eq_exec.get(eq, 0); fila_ = eq_fila.get(eq, 0)
        bar   = "▓" * round(exec_ / maximo * 8) + "░" * (8 - round(exec_ / maximo * 8))
        medal = ["🥇", "🥈", "🥉"][i - 1] if i <= 3 else f"{i}."
        status = "⛔" if exec_ == 0 and fila_ > 0 else ""
        linhas.append(f"{medal} {status}<b>{_tg_esc(eq)}</b> — <b>{exec_}</b> exec  <code>{bar}</code>  📋{fila_}")
    total_exec = sum(eq_exec.values())
    linhas += ["", _TG_DIV, f"✅ Total executadas hoje: <b>{total_exec}</b>"]
    return "\n".join(linhas)


def _build_reagendadas():
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        return "⏳ Sem dados disponíveis."
    hoje     = date.today()
    hora_str = datetime.now().strftime("%H:%M")
    hoje_str = hoje.strftime("%d/%m/%Y")
    def _eh_reagendada(r):
        eq = (r.get("nomedaequipe") or "").upper()
        ts = (r.get("tiposervico")  or "").upper()
        sv = (r.get("servico")      or "").upper()
        return "REAGEND" in eq or "REAGEND" in ts or "REAGEND" in sv
    reagendadas = [r for r in rows if r.get("descsituacao") in ("Pendente", "Atendimento") and _eh_reagendada(r)]
    if not reagendadas:
        return f"✅ <b>Nenhuma OS reagendada na fila.</b>\n<i>{hoje_str} às {hora_str}</i>"
    def _age(r):
        dt = _parse_data_br(r.get("datacadastro", ""))
        return (hoje - dt).days if dt else 0
    reagendadas.sort(key=_age, reverse=True)
    linhas = [f"🔄 <b>OS Reagendadas na Fila — {hoje_str}</b>",
              f"Total: <b>{len(reagendadas)}</b> · às {hora_str}", _TG_DIV]
    for r in reagendadas[:20]:
        numos  = str(r.get("numos", "?"))
        nome   = _tg_esc((r.get("nomecliente") or "?")[:24])
        eq     = _tg_esc(_abrev_equipe(r.get("nomedaequipe", "")) or "?")
        cidade = _tg_esc((r.get("nomedacidade") or "")[:18])
        age    = _age(r)
        sit    = r.get("descsituacao") or ""
        sit_ic = "🔵" if "Atendimento" in sit else "🟡"
        linhas.append(f"{sit_ic} <b>{numos}</b> · {age}d · {nome} · {cidade} · {eq}")
    if len(reagendadas) > 20:
        linhas.append(f"<i>… +{len(reagendadas) - 20} OS não exibidas</i>")
    linhas += ["", "<i>Use /os &lt;número&gt; para detalhes completos</i>"]
    return "\n".join(linhas)


def _build_cidade(nome):
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        return "⏳ Sem dados disponíveis."
    nome_norm = _normalizar_busca(nome.strip())
    hoje      = date.today()
    hora_str  = datetime.now().strftime("%H:%M")
    hoje_str  = hoje.strftime("%d/%m/%Y")
    is_hoje   = lambda r: _parse_data_br(r.get("dataexecucao") or r.get("databaixa")) == hoje
    cid_rows  = [r for r in rows if nome_norm in _normalizar_busca(r.get("nomedacidade") or "")]
    if not cid_rows:
        return f"❌ Cidade <code>{_tg_esc(nome)}</code> não encontrada."
    nome_cidade = (cid_rows[0].get("nomedacidade") or nome).strip()
    exec_h   = [r for r in cid_rows if r.get("descsituacao") == "Concluída" and "Sem" not in (r.get("descsituacao") or "") and is_hoje(r)]
    atend    = [r for r in cid_rows if r.get("descsituacao") == "Atendimento"]
    pend     = [r for r in cid_rows if r.get("descsituacao") == "Pendente"]
    sem_exec = [r for r in cid_rows if "Sem Execução" in (r.get("descsituacao") or "")
                and (r.get("databaixa","") or r.get("dataagendamento","")).startswith(hoje_str)]
    sit_ic   = lambda s: ("✅" if "Concluída" in s and "Sem" not in s else "🔵" if "Atendimento" in s else "🟡")
    linhas   = [f"📍 <b>{_tg_esc(nome_cidade)} — {hoje_str}</b>",
                f"✅ Executadas hoje: <b>{len(exec_h)}</b>  ·  🔵 Atend: <b>{len(atend)}</b>  ·  🟡 Pend: <b>{len(pend)}</b>",
                _TG_DIV]
    todos = exec_h + atend + pend + sem_exec
    for r in todos[:25]:
        sit   = r.get("descsituacao") or ""
        numos = str(r.get("numos", "?"))
        nome_ = _tg_esc((r.get("nomecliente") or "?")[:28])
        eq    = _tg_esc(_abrev_equipe(r.get("nomedaequipe", "")) or "Sem equipe")
        linhas.append(f"{sit_ic(sit)} <b>{numos}</b> · {nome_} · {eq}")
    if len(todos) > 25:
        linhas.append(f"<i>… +{len(todos) - 25} OS não exibidas</i>")
    linhas += ["", f"<i>Total em {_tg_esc(nome_cidade)}: {len(cid_rows)} OS · {hora_str}</i>"]
    return "\n".join(linhas)


def _build_turno():
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        return "⏳ Sem dados disponíveis."
    agora    = datetime.now()
    hora_str = agora.strftime("%H:%M")
    hoje_str = agora.strftime("%d/%m/%Y")
    atend    = [r for r in rows if r.get("descsituacao") == "Atendimento"]
    if not atend:
        return f"✅ <b>Nenhuma equipe em atendimento agora.</b>\n<i>{hoje_str} às {hora_str}</i>"
    def _tempo_na_os(r):
        ini = (r.get("datainicio") or "").strip()
        if not ini: return None
        try:
            dt_ini = datetime.strptime(ini[:16], "%d/%m/%Y %H:%M")
            mins   = int((agora - dt_ini).total_seconds() / 60)
            if mins < 0: return None
            h, m = divmod(mins, 60)
            return f"{h}h{m:02d}" if h else f"{m}min"
        except ValueError:
            return None
    por_equipe = {}
    for r in atend:
        eq = _abrev_equipe(r.get("nomedaequipe", "")) or "Sem equipe"
        por_equipe.setdefault(eq, []).append(r)
    linhas = [f"🏃 <b>Turno Atual — Equipes em Campo</b>",
              f"<i>{hoje_str} às {hora_str} · {len(atend)} OS em Atendimento</i>", _TG_DIV]
    for eq in sorted(por_equipe):
        os_eq = por_equipe[eq]
        linhas.append(f"\n👷 <b>{_tg_esc(eq)} ({len(os_eq)} OS)</b>")
        for r in os_eq[:3]:
            numos  = str(r.get("numos", "?"))
            nome   = _tg_esc((r.get("nomecliente") or "?")[:24])
            cidade = _tg_esc((r.get("nomedacidade") or "")[:16])
            tempo  = _tempo_na_os(r)
            tempo_s = f" · ⏱ {tempo}" if tempo else ""
            linhas.append(f"  🔵 <b>{numos}</b> · {nome} · {cidade}{tempo_s}")
        if len(os_eq) > 3:
            linhas.append(f"  <i>… +{len(os_eq) - 3} OS</i>")
    linhas += ["", _TG_DIV, f"<i>Cabonnet · Visão de Turno · {hora_str}</i>"]
    return "\n".join(linhas)


def _build_forecast():
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        return "⏳ Sem dados disponíveis."
    agora    = datetime.now()
    hoje     = agora.date()
    hora_str = agora.strftime("%H:%M")
    hoje_str = hoje.strftime("%d/%m/%Y")
    sem_rede = [r for r in rows if not (r.get("servico") or "").upper().startswith("REDE")]
    is_hoje  = lambda r: _parse_data_br(r.get("dataexecucao") or r.get("databaixa")) == hoje
    exec_h   = [r for r in sem_rede if r.get("descsituacao") == "Concluída" and "Sem" not in (r.get("descsituacao") or "") and is_hoje(r)]
    fila     = [r for r in sem_rede if r.get("descsituacao") in ("Pendente", "Atendimento")]
    hora_inicio = agora.replace(hour=7, minute=0, second=0, microsecond=0)
    hora_fim    = agora.replace(hour=18, minute=30, second=0, microsecond=0)
    decorrido   = max((agora - hora_inicio).total_seconds() / 3600, 0.25)
    restante    = max((hora_fim - agora).total_seconds() / 3600, 0)
    ritmo       = len(exec_h) / decorrido
    proj        = round(len(exec_h) + ritmo * restante)
    fila_restante = len(fila)
    total_op    = len(exec_h) + fila_restante
    taxa_atual  = round(len(exec_h) / total_op * 100) if total_op else 0
    taxa_proj   = round(proj / total_op * 100) if total_op else 0
    icon_proj   = "🟢" if taxa_proj >= 80 else "🟡" if taxa_proj >= 60 else "🔴"
    bar_proj    = "▓" * min(10, round(taxa_proj / 10)) + "░" * max(0, 10 - round(taxa_proj / 10))
    linhas = [f"🔭 <b>Projeção do Dia — {hoje_str}</b>",
              f"<i>Base: ritmo das últimas {decorrido:.1f}h · {hora_str}</i>", _TG_DIV, "",
              f"✅ Executadas até agora: <b>{len(exec_h)}</b>",
              f"📋 Na fila: <b>{fila_restante}</b>  ·  Tempo restante: <b>{restante:.1f}h</b>",
              f"⚡ Ritmo atual: <b>{ritmo:.1f} OS/h</b>", "",
              f"{icon_proj} Projeção ao fim do dia: <b>~{proj} OS</b>",
              f"  <code>{bar_proj} {taxa_proj}%</code>", ""]
    if taxa_proj >= 80:
        linhas.append("✅ <b>Meta provável de ser atingida</b> no ritmo atual.")
    elif taxa_proj >= 60:
        linhas.append(f"🟡 <b>Meta em risco.</b> Projeção indica ~{total_op - proj} OS na fila ao fechar.")
    else:
        linhas.append(f"🔴 <b>Meta em perigo.</b> ~{total_op - proj} OS devem ficar sem execução.")
    linhas += ["", _TG_DIV, f"<i>Cabonnet · Forecast · {hora_str}</i>"]
    return "\n".join(linhas)


def _build_listarede():
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    atend = [r for r in rows if r.get("descsituacao") == "Atendimento"
             and (r.get("servico") or "").upper().startswith("REDE")]
    if not atend:
        return "✅ Nenhuma OS de <b>Rede</b> em Atendimento no momento."
    hoje     = date.today()
    hoje_str = hoje.strftime("%d/%m/%Y")
    hora_str = datetime.now().strftime("%H:%M")
    por_eq   = {}
    for r in atend:
        eq = (r.get("nomedaequipe") or "Sem equipe").strip()
        por_eq.setdefault(eq, []).append(r)
    linhas = [f"📡 <b>OS REDE EM ATENDIMENTO — {len(atend)} total</b>",
              f"📅 <i>{hoje_str} às {hora_str}</i>", _TG_DIV]
    for eq in sorted(por_eq.keys()):
        grupo = por_eq[eq]
        linhas.append(f"\n👤 <b>{_tg_esc(eq)}</b> — {len(grupo)} OS")
        for r in grupo:
            numos  = r.get("numos", "?")
            cidade = (r.get("nomedacidade") or "").upper()
            serv   = _tg_esc((r.get("servico") or "")[:30])
            dt     = r.get("dataagendamento") or "Sem data"
            linhas.append(f"  /os{numos} · {cidade} · {serv} · {dt}")
    linhas += ["", _TG_DIV, f"<i>Cabonnet · Rede · {hoje_str}</i>"]
    return "\n".join(linhas)


def _build_producao_equipe(query):
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        try:
            csv_a = frames_to_csv(grafana_post(SQL_AGENDADO))
            _dados_cache_update(csv_agendado=csv_a or "")
            with state._dados_cache_lock:
                rows = list(state._dados_cache["agendado"])
        except Exception as ex:
            log.warning("[producao] Erro ao buscar dados: %s", str(ex)[:120])
    if not rows:
        return "⏳ Sem dados disponíveis. Verifique a conexão com o Grafana."
    import re as _re
    hoje     = date.today()
    hoje_str = hoje.strftime("%d/%m/%Y")
    hora_str = datetime.now().strftime("%H:%M")
    query_u  = query.strip().upper()
    frentes_op = _OPERADORA_GRUPOS.get(query_u)
    _eh_frente = bool(_re.match(r'^F\d+$', query_u))
    def _match(r):
        raw   = (r.get("nomedaequipe") or "").upper()
        norm  = _re.sub(r'([A-Z])\s+(\d)', r'\1\2', raw)
        abrev = _abrev_equipe(raw).upper()
        abrev_norm = _re.sub(r'([A-Z])\s+(\d)', r'\1\2', abrev)
        if frentes_op:
            return "INST" in abrev_norm and any(f in abrev_norm for f in frentes_op)
        if _eh_frente:
            if "REDE" in abrev_norm or "REDE" in norm: return False
        return query_u in abrev_norm or query_u in norm
    is_hoje_exec = lambda r: _parse_data_br(r.get("dataexecucao") or r.get("dataagendamento")) == hoje
    eq_rows = [r for r in rows if _match(r)]
    if not eq_rows:
        tokens    = query_u.split()
        sugestoes = set()
        for r in rows:
            abrev = _abrev_equipe(r.get("nomedaequipe") or "")
            if abrev and any(t in abrev.upper() for t in tokens):
                sugestoes.add(abrev)
        msg = f"❌ Equipe não encontrada: <b>{_tg_esc(query)}</b>"
        if sugestoes:
            msg += "\n\nEquipes com nome similar:\n" + "\n".join(f"  • {_tg_esc(s)}" for s in sorted(sugestoes)[:8])
        return msg
    grupos: dict = {}
    for r in eq_rows:
        raw   = r.get("nomedaequipe") or ""
        chave = _abrev_equipe(raw) or raw
        grupos.setdefault(chave, []).append(r)
    lines = [f"📊 <b>PRODUÇÃO — {_tg_esc(query.upper())}</b>",
             f"{hoje_str} às {hora_str}", _TG_DIV]
    for eq_name, grp in sorted(grupos.items()):
        em_atend   = [r for r in grp if r.get("descsituacao") == "Atendimento"]
        concl_hoje = [r for r in grp if r.get("descsituacao") == "Concluída" and is_hoje_exec(r)]
        pendentes  = [r for r in grp if r.get("descsituacao") == "Pendente"]
        total_ativas = len(em_atend) + len(pendentes)
        status_icon  = "✅" if concl_hoje else ("⏳" if total_ativas else "⛔")
        lines += ["", f"{status_icon} <b>{_tg_esc(eq_name)}</b>",
                  f"  ▸ Em Atendimento: <b>{len(em_atend)}</b>",
                  f"  ▸ Concluídas hoje: <b>{len(concl_hoje)}</b>",
                  f"  ▸ Pendentes na fila: <b>{len(pendentes)}</b>"]
        def _hora(campo, r):
            v = (r.get(campo) or "")
            return v[-5:] if len(v) >= 5 and ":" in v[-5:] else "—"
        def _os_line(r, modo="pendente"):
            num     = str(r.get("numos") or "?")
            num_lnk = f"/{num}" if num.isdigit() else num
            cliente = _tg_esc((r.get("nomecliente") or "?")[:22])
            tipo    = _tg_esc((r.get("tiposervico") or "?")[:18])
            agend   = _tg_esc(r.get("dataagendamento") or "—")
            if modo == "concluida":
                inicio = _hora("datainicio", r); fim = _hora("dataexecucao", r)
                return f"  ✅ {num_lnk} · {agend} · {cliente}\n      {inicio}→{fim} · {tipo}"
            if modo == "atendimento":
                inicio  = _hora("datainicio", r)
                prefixo = f"iníc {inicio}" if inicio != "—" else "aguardando"
                return f"  🔧 {num_lnk} · {agend} · {cliente}\n      {prefixo} · {tipo}"
            return f"  • {num_lnk} · {agend} · {cliente}\n      {tipo}"
        if em_atend:
            lines.append("\n<b>Em atendimento:</b>")
            for r in em_atend[:12]: lines.append(_os_line(r, modo="atendimento"))
            if len(em_atend) > 12: lines.append(f"  <i>+{len(em_atend)-12} OS omitidas</i>")
        if concl_hoje:
            lines.append("\n<b>Concluídas hoje:</b>")
            for r in sorted(concl_hoje, key=lambda x: x.get("datainicio") or "")[:12]:
                lines.append(_os_line(r, modo="concluida"))
            if len(concl_hoje) > 12: lines.append(f"  <i>+{len(concl_hoje)-12} OS omitidas</i>")
    lines += ["", _TG_DIV, f"<i>Cabonnet · Gestão de OS · {hoje_str}</i>"]
    return "\n".join(lines)


def _build_os_busca(termo, chat_id_override=None, callback_prefix="os"):
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    termo      = termo.strip()
    termo_norm = _normalizar_busca(termo)
    if termo_norm.startswith("C") and termo[1:].isdigit():
        codigo     = termo[1:]
        resultados = [r for r in rows if str(r.get("codigocontrato") or "") == codigo]
        modo       = f"contrato <b>{_tg_esc(codigo)}</b>"
    elif termo_norm.startswith("A") and termo[1:].isdigit():
        codigo     = termo[1:]
        resultados = [r for r in rows if str(r.get("codigoassinante") or "") == codigo]
        modo       = f"assinante <b>{_tg_esc(codigo)}</b>"
    else:
        resultados = [r for r in rows if termo_norm in _normalizar_busca(r.get("nomecliente") or "")]
        modo       = f"nome <i>{_tg_esc(termo)}</i>"
    if not resultados:
        return f"🔍 Nenhuma OS encontrada para {modo}.", None
    if len(resultados) == 1:
        numos_unico = str(resultados[0].get("numos"))
        if callback_prefix == "ficha":
            txt, mkp = _build_os_ficha_rapida(numos_unico)
            return txt, (mkp or {}).get("inline_keyboard")
        return _build_os_detalhes(numos_unico), None
    sit_icon = lambda s: ("✅" if "Concluída" in s and "Sem" not in s else "🔵" if "Atendimento" in s else "⚠️" if "Sem Execução" in s else "🟡")
    linhas   = [f"🔍 <b>{len(resultados)} OS encontradas</b> para {modo}:", _TG_DIV]
    botoes   = []
    for r in resultados[:20]:
        numos  = str(r.get("numos", "?"))
        sit    = r.get("descsituacao") or ""
        eq     = (r.get("nomedaequipe") or "Sem equipe").strip()[:20]
        dt     = r.get("dataagendamento") or r.get("dataatendimento") or "—"
        ts     = (r.get("tiposervico") or "").replace("INSTALACAO","Inst").replace("MANUTENCAO","Manut")
        linhas.append(f"  {sit_icon(sit)} <b>OS {numos}</b> · {_tg_esc(eq)} · {_tg_esc(ts)} · {_tg_esc(dt)}")
        botoes.append([{"text": f"OS {numos}", "callback_data": f"{callback_prefix}:{numos}"}])
    if len(resultados) > 20:
        linhas.append(f"<i>… e mais {len(resultados)-20} OS. Refine a busca.</i>")
    return "\n".join(linhas), botoes


def _build_os_detalhes(numos_str):
    try:
        numos_int = int(numos_str)
    except ValueError:
        return f"❌ Número inválido: <code>{_tg_esc(numos_str)}</code>"
    try:
        rows = frames_to_dict_list(grafana_post(sql_detalhes(numos_int)))
    except Exception as ex:
        return f"❌ Erro ao buscar OS {numos_str}: {_tg_esc(str(ex)[:100])}"
    if not rows:
        return f"❌ OS <b>{numos_str}</b> não encontrada."
    r = rows[0]
    ocorrencias = []
    try:
        ocorrencias = frames_to_dict_list(grafana_post(sql_ocorrencias(numos_int)))
    except Exception as ex:
        log.warning("[OS %s] Falha ao buscar ocorrências: %s", numos_str, str(ex)[:120])
    materiais = []
    materiais_retirados = []
    try:
        materiais = frames_to_dict_list(grafana_post(sql_materiais_utilizados(numos_int)))
    except Exception as ex:
        log.warning("[OS %s] Falha ao buscar materiais utilizados: %s", numos_str, str(ex)[:120])
    try:
        materiais_retirados = frames_to_dict_list(grafana_post(sql_materiais_retirados(numos_int)))
    except Exception as ex:
        log.warning("[OS %s] Falha ao buscar materiais retirados: %s", numos_str, str(ex)[:120])
    def v(campo, fb="—"):
        return _tg_esc(str(r.get(campo) or "").strip() or fb)
    situacao = r.get("descsituacao") or ""
    sit_icon = ("✅" if "Concluída" in situacao and "Sem" not in situacao
                else "🔵" if "Atendimento" in situacao
                else "⚠️" if "Sem Execução" in situacao
                else "🟡")
    linhas = [f"📋 <b>OS {numos_str}</b>  {sit_icon} {_tg_esc(situacao)}", _TG_DIV, "",
              f"👤 <b>Cliente:</b>     {v('nomecliente')}",
              f"🏢 <b>Empresa:</b>     {v('empresa')}",
              f"📍 <b>Cidade:</b>      {v('nomedacidade')}",
              f"🏠 <b>Endereço:</b>    {v('logradouro')} {v('numero')} {v('complemento')}".rstrip(),
              f"🏘 <b>Bairro:</b>      {v('bairro')}",
              f"🔑 <b>Contrato:</b>    {v('codigocontrato')}", "",
              f"🔧 <b>Tipo:</b>        {v('tiposervico')}",
              f"📝 <b>Serviço:</b>     {v('servico')}",
              f"👥 <b>Equipe:</b>      {v('nomedaequipe')}"]
    if r.get("equipeexecutou") and r.get("equipeexecutou") != r.get("nomedaequipe"):
        linhas.append(f"👷 <b>Executou:</b>     {v('equipeexecutou')}")
    periodo       = (r.get("periodo")        or "").strip()
    horaatend     = (r.get("horaatendimento") or "").strip()
    periodo_label = periodo
    if horaatend:
        periodo_label = f"{periodo} · {horaatend}h" if periodo else horaatend
    linhas += ["", f"📅 <b>Cadastro:</b>    {v('datacadastro')}",
               f"📅 <b>Agendamento:</b> {v('dataagendamento')}"]
    if periodo_label: linhas.append(f"🕰 <b>Período:</b>      {_tg_esc(periodo_label)}")
    if r.get("datainicio"):   linhas.append(f"🕐 <b>Início:</b>       {v('datainicio')}")
    if r.get("dataexecucao"): linhas.append(f"🕐 <b>Execução:</b>     {v('dataexecucao')}")
    if r.get("databaixa"):    linhas.append(f"🕐 <b>Baixa:</b>        {v('databaixa')}")
    obs      = (r.get("observacoes")      or "").strip()
    obs_crit = (r.get("observacaocritica") or "").strip()
    if obs:      linhas += ["", "📝 <b>Observações:</b>", f"<i>{_tg_esc(obs[:3000])}</i>"]
    if obs_crit: linhas += ["", "⚠️ <b>Obs. Crítica:</b>", f"<i>{_tg_esc(obs_crit[:3000])}</i>"]
    if ocorrencias:
        linhas += ["", f"🗒 <b>Ocorrências ({len(ocorrencias)}):</b>"]
        for oc in ocorrencias[:6]:
            data = _tg_esc(str(oc.get("data") or oc.get("dataocorrencia") or "")[:16])
            desc = _tg_esc(str(oc.get("descricao") or oc.get("ocorrencia") or str(oc))[:80])
            linhas.append(f"  • {data} {desc}".strip())
        if len(ocorrencias) > 6: linhas.append(f"  <i>+{len(ocorrencias)-6} ocorrências</i>")
    def _fmt_materiais(itens, titulo, emoji):
        bloco = ["", f"{emoji} <b>{titulo} ({len(itens)}):</b>"]
        for m in itens[:20]:
            mat = _tg_esc((m.get("material") or "?")[:45])
            qtd = _tg_esc(str(m.get("quantidade") or "").strip())
            uid = _tg_esc((m.get("identificadorunico") or "").strip()[:28])
            linha = f"  • {mat}" + (f" × {qtd}" if qtd else "")
            if uid:
                linha += f"\n      🔖 <code>{uid}</code>"
            bloco.append(linha)
        if len(itens) > 20:
            bloco.append(f"  <i>+{len(itens)-20} itens</i>")
        return bloco
    if materiais:
        linhas += _fmt_materiais(materiais, "Equipamentos/Materiais utilizados", "📦")
    if materiais_retirados:
        linhas += _fmt_materiais(materiais_retirados, "Equipamentos retirados", "📤")
    linhas += ["", _TG_DIV, f"<i>Cabonnet · OS {numos_str}</i>"]
    return "\n".join(linhas)


def _build_os_ficha_rapida(numos_str):
    try:
        numos_int = int(numos_str)
    except ValueError:
        return f"❌ Número inválido: <code>{_tg_esc(numos_str)}</code>", None
    with state._dados_cache_lock:
        cache_hits = [r for r in state._dados_cache["agendado"] if str(r.get("numos")) == numos_str]
    r = cache_hits[0] if cache_hits else None
    if r is None:
        try:
            rows = frames_to_dict_list(grafana_post(sql_detalhes(numos_int)))
            r    = rows[0] if rows else None
        except Exception as ex:
            return f"❌ Erro ao buscar OS {numos_str}: {_tg_esc(str(ex)[:100])}", None
    if r is None:
        return f"❌ OS <b>{numos_str}</b> não encontrada.", None
    def v(campo, fb="—"):
        return _tg_esc(str(r.get(campo) or "").strip() or fb)
    situacao    = r.get("descsituacao") or ""
    sit_icon    = ("✅" if "Concluída" in situacao and "Sem" not in situacao
                   else "🔵" if "Atendimento" in situacao
                   else "⚠️" if "Sem Execução" in situacao
                   else "🟡")
    equipe      = (r.get("nomedaequipe") or "Sem equipe").strip()
    equipe_exec = (r.get("equipeexecutou") or "").strip()
    logr        = v("logradouro", ""); num = v("numero", ""); bairro = v("bairro", "")
    endereco    = f"{logr} {num}".strip() or "—"
    linhas = [f"📋 <b>OS {numos_str}</b>  {sit_icon} {_tg_esc(situacao)}", _TG_DIV,
              f"👤 {v('nomecliente')}",
              f"🏙 {v('nomedacidade')}" + (f" · {_tg_esc(bairro)}" if bairro and bairro != "—" else ""),
              f"📍 {_tg_esc(endereco)}", f"🔧 {v('tiposervico')}", f"👷 {_tg_esc(equipe)}"]
    if equipe_exec and equipe_exec != equipe:
        linhas.append(f"✔️ <b>Executou:</b> {_tg_esc(equipe_exec)}")
    linhas.append(f"📅 <b>Agendado:</b> {v('dataagendamento')}")
    exec_ = (r.get("dataexecucao") or "").strip()
    if exec_: linhas.append(f"🕐 <b>Executado:</b> {_tg_esc(exec_)}")
    linhas += [_TG_DIV, f"<i>Cabonnet · OS {numos_str}</i>"]
    markup = {"inline_keyboard": [[
        {"text": "🔄 Atualizar",      "callback_data": f"ficha:{numos_str}"},
        {"text": "📄 Ficha completa", "callback_data": f"os:{numos_str}"},
    ]]}
    return "\n".join(linhas), markup


def _build_agenda(data_str=None):
    hoje = datetime.now()
    if not data_str or data_str.lower().strip() in ("", "hoje"):
        data_alvo = hoje; label = "hoje"
    elif _normalizar_busca(data_str) == "amanha":
        data_alvo = hoje + timedelta(days=1); label = "amanhã"
    else:
        data_alvo = None
        for fmt in ("%d/%m/%Y", "%d/%m"):
            try:
                data_alvo = datetime.strptime(data_str.strip(), fmt)
                if fmt == "%d/%m": data_alvo = data_alvo.replace(year=hoje.year)
                break
            except ValueError:
                pass
        if data_alvo is None:
            return (f"❌ Data inválida: <code>{_tg_esc(data_str)}</code>\n"
                    "Uso: /agenda  ·  /agenda amanhã  ·  /agenda 25/04")
        label = data_alvo.strftime("%d/%m")
    alvo_str = data_alvo.strftime("%d/%m/%Y")
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    agendadas = [r for r in rows if (r.get("dataagendamento") or "") == alvo_str]
    if not agendadas:
        return f"📅 Nenhuma OS agendada para <b>{label} ({alvo_str})</b>."
    sit_icon  = lambda s: ("✅" if "Concluída" in s and "Sem" not in s else "🔵" if "Atendimento" in s else "⚠️" if "Sem Execução" in s else "🟡")
    total     = len(agendadas)
    exec_ok   = sum(1 for r in agendadas if "Concluída" in (r.get("descsituacao") or "") and "Sem" not in (r.get("descsituacao") or ""))
    atend_cnt = sum(1 for r in agendadas if "Atendimento" in (r.get("descsituacao") or ""))
    pend      = total - exec_ok - atend_cnt
    linhas    = [f"📅 <b>Agenda de {label} — {alvo_str}</b>",
                 f"Total: {total} OS  ·  ✅ {exec_ok} exec  ·  🔵 {atend_cnt} atend  ·  🟡 {pend} pend", _TG_DIV]
    por_equipe = defaultdict(list)
    for r in agendadas:
        eq = (r.get("nomedaequipe") or "Sem equipe").strip()
        por_equipe[eq].append(r)
    os_exibidas = 0
    for equipe in sorted(por_equipe):
        itens = por_equipe[equipe]
        linhas.append(f"\n<b>{_tg_esc(equipe)} ({len(itens)})</b>")
        for r in itens[:6]:
            numos = str(r.get("numos", "?"))
            sit   = r.get("descsituacao") or ""
            nome  = _tg_esc((r.get("nomecliente") or "?")[:28])
            ts    = (r.get("tiposervico") or "").replace("INSTALACAO","Inst").replace("MANUTENCAO","Manut")
            linhas.append(f"  {sit_icon(sit)} <b>{numos}</b> · {nome} · {_tg_esc(ts)}")
            os_exibidas += 1
        if len(itens) > 6: linhas.append(f"  <i>… +{len(itens)-6} OS</i>")
        if os_exibidas >= 60:
            linhas.append("<i>Limite de exibição atingido.</i>"); break
    return "\n".join(linhas)


def _build_pendentes_semequipe():
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        return "⏳ Sem dados disponíveis. Acesse o dashboard para carregar os dados."
    hoje     = date.today()
    hora_str = datetime.now().strftime("%H:%M")
    hoje_str = hoje.strftime("%d/%m/%Y")
    sem_equipe = [r for r in rows if r.get("descsituacao") == "Pendente"
                  and not (r.get("nomedaequipe") or "").strip()]
    if not sem_equipe:
        return (f"✅ <b>Sem OS pendentes sem equipe!</b>\n"
                f"<i>Todas as OS da fila têm equipe atribuída.</i>\n<i>Consultado às {hora_str}</i>")
    def _aging(r):
        dt = _parse_data_br(r.get("datacadastro", ""))
        return (hoje - dt).days if dt else 0
    sem_equipe.sort(key=_aging, reverse=True)
    linhas = [f"⚠️ <b>OS Pendentes sem Equipe — {hoje_str}</b>",
              f"Total: <b>{len(sem_equipe)}</b> OS aguardando agendamento", _TG_DIV]
    for r in sem_equipe[:25]:
        numos  = str(r.get("numos", "?"))
        nome   = _tg_esc((r.get("nomecliente") or "?")[:28])
        cidade = _tg_esc((r.get("nomedacidade") or "")[:20])
        ts     = (r.get("tiposervico") or "").replace("INSTALACAO", "Inst").replace("MANUTENCAO", "Manut")
        aging  = _aging(r)
        age_s  = f" · <b>{aging}d</b>" if aging else ""
        linhas.append(f"🟡 <b>{numos}</b> · {nome}" + (f" · {_tg_esc(cidade)}" if cidade else "") + f" · {_tg_esc(ts)}{age_s}")
    if len(sem_equipe) > 25:
        linhas.append(f"<i>… +{len(sem_equipe)-25} OS não exibidas</i>")
    linhas += ["", f"<i>Use /os &lt;número&gt; para detalhes · Atualizado às {hora_str}</i>"]
    return "\n".join(linhas)


def _build_semana():
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        return "⏳ Sem dados disponíveis. Acesse o dashboard para carregar os dados."
    hoje     = date.today()
    hora_str = datetime.now().strftime("%H:%M")
    seg      = hoje - timedelta(days=hoje.weekday())
    dias_br  = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
    linhas   = [f"📊 <b>Resumo Semanal — Produtividade</b>",
                f"<i>Semana de {seg.strftime('%d/%m')} a {hoje.strftime('%d/%m/%Y')}</i>", _TG_DIV]
    total_exec_sem = 0; total_pend_sem = 0
    for offset in range(hoje.weekday() + 1):
        dia     = seg + timedelta(days=offset)
        dia_str = dia.strftime("%d/%m/%Y")
        label   = dias_br[dia.weekday()]
        exec_dia = [r for r in rows if "Concluída" in (r.get("descsituacao") or "") and "Sem" not in (r.get("descsituacao") or "")
                    and _parse_data_br(r.get("dataexecucao") or r.get("databaixa")) == dia]
        pend_dia  = [r for r in rows if r.get("descsituacao") == "Pendente"
                     and _parse_data_br(r.get("dataagendamento")) == dia]
        atend_dia = [r for r in rows if r.get("descsituacao") == "Atendimento"
                     and _parse_data_br(r.get("dataagendamento")) == dia]
        agend_total = len(exec_dia) + len(pend_dia) + len(atend_dia)
        taxa        = round(len(exec_dia) / agend_total * 100) if agend_total else 0
        emoji       = "🟢" if taxa >= 80 else "🟡" if taxa >= 50 else ("⚪" if not agend_total else "🔴")
        total_exec_sem += len(exec_dia)
        if dia == hoje: total_pend_sem += len(pend_dia) + len(atend_dia)
        hoje_mark = " ← hoje" if dia == hoje else ""
        if agend_total:
            linhas.append(f"{emoji} <b>{label} {dia.strftime('%d/%m')}</b>  ✅{len(exec_dia)} / 📅{agend_total}  ({taxa}%){hoje_mark}")
        else:
            linhas.append(f"⚪ <b>{label} {dia.strftime('%d/%m')}</b>  Sem OS agendadas{hoje_mark}")
    linhas += [_TG_DIV, f"✅ <b>Total executadas na semana: {total_exec_sem}</b>",
               f"⏳ Ainda na fila hoje: <b>{total_pend_sem}</b>", "",
               "<i>Use /executadas · /pendentes · /listatendimento para mais detalhes</i>",
               f"<i>Atualizado às {hora_str}</i>"]
    return "\n".join(linhas)


def _build_semexec(operadora=None):
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        return "⏳ Sem dados disponíveis."
    hoje     = date.today()
    hoje_str = hoje.strftime("%d/%m/%Y")
    hora_str = datetime.now().strftime("%H:%M")
    label    = f" — {operadora}" if operadora else ""
    base     = _filter_by_operadora(rows, operadora) if operadora else rows
    sem_exec = [r for r in base if "Sem Execução" in (r.get("descsituacao") or "")
                and _parse_data_br(r.get("databaixa") or r.get("dataagendamento")) == hoje]
    if not sem_exec:
        return (f"✅ <b>Sem Execução{label} — {hoje_str}</b>\n"
                f"<i>Nenhuma OS encerrada sem execução hoje. · {hora_str}</i>")
    por_equipe = {}
    for r in sem_exec:
        eq = _abrev_equipe(r.get("nomedaequipe", "")) or "Sem equipe"
        por_equipe.setdefault(eq, []).append(r)
    linhas = [f"🚫 <b>Sem Execução Hoje{label} — {hoje_str}</b>",
              f"Total: <b>{len(sem_exec)}</b> OS · {hora_str}", _TG_DIV]
    for eq, os_list in sorted(por_equipe.items(), key=lambda x: -len(x[1])):
        linhas.append(f"\n⚠️ <b>{_tg_esc(eq)}</b> — {len(os_list)} OS")
        for r in os_list:
            numos   = str(r.get("numos", "?"))
            nome    = _tg_esc((r.get("nomecliente") or "?")[:28])
            cidade  = _tg_esc((r.get("nomedacidade") or "")[:16])
            servico = _tg_esc((r.get("tiposervico") or "").replace("INSTALACAO","Inst").replace("MANUTENCAO","Manut")[:18])
            linhas.append(f"  /os{numos} · {nome} · {cidade} · {servico}")
    linhas += ["", _TG_DIV, f"<i>Cabonnet · Sem Execução · {hoje_str}</i>"]
    return "\n".join(linhas)


def _build_comparativo():
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        return "⏳ Sem dados disponíveis."
    hoje      = date.today()
    ontem     = hoje - timedelta(days=1)
    hoje_str  = hoje.strftime("%d/%m/%Y")
    ontem_str = ontem.strftime("%d/%m")
    hora_str  = datetime.now().strftime("%H:%M")
    sem_rede  = [r for r in rows if not (r.get("servico") or "").upper().startswith("REDE")]
    def _exec_dia(dia):
        return [r for r in sem_rede if "Concluída" in (r.get("descsituacao") or "") and "Sem" not in (r.get("descsituacao") or "")
                and _parse_data_br(r.get("dataexecucao") or r.get("databaixa")) == dia]
    def _sem_exec_dia(dia):
        return [r for r in rows if "Sem Execução" in (r.get("descsituacao") or "")
                and _parse_data_br(r.get("databaixa") or r.get("dataagendamento")) == dia]
    def _inst_dia(lista):
        return sum(1 for r in lista if "INSTALAC" in (r.get("tiposervico") or "").upper())
    exec_h = _exec_dia(hoje); exec_o = _exec_dia(ontem)
    se_h   = _sem_exec_dia(hoje); se_o = _sem_exec_dia(ontem)
    fila_h = [r for r in sem_rede if r.get("descsituacao") in ("Pendente","Atendimento")]
    sla_h  = _calc_sla_exc(fila_h, hoje)
    diff_exec = len(exec_h) - len(exec_o)
    diff_se   = len(se_h)   - len(se_o)
    def _delta(n, invert=False):
        if n == 0: return "→ igual"
        sinal = "+" if n > 0 else ""
        icon  = ("📈" if n > 0 else "📉") if not invert else ("📉" if n > 0 else "📈")
        return f"{icon} {sinal}{n}"
    linhas = [f"📊 <b>Comparativo Diário — {hoje_str}</b>",
              f"<i>Hoje vs. {ontem_str} · {hora_str}</i>", _TG_DIV, "",
              f"✅ <b>Executadas:</b>   hoje <b>{len(exec_h)}</b>  ·  ontem {len(exec_o)}  ·  {_delta(diff_exec)}",
              f"   <i>Instalações: hoje {_inst_dia(exec_h)}  ·  ontem {_inst_dia(exec_o)}</i>",
              f"🚫 <b>Sem Execução:</b> hoje <b>{len(se_h)}</b>  ·  ontem {len(se_o)}  ·  {_delta(diff_se, invert=True)}",
              f"📋 <b>Fila atual:</b>   <b>{len(fila_h)}</b> OS",
              f"{'🔴 <b>SLA vencido:</b>  <b>' + str(sla_h) + '</b> OS na fila' if sla_h else '🟢 <b>SLA:</b>  Sem OS vencidas na fila'}"]
    linhas += ["", _TG_DIV, f"<i>Cabonnet · Comparativo · {hoje_str}</i>"]
    return "\n".join(linhas)


def _build_nota_instacable():
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        try:
            csv_a = frames_to_csv(grafana_post(SQL_AGENDADO))
            _dados_cache_update(csv_agendado=csv_a or "")
            with state._dados_cache_lock:
                rows = list(state._dados_cache["agendado"])
        except Exception as ex:
            log.warning("[notainstacable] Erro ao buscar dados: %s", str(ex)[:120])
    if not rows:
        return "⏳ Sem dados disponíveis. Verifique a conexão com o Grafana."
    hoje     = date.today()
    hoje_str = hoje.strftime("%d/%m/%Y")
    hora_str = datetime.now().strftime("%H:%M")
    frentes_inst = _OPERADORA_GRUPOS["INSTACABLE"]
    def _eh_instacable(r):
        import re as _re2
        raw = _re2.sub(r'([A-Z])\s+(\d)', r'\1\2', (r.get("nomedaequipe") or "").upper())
        if "INSTALAC" not in raw: return False
        return any(f in raw for f in frentes_inst)
    is_hoje_exec = lambda r: _parse_data_br(r.get("dataexecucao") or r.get("dataagendamento")) == hoje
    inst_rows  = [r for r in rows if _eh_instacable(r)]
    em_atend   = [r for r in inst_rows if r.get("descsituacao") == "Atendimento"]
    concl_hoje = [r for r in inst_rows if r.get("descsituacao") == "Concluída" and is_hoje_exec(r)]
    pendentes  = [r for r in inst_rows if r.get("descsituacao") == "Pendente"]
    sem_exec   = [r for r in inst_rows if "Sem Execução" in (r.get("descsituacao") or "")
                  and (r.get("databaixa","") or r.get("dataagendamento","")).startswith(hoje_str)]
    total_op   = len(concl_hoje) + len(em_atend) + len(pendentes)
    taxa       = round(len(concl_hoje) / total_op * 100) if total_op else 0
    taxa_em    = "🟢" if taxa >= 80 else "🟡" if taxa >= 60 else "🔴"
    inst_h     = sum(1 for r in concl_hoje if "INSTALAC" in (r.get("tiposervico") or "").upper())
    manut_h    = sum(1 for r in concl_hoje if "MANUTENC" in (r.get("tiposervico") or "").upper())
    serv_h     = len(concl_hoje) - inst_h - manut_h
    lines = ["📋 <b>FECHAMENTO DE NOTA — INSTACABLE</b>",
             f"📅 <i>{hoje_str} às {hora_str}</i>", _TG_DIV, "",
             f"🟡 Pendentes: <b>{len(pendentes)}</b>",
             f"🔵 Em Atendimento: <b>{len(em_atend)}</b>",
             f"✅ Concluídas hoje: <b>{len(concl_hoje)}</b>"]
    if inst_h or manut_h or serv_h:
        partes = []
        if inst_h:  partes.append(f"{inst_h} Inst")
        if manut_h: partes.append(f"{manut_h} Manut")
        if serv_h:  partes.append(f"{serv_h} Serv")
        lines.append(f"   <i>{'  ·  '.join(partes)}</i>")
    if sem_exec: lines.append(f"⚠️ Sem Execução: <b>{len(sem_exec)}</b>")
    lines.append(f"{taxa_em} Taxa de execução: <b>{taxa}%</b>")
    grupos: dict = {f"INST {f}": [] for f in frentes_inst}
    for r in inst_rows:
        raw   = r.get("nomedaequipe") or ""
        chave = _abrev_equipe(raw) or raw
        grupos.setdefault(chave, []).append(r)
    if grupos:
        lines += ["", f"👥 <b>Por equipe ({len(grupos)}):</b>"]
        for eq_name, grp in sorted(grupos.items()):
            eq_atend = sum(1 for r in grp if r.get("descsituacao") == "Atendimento")
            eq_concl = sum(1 for r in grp if r.get("descsituacao") == "Concluída" and is_hoje_exec(r))
            eq_pend  = sum(1 for r in grp if r.get("descsituacao") == "Pendente")
            icon     = "✅" if eq_concl else ("⏳" if eq_atend + eq_pend else "⛔")
            lines.append(f"  {icon} <b>{_tg_esc(eq_name)}</b>: {eq_concl} concl · {eq_atend} atend · {eq_pend} pend")
    lines += ["", _TG_DIV, f"<i>Escopo: Instacable · Período: Fechamento de Nota · {hoje_str}</i>"]
    return "\n".join(lines)


def _gerar_pdf_relatorio_via_browser(aba="instacable", periodo="fechamento", chat_id=None):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        log.warning("[Playwright] Nao instalado.")
        return False
    from cabonnet.auth import _create_session
    react_port = int(os.environ.get("REACT_PORT", "3000"))
    token      = _create_session()
    url_base   = f"http://localhost:{react_port}"
    log.info("[Playwright] Gerando PDF React (aba=%s, periodo=%s)...", aba, periodo)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                context = browser.new_context()
                context.add_cookies([{"name": "cbn_session", "value": token, "url": url_base}])
                page = context.new_page()
                page.set_default_timeout(90000)
                page.goto(f"{url_base}/fechamento", wait_until="networkidle")
                page.wait_for_function("() => window.__cbnFechamentoReady === true", timeout=90000)
                page.evaluate(f"window.relSetAba({aba!r})")
                page.wait_for_timeout(400)
                page.evaluate(f"window.relSetPeriodo({periodo!r})")
                page.wait_for_function("() => window.__cbnFechamentoReady === true", timeout=30000)
                page.wait_for_timeout(600)
                import json as _json
                _chat_id_js = _json.dumps(str(chat_id)) if chat_id else "null"
                result = page.evaluate(f"""async () => {{
                    return new Promise((resolve) => {{
                        const orig = window.fetch;
                        window.fetch = async (...args) => {{
                            const resp = await orig(...args);
                            const u = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
                            if (u && u.includes('/notify/telegram/pdf')) {{
                                resp.clone().json().then(d => resolve(d)).catch(e => resolve({{ok:false, error:String(e)}}));
                            }}
                            return resp;
                        }};
                        try {{ window.relatorioGerarPDF(true, {_chat_id_js}); }}
                        catch (e) {{ resolve({{ok:false, error:String(e)}}); }}
                        setTimeout(() => resolve({{ok:false, error:'timeout'}}), 75000);
                    }});
                }}""")
                ok = bool(result and result.get("ok"))
                log.info("[Playwright] PDF %s", "enviado" if ok else "falhou")
                return ok
            finally:
                browser.close()
    except Exception as ex:
        log.exception("[Playwright] Erro: %s", str(ex)[:200])
        return False


def _build_resumo_diario(periodo):
    try:
        log.info("[Telegram] Buscando dados para resumo '%s'...", periodo)
        csv_a = frames_to_csv(grafana_post(SQL_AGENDADO))
        _dados_cache_update(csv_agendado=csv_a or "")
        titulo = "🌅 <b>Resumo Matinal — Cabonnet</b>" if periodo == "manha" else "🌆 <b>Fechamento do Dia — Cabonnet</b>"
        status_text = _build_status_text()
        corpo  = status_text.split("\n", 1)[1] if "\n" in status_text else status_text
        linhas = [titulo] + corpo.split("\n")
        _telegram_send("\n".join(linhas))
        log.info("[Telegram] Resumo '%s' enviado.", periodo)
    except Exception as ex:
        log.warning("[Telegram] Erro no resumo '%s': %s", periodo, str(ex)[:120])


def _build_manutencoes_hoje():
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        return "⏳ Sem dados disponíveis."
    hoje     = date.today()
    hoje_str = hoje.strftime("%d/%m/%Y")
    hora_str = datetime.now().strftime("%H:%M")
    manut_hoje = [r for r in rows if "MANUTENC" in (r.get("tiposervico") or "").upper()
                  and (r.get("datacadastro") or "").startswith(hoje_str)]
    if not manut_hoje:
        return (f"✅ <b>Nenhuma OS de manutenção aberta hoje.</b>\n<i>{hoje_str} às {hora_str}</i>")
    por_cidade = {}
    for r in manut_hoje:
        cidade = (r.get("nomedacidade") or "?").strip()
        bairro = (r.get("bairro") or "Bairro não informado").strip()
        por_cidade.setdefault(cidade, {}).setdefault(bairro, []).append(r)
    cidades_sorted = sorted(por_cidade.items(), key=lambda x: -sum(len(v) for v in x[1].values()))
    linhas = [f"🔧 <b>Manutenções Abertas Hoje — {hoje_str}</b>",
              f"Total: <b>{len(manut_hoje)}</b> OS · {hora_str}", _TG_DIV]
    for cidade, bairros in cidades_sorted:
        total_cidade = sum(len(v) for v in bairros.values())
        linhas.append(f"\n📍 <b>{_tg_esc(cidade)}</b> — {total_cidade} OS")
        for bairro, os_list in sorted(bairros.items(), key=lambda x: -len(x[1])):
            icon  = "🔴" if len(os_list) >= 3 else "🟡" if len(os_list) == 2 else "🟢"
            aviso = "  ⚠️ <i>Provável problema CTO/PON</i>" if len(os_list) >= 3 else ""
            linhas.append(f"  {icon} <b>{_tg_esc(bairro)}</b> — {len(os_list)} OS{aviso}")
            for r in os_list[:4]:
                numos  = str(r.get("numos", "?"))
                sit    = r.get("descsituacao") or ""
                sit_ic = "🔵" if "Atendimento" in sit else "🟡"
                eq     = _tg_esc(_abrev_equipe(r.get("nomedaequipe", "")) or "Sem equipe")
                linhas.append(f"    {sit_ic} <b>{numos}</b> · {eq}")
            if len(os_list) > 4: linhas.append(f"    <i>… +{len(os_list)-4} OS</i>")
    linhas += ["", f"<i>Use /os &lt;número&gt; para detalhes · {hora_str}</i>"]
    return "\n".join(linhas)


def _sugerir_equipes_bairro(bairro, cidade, rows):
    if not bairro or bairro.strip() in ("", "—"): return []
    bairro_up = bairro.strip().upper()
    cidade_up = cidade.strip().upper()
    eq_cnt = {}
    for r in rows:
        if r.get("descsituacao") != "Atendimento": continue
        if not _is_campo(r.get("nomedaequipe", "")): continue
        if (r.get("bairro") or "").strip().upper() != bairro_up: continue
        if (r.get("nomedacidade") or "").strip().upper() != cidade_up: continue
        eq = _abrev_equipe(r.get("nomedaequipe", "")) or "?"
        eq_cnt[eq] = eq_cnt.get(eq, 0) + 1
    return sorted(eq_cnt.items(), key=lambda x: -x[1])
