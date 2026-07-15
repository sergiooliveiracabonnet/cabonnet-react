# -*- coding: utf-8 -*-
"""
cabonnet/bot.py — Telegram bot: polling de atualizações + dispatch de comandos.
"""

import logging
import sqlite3
import threading
import time as _time_mod
from datetime import datetime

from cabonnet.config import (
    TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
    TELEGRAM_CHAT_INSTACABLE, TELEGRAM_CHAT_WES,
    TELEGRAM_CHAT_ALERTAS, TELEGRAM_CHAT_REDE,
    TELEGRAM_CHAT_OPERACIONAL_THM,
    _DB_PATH, _OPERADORA_LABEL,
)
from cabonnet import state
from cabonnet.cache import _dados_cache_update
from cabonnet.telegram import (
    _telegram_enabled, _tg_get_session, _telegram_send, _telegram_send_long,
    _tg_esc, _operadora_for_chat, _TG_DIV,
)
from cabonnet.grafana import grafana_post, frames_to_csv, SQL_AGENDADO
from cabonnet.images import _build_img_resumo, _build_img_detalhado, _telegram_send_image, _PIL_OK
from cabonnet.builders import (
    _build_status_text, _build_executadas_hoje, _build_listatendimento,
    _build_ordens_resumo, _build_ordens_detalhado, _build_pulso, _build_equipes,
    _build_meta_inst, _build_kpi, _build_sla_detalhado, _build_equipe_ficha,
    _build_aging, _build_ranking, _build_reagendadas, _build_cidade, _build_turno,
    _build_forecast, _build_listarede, _build_producao_equipe, _build_os_busca,
    _build_os_detalhes, _build_os_ficha_rapida, _build_agenda,
    _build_pendentes_semequipe, _build_semana, _build_semexec, _build_comparativo,
    _build_nota_instacable, _gerar_pdf_relatorio_via_browser,
)

log    = logging.getLogger("CaboNetServer")
log_db = logging.getLogger("CaboNetServer.DB")


def _telegram_skip_old_updates():
    url = "https://api.telegram.org/bot{}/getUpdates".format(TELEGRAM_BOT_TOKEN)
    try:
        resp = _tg_get_session().get(url, params={"timeout": 0, "offset": -1}, timeout=10)
        if resp.ok:
            updates = resp.json().get("result", [])
            if updates:
                state._tg_offset = updates[-1]["update_id"] + 1
    except Exception:
        pass


def _telegram_get_updates():
    url = "https://api.telegram.org/bot{}/getUpdates".format(TELEGRAM_BOT_TOKEN)
    try:
        resp = _tg_get_session().get(
            url,
            params={"offset": state._tg_offset, "timeout": 25, "allowed_updates": ["message", "callback_query"]},
            timeout=30,
        )
        if not resp.ok:
            return []
        updates = resp.json().get("result", [])
        if updates:
            state._tg_offset = updates[-1]["update_id"] + 1
        return updates
    except Exception as ex:
        log.debug("[Telegram] getUpdates: %s", str(ex)[:80])
        return []


def _telegram_poll_loop():
    while True:
        try:
            _telegram_poll_loop_inner()
        except Exception:
            log.exception("[Telegram] Poll loop reiniciando após erro inesperado")
            _time_mod.sleep(5)


def _telegram_poll_loop_inner():
    log.info("[Telegram] Polling de comandos iniciado")
    _telegram_skip_old_updates()

    _CMDS_INSTACABLE = {
        "/status", "/pulso", "/equipes", "/executadas",
        "/listatendimento", "/resumo", "/detalhado",
        "/meta", "/producao", "/os", "/notainstacable", "/help",
    }
    _CMDS_WES = {
        "/status", "/pulso", "/equipes", "/executadas",
        "/listatendimento", "/resumo", "/detalhado",
        "/producao", "/os", "/help",
    }
    _CMDS_THM = {
        "/status", "/pulso", "/equipes", "/executadas",
        "/listatendimento", "/resumo", "/detalhado",
        "/producao", "/os", "/help",
    }
    _CMDS_ALERTAS = {
        "/status", "/pulso", "/equipes", "/executadas", "/listatendimento",
        "/resumo", "/detalhado",
        "/meta", "/producao", "/os",
        "/notainstacable", "/notawes", "/notarede", "/notathm",
        "/kpi", "/atualizar", "/listarede",
        "/sla", "/equipe", "/aging", "/ranking", "/reagendadas",
        "/cidade", "/turno", "/forecast", "/manutencoes",
        "/semexec", "/comparativo", "/help",
    }
    _CMDS_PRODUTIVIDADE = {
        "/os", "/agenda", "/executadas",
        "/listatendimento", "/producao", "/pendentes", "/semana", "/help",
    }

    def _grupo_cmds(chat_id):
        s = str(chat_id)
        if TELEGRAM_CHAT_INSTACABLE      and s == str(TELEGRAM_CHAT_INSTACABLE):      return "INSTACABLE",    _CMDS_INSTACABLE
        if TELEGRAM_CHAT_WES             and s == str(TELEGRAM_CHAT_WES):             return "WES",           _CMDS_WES
        if TELEGRAM_CHAT_OPERACIONAL_THM and s == str(TELEGRAM_CHAT_OPERACIONAL_THM): return "THM",           _CMDS_THM
        if TELEGRAM_CHAT_ALERTAS         and s == str(TELEGRAM_CHAT_ALERTAS):         return "ALERTAS",       _CMDS_ALERTAS
        if TELEGRAM_CHAT_ID              and s == str(TELEGRAM_CHAT_ID):              return "PRODUTIVIDADE", _CMDS_PRODUTIVIDADE
        return None, set()

    while True:
        if not _telegram_enabled():
            _time_mod.sleep(60)
            continue
        try:
            updates = _telegram_get_updates()
        except Exception:
            continue

        for upd in updates:
            cq = upd.get("callback_query")
            if cq:
                cq_id   = cq.get("id")
                cq_data = (cq.get("data") or "").strip()
                cq_chat = str((cq.get("message") or {}).get("chat", {}).get("id", ""))
                try:
                    _tg_get_session().post(
                        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/answerCallbackQuery",
                        json={"callback_query_id": cq_id},
                        timeout=5,
                    )
                except Exception:
                    pass
                grp, _ = _grupo_cmds(cq_chat)
                if cq_data.startswith("ficha:") and grp:
                    numos = cq_data[6:]
                    if numos.isdigit():
                        n = numos; cc = cq_chat
                        def _cb_ficha(n=n, cc=cc):
                            txt, mkp = _build_os_ficha_rapida(n)
                            _telegram_send(txt, chat_id_override=cc, reply_markup=mkp)
                        threading.Thread(target=_cb_ficha, daemon=True).start()
                elif cq_data.startswith("os:") and grp:
                    numos = cq_data[3:]
                    if numos.isdigit():
                        n = numos; cc = cq_chat
                        threading.Thread(
                            target=lambda n=n, cc=cc: _telegram_send(_build_os_detalhes(n), chat_id_override=cc),
                            daemon=True,
                        ).start()
                elif cq_data.startswith("revisita_"):
                    _MOTIVO_MAP = {"mat": "Material", "tec": "Técnico", "cli": "Cliente", "out": "Outro"}
                    parts  = cq_data.split(":", 1)
                    prefix = parts[0].replace("revisita_", "")
                    numos  = parts[1] if len(parts) > 1 else ""
                    motivo = _MOTIVO_MAP.get(prefix, "Outro")
                    if numos:
                        def _salvar_revisita(numos=numos, motivo=motivo, cc=cq_chat):
                            try:
                                with state._db_lock:
                                    con = sqlite3.connect(_DB_PATH)
                                    con.execute(
                                        "UPDATE status_history SET revisita_motivo=? WHERE numos=? AND revisita_motivo IS NULL",
                                        (motivo, numos)
                                    )
                                    con.commit(); con.close()
                            except Exception as ex:
                                log_db.warning("Falha ao salvar motivo revisita: %s", ex)
                            _telegram_send(
                                f"✅ Revisita OS <b>{_tg_esc(numos)}</b> registrada como: <b>{_tg_esc(motivo)}</b>",
                                chat_id_override=cc,
                            )
                        threading.Thread(target=_salvar_revisita, daemon=True).start()
                continue

            msg = upd.get("message")
            if not msg: continue
            text    = (msg.get("text") or "").strip()
            chat_id = str(msg.get("chat", {}).get("id", ""))

            grupo, cmds_ok = _grupo_cmds(chat_id)
            if not grupo: continue

            operadora = _operadora_for_chat(chat_id)
            cmd_base  = text.split("@")[0].split()[0].lower() if text.startswith("/") else ""
            if cmd_base:
                log.info("[Telegram] Comando recebido: %s — grupo=%s", cmd_base, grupo)

            if cmd_base and cmd_base not in cmds_ok and not (
                text.startswith("/os") or (text.startswith("/") and text[1:].split("@")[0].isdigit())
            ):
                continue

            cid = chat_id
            if text.startswith("/"):
                _telegram_send("🔍 Buscando informações solicitadas...", chat_id_override=cid)

            if grupo in ("PRODUTIVIDADE", "ALERTAS") and not text.startswith("/"):
                termo_livre = text.strip()
                if termo_livre.isdigit() and len(termo_livre) >= 5:
                    _telegram_send("🔍 Buscando informações solicitadas...", chat_id_override=cid)
                    n = termo_livre
                    threading.Thread(
                        target=lambda n=n: _telegram_send_long(_build_os_detalhes(n), chat_id_override=cid),
                        daemon=True,
                    ).start()
                elif len(termo_livre) >= 4:
                    _telegram_send("🔍 Buscando informações solicitadas...", chat_id_override=cid)
                    t = termo_livre; pfx = "os"
                    def _busca_livre(t=t, cid=cid, pfx=pfx):
                        msg_txt, botoes = _build_os_busca(t, callback_prefix=pfx)
                        markup = {"inline_keyboard": botoes} if botoes else None
                        _telegram_send(msg_txt, chat_id_override=cid, reply_markup=markup)
                    threading.Thread(target=_busca_livre, daemon=True).start()

            elif text.startswith("/status"):
                is_rede = "rede" in text.lower() and grupo == "ALERTAS"
                op      = None if is_rede else operadora
                threading.Thread(
                    target=lambda r=is_rede, o=op: _telegram_send(_build_status_text(rede=r, operadora=o), chat_id_override=cid),
                    daemon=True,
                ).start()

            elif text.startswith("/pulso"):
                threading.Thread(target=lambda o=operadora: _telegram_send(_build_pulso(o), chat_id_override=cid), daemon=True).start()

            elif text.startswith("/equipes"):
                threading.Thread(target=lambda o=operadora: _telegram_send(_build_equipes(o), chat_id_override=cid), daemon=True).start()

            elif text.startswith("/executadas"):
                threading.Thread(
                    target=lambda o=operadora: _telegram_send(_build_executadas_hoje(o) or "Nenhuma OS executada hoje.", chat_id_override=cid),
                    daemon=True,
                ).start()

            elif text.startswith("/listatendimento"):
                threading.Thread(target=lambda o=operadora: _telegram_send_long(_build_listatendimento(o), chat_id_override=cid), daemon=True).start()

            elif text.startswith("/resumo"):
                def _enviar_resumo(o=operadora, c=cid):
                    try:
                        img = _build_img_resumo(o)
                        if img:
                            lbl = _OPERADORA_LABEL.get(o, "Todos")
                            dt  = datetime.now().strftime("%d/%m/%Y %H:%M")
                            cap = f"<b>RESUMO POR EQUIPE — {lbl}</b>\n<i>{dt} · menor → maior</i>"
                            _telegram_send_image(img, cap, c)
                        elif not _PIL_OK:
                            _telegram_send("⚠️ Pillow não instalado no servidor.", chat_id_override=c)
                        else:
                            _telegram_send("⏳ Sem dados. Abra o dashboard para carregar as OS.", chat_id_override=c)
                    except Exception as ex:
                        log.exception("[/resumo] Erro ao gerar imagem")
                        _telegram_send(f"❌ Erro ao gerar relatório: {str(ex)[:80]}", chat_id_override=c)
                threading.Thread(target=_enviar_resumo, daemon=True).start()

            elif text.startswith("/detalhado"):
                def _enviar_detalhado(o=operadora, c=cid):
                    try:
                        img = _build_img_detalhado(o)
                        if img:
                            lbl = _OPERADORA_LABEL.get(o, "Todos")
                            dt  = datetime.now().strftime("%d/%m/%Y %H:%M")
                            cap = f"<b>RELATÓRIO DETALHADO — {lbl}</b>\n<i>{dt} · todas as OS por equipe</i>"
                            _telegram_send_image(img, cap, c, as_document=True)
                        elif not _PIL_OK:
                            _telegram_send("⚠️ Pillow não instalado no servidor.", chat_id_override=c)
                        else:
                            _telegram_send("⏳ Sem dados. Abra o dashboard para carregar as OS.", chat_id_override=c)
                    except Exception as ex:
                        log.exception("[/detalhado] Erro ao gerar imagem")
                        _telegram_send(f"❌ Erro ao gerar relatório: {str(ex)[:80]}", chat_id_override=c)
                threading.Thread(target=_enviar_detalhado, daemon=True).start()

            elif text.startswith("/meta"):
                op_meta = operadora if grupo != "ALERTAS" else None
                threading.Thread(target=lambda o=op_meta: _telegram_send(_build_meta_inst(o), chat_id_override=cid), daemon=True).start()

            elif text.startswith("/producao"):
                parts = text.split(None, 1)
                query = parts[1].strip() if len(parts) > 1 else ""
                if not query:
                    ex_inst = "  /producao INST F01\n  /producao F04" if grupo in ("INSTACABLE", "ALERTAS") else ""
                    ex_wes  = "  /producao WES\n  /producao MANUT F08" if grupo in ("WES", "ALERTAS") else ""
                    exemplos = "\n".join(filter(None, [ex_inst, ex_wes]))
                    _telegram_send(f"❌ Informe a equipe.\nUso: <code>/producao &lt;sigla&gt;</code>\n\n{exemplos}", chat_id_override=cid)
                else:
                    q = query
                    def _enviar_producao(q=q, cid=cid):
                        try: _telegram_send(_build_producao_equipe(q), chat_id_override=cid)
                        except Exception: log.exception("[/producao] Falha query=%r", q); _telegram_send("⚠️ Erro interno.", chat_id_override=cid)
                    threading.Thread(target=_enviar_producao, daemon=True).start()

            elif text.startswith("/agenda"):
                arg = " ".join(text.split()[1:]) if len(text.split()) > 1 else ""
                def _enviar_agenda(arg=arg, cid=cid):
                    _telegram_send_long(_build_agenda(arg or None), chat_id_override=cid)
                threading.Thread(target=_enviar_agenda, daemon=True).start()

            elif text.startswith("/pendentes") and grupo == "PRODUTIVIDADE":
                threading.Thread(target=lambda: _telegram_send(_build_pendentes_semequipe(), chat_id_override=cid), daemon=True).start()

            elif text.startswith("/semana") and grupo == "PRODUTIVIDADE":
                threading.Thread(target=lambda: _telegram_send(_build_semana(), chat_id_override=cid), daemon=True).start()

            elif text.startswith("/os") or (text.startswith("/") and text[1:].split("@")[0].isdigit()):
                if text.startswith("/os"):
                    raw = text[3:].split("@")[0].strip()
                    if not raw and len(text.split()) > 1: raw = " ".join(text.split()[1:])
                else:
                    raw = text[1:].split("@")[0].strip()
                if not raw:
                    _telegram_send("ℹ️ Uso:\n  /os <b>número</b>\n  /os <b>nome</b>\n  /os <b>c12345</b>\n  /os <b>a67890</b>", chat_id_override=cid)
                elif raw.isdigit():
                    n = raw
                    threading.Thread(target=lambda n=n: _telegram_send_long(_build_os_detalhes(n), chat_id_override=cid), daemon=True).start()
                else:
                    t = raw; pfx = "os"
                    def _busca_os(t=t, cid=cid, pfx=pfx):
                        msg_txt, botoes = _build_os_busca(t, callback_prefix=pfx)
                        markup = {"inline_keyboard": botoes} if botoes else None
                        _telegram_send(msg_txt, chat_id_override=cid, reply_markup=markup)
                    threading.Thread(target=_busca_os, daemon=True).start()

            elif text.startswith("/notainstacable"):
                tgt = TELEGRAM_CHAT_INSTACABLE or cid
                def _nota_inst(tgt=tgt):
                    _telegram_send("📋 Gerando <b>Fechamento de Nota — Instacable</b>...", chat_id_override=tgt)
                    if not _gerar_pdf_relatorio_via_browser("instacable", "fechamento", chat_id=tgt):
                        _telegram_send("⚠️ Não foi possível gerar o PDF.", chat_id_override=tgt)
                threading.Thread(target=_nota_inst, daemon=True).start()

            elif text.startswith("/notawes"):
                tgt = TELEGRAM_CHAT_WES or cid
                def _nota_wes(tgt=tgt):
                    _telegram_send("📋 Gerando <b>Fechamento de Nota — WES</b>...", chat_id_override=tgt)
                    if not _gerar_pdf_relatorio_via_browser("wes", "fechamento", chat_id=tgt):
                        _telegram_send("⚠️ Não foi possível gerar o PDF.", chat_id_override=tgt)
                threading.Thread(target=_nota_wes, daemon=True).start()

            elif text.startswith("/notathm"):
                tgt = TELEGRAM_CHAT_OPERACIONAL_THM or cid
                def _nota_thm(tgt=tgt):
                    _telegram_send("📋 Gerando <b>Fechamento de Nota — THM</b>...", chat_id_override=tgt)
                    if not _gerar_pdf_relatorio_via_browser("thm", "fechamento", chat_id=tgt):
                        _telegram_send("⚠️ Não foi possível gerar o PDF.", chat_id_override=tgt)
                threading.Thread(target=_nota_thm, daemon=True).start()

            elif text.startswith("/notarede"):
                tgt = TELEGRAM_CHAT_REDE or cid
                def _nota_rede(tgt=tgt):
                    _telegram_send("📋 Gerando <b>Fechamento de Nota — Rede</b>...", chat_id_override=tgt)
                    if not _gerar_pdf_relatorio_via_browser("rede", "fechamento", chat_id=tgt):
                        _telegram_send("⚠️ Não foi possível gerar o PDF.", chat_id_override=tgt)
                threading.Thread(target=_nota_rede, daemon=True).start()

            elif text.startswith("/kpi"):
                threading.Thread(target=lambda: _telegram_send(_build_kpi(), chat_id_override=cid), daemon=True).start()

            elif text.startswith("/sla") and grupo == "ALERTAS":
                threading.Thread(target=lambda: _telegram_send(_build_sla_detalhado(), chat_id_override=cid), daemon=True).start()

            elif text.startswith("/equipe") and grupo == "ALERTAS":
                parts = text.split(None, 1)
                arg   = parts[1].strip() if len(parts) > 1 else ""
                if not arg:
                    _telegram_send("ℹ️ Uso: <code>/equipe &lt;sigla&gt;</code>\nEx: <code>/equipe F04</code>", chat_id_override=cid)
                else:
                    a = arg
                    def _env_equipe(a=a, cid=cid): _telegram_send(_build_equipe_ficha(a), chat_id_override=cid)
                    threading.Thread(target=_env_equipe, daemon=True).start()

            elif text.startswith("/aging") and grupo == "ALERTAS":
                threading.Thread(target=lambda: _telegram_send(_build_aging(), chat_id_override=cid), daemon=True).start()

            elif text.startswith("/ranking") and grupo == "ALERTAS":
                threading.Thread(target=lambda: _telegram_send(_build_ranking(), chat_id_override=cid), daemon=True).start()

            elif text.startswith("/reagendadas") and grupo == "ALERTAS":
                threading.Thread(target=lambda: _telegram_send(_build_reagendadas(), chat_id_override=cid), daemon=True).start()

            elif text.startswith("/cidade") and grupo == "ALERTAS":
                parts = text.split(None, 1)
                arg   = parts[1].strip() if len(parts) > 1 else ""
                if not arg:
                    _telegram_send("ℹ️ Uso: <code>/cidade &lt;nome&gt;</code>", chat_id_override=cid)
                else:
                    a = arg
                    def _env_cidade(a=a, cid=cid): _telegram_send(_build_cidade(a), chat_id_override=cid)
                    threading.Thread(target=_env_cidade, daemon=True).start()

            elif text.startswith("/turno") and grupo == "ALERTAS":
                threading.Thread(target=lambda: _telegram_send_long(_build_turno(), chat_id_override=cid), daemon=True).start()

            elif text.startswith("/forecast") and grupo == "ALERTAS":
                threading.Thread(target=lambda: _telegram_send(_build_forecast(), chat_id_override=cid), daemon=True).start()

            elif text.startswith("/manutencoes") and grupo == "ALERTAS":
                threading.Thread(target=lambda: _telegram_send_long(_build_manutencoes_hoje(), chat_id_override=cid), daemon=True).start()

            elif text.startswith("/semexec") and grupo == "ALERTAS":
                threading.Thread(target=lambda: _telegram_send_long(_build_semexec(), chat_id_override=cid), daemon=True).start()

            elif text.startswith("/comparativo") and grupo == "ALERTAS":
                threading.Thread(target=lambda: _telegram_send(_build_comparativo(), chat_id_override=cid), daemon=True).start()

            elif text.startswith("/atualizar"):
                def _atualizar(cid=cid):
                    _telegram_send("⏳ Atualizando dados do Grafana...", chat_id_override=cid)
                    try:
                        csv_a = frames_to_csv(grafana_post(SQL_AGENDADO))
                        _dados_cache_update(csv_agendado=csv_a or "")
                        hora_str = datetime.now().strftime("%H:%M:%S")
                        _telegram_send(f"✅ <b>Cache atualizado</b> às {hora_str}", chat_id_override=cid)
                    except Exception as ex:
                        _telegram_send(f"❌ Falha ao atualizar: {_tg_esc(str(ex)[:120])}", chat_id_override=cid)
                threading.Thread(target=_atualizar, daemon=True).start()

            elif text.startswith("/listarede"):
                threading.Thread(target=lambda: _telegram_send_long(_build_listarede(), chat_id_override=cid), daemon=True).start()

            elif text.startswith("/help"):
                if grupo == "INSTACABLE":
                    _telegram_send(
                        f"ℹ️ <b>Cabonnet — Operacional Instacable</b>\n"
                        f"{_TG_DIV}\n"
                        f"/status — Status das OS Instacable (fila, execuções, SLA)\n"
                        f"/pulso — Snapshot rápido: executadas, fila, taxa, SLA crítico\n"
                        f"/equipes — Produção por equipe hoje (exec vs fila)\n"
                        f"/executadas — OS executadas hoje por cidade\n"
                        f"/listatendimento — OS em Atendimento agrupadas por equipe\n"
                        f"/resumo — Imagem: OS ativas por equipe (menor → maior)\n"
                        f"/detalhado — Imagem: todas as OS listadas por equipe\n"
                        f"/meta — Meta de instalações do dia\n"
                        f"/producao &lt;sigla&gt; — Produção detalhada de uma equipe\n"
                        f"  Ex: /producao INST F01  ·  /producao F04\n"
                        f"/os &lt;num|nome|c…|a…&gt; — Busca OS por número, nome, contrato ou assinante\n"
                        f"/notainstacable — Gera Fechamento de Nota em PDF\n"
                        f"/help — Esta mensagem",
                        chat_id_override=cid)
                elif grupo == "WES":
                    _telegram_send(
                        f"ℹ️ <b>Cabonnet — Operacional WES</b>\n"
                        f"{_TG_DIV}\n"
                        f"/status — Status das OS WES (fila, execuções, SLA)\n"
                        f"/pulso — Snapshot rápido: executadas, fila, taxa, SLA crítico\n"
                        f"/equipes — Produção por equipe hoje (exec vs fila)\n"
                        f"/executadas — OS executadas hoje por cidade\n"
                        f"/listatendimento — OS em Atendimento agrupadas por equipe\n"
                        f"/resumo — Imagem: OS ativas por equipe (menor → maior)\n"
                        f"/detalhado — Imagem: todas as OS listadas por equipe\n"
                        f"/producao &lt;sigla&gt; — Produção detalhada de uma equipe\n"
                        f"  Ex: /producao WES  ·  /producao MANUT F08\n"
                        f"/os &lt;num|nome|c…|a…&gt; — Busca OS por número, nome, contrato ou assinante\n"
                        f"/help — Esta mensagem",
                        chat_id_override=cid)
                elif grupo == "THM":
                    _telegram_send(
                        f"ℹ️ <b>Cabonnet — Operacional THM</b>\n"
                        f"{_TG_DIV}\n"
                        f"/status — Status das OS THM (frentes F12–F19)\n"
                        f"/pulso — Snapshot rápido: executadas, fila, taxa, SLA crítico\n"
                        f"/equipes — Produção por equipe hoje (exec vs fila)\n"
                        f"/executadas — OS executadas hoje por cidade\n"
                        f"/listatendimento — OS em Atendimento agrupadas por equipe\n"
                        f"/resumo — Imagem: OS ativas por equipe (menor → maior)\n"
                        f"/detalhado — Imagem: todas as OS listadas por equipe\n"
                        f"/producao &lt;sigla&gt; — Produção detalhada de uma equipe\n"
                        f"  Ex: /producao THM  ·  /producao INST F12\n"
                        f"/os &lt;num|nome|c…|a…&gt; — Busca OS por número, nome, contrato ou assinante\n"
                        f"/help — Esta mensagem",
                        chat_id_override=cid)
                elif grupo == "PRODUTIVIDADE":
                    _telegram_send(
                        f"ℹ️ <b>Cabonnet — Produtividade</b>\n"
                        f"{_TG_DIV}\n"
                        f"<b>Consulta de OS</b>\n"
                        f"  Digitar o número diretamente — ex: <code>9025595</code>\n"
                        f"  Digitar o nome do cliente — ex: <code>João da Silva</code>\n"
                        f"/os &lt;num|nome|c…|a…&gt; — Busca explícita por OS\n"
                        f"{_TG_DIV}\n"
                        f"<b>Agenda</b>\n"
                        f"/agenda — OS agendadas para hoje\n"
                        f"/agenda amanhã — OS agendadas para amanhã\n"
                        f"/agenda 25/04 — OS agendadas para uma data específica\n"
                        f"{_TG_DIV}\n"
                        f"<b>Acompanhamento</b>\n"
                        f"/executadas — OS executadas hoje por cidade\n"
                        f"/listatendimento — OS em Atendimento agrupadas por equipe\n"
                        f"/producao &lt;sigla&gt; — Produção detalhada de uma equipe\n"
                        f"{_TG_DIV}\n"
                        f"<b>Gestão Comercial</b>\n"
                        f"/pendentes — OS na fila sem equipe atribuída\n"
                        f"/semana — Resumo semanal por dia (executadas vs agendadas)\n"
                        f"/help — Esta mensagem",
                        chat_id_override=cid)
                elif grupo == "ALERTAS":
                    _telegram_send(
                        f"ℹ️ <b>Cabonnet — Alertas | Supervisor de Rede</b>\n"
                        f"{_TG_DIV}\n"
                        f"<b>KPI &amp; Status</b>\n"
                        f"/kpi — Painel KPI executivo consolidado (todas as operadoras)\n"
                        f"/status — Status operacional global (fila, exec, SLA)\n"
                        f"/status rede — Status somente das OS de Rede\n"
                        f"/pulso — Snapshot rápido: executadas, fila, taxa, equipes paradas\n"
                        f"/forecast — Projeção de fechamento com base no ritmo atual\n"
                        f"/comparativo — Hoje vs. ontem: execuções, Sem Execução, SLA\n"
                        f"{_TG_DIV}\n"
                        f"<b>Gestão de Equipes</b>\n"
                        f"/equipes — Produção por equipe hoje (exec vs fila)\n"
                        f"/equipe &lt;sigla&gt; — Ficha completa de uma equipe\n"
                        f"/turno — Quem está em campo agora (OS em Atendimento)\n"
                        f"/ranking — Ranking de produtividade por equipe\n"
                        f"/meta — Meta de instalações global (todas as equipes)\n"
                        f"{_TG_DIV}\n"
                        f"<b>Gestão de OS</b>\n"
                        f"/resumo — Imagem: OS ativas por equipe (menor → maior)\n"
                        f"/detalhado — Imagem: todas as OS listadas por equipe\n"
                        f"/executadas — OS executadas hoje por cidade\n"
                        f"/listatendimento — OS em Atendimento agrupadas por equipe\n"
                        f"/listarede — OS de Rede em Atendimento\n"
                        f"/sla — SLA detalhado por equipe (vencidas, aging)\n"
                        f"/aging — Top 20 OS mais antigas na fila\n"
                        f"/reagendadas — OS reagendadas ainda na fila\n"
                        f"/cidade &lt;nome&gt; — OS pendentes e executadas em uma cidade\n"
                        f"/manutencoes — Manutenções abertas hoje por cidade/bairro\n"
                        f"/semexec — OS encerradas como Sem Execução hoje\n"
                        f"/producao &lt;sigla&gt; — Produção detalhada de uma equipe\n"
                        f"/os &lt;num|nome|c…|a…&gt; — Busca OS por número, nome, contrato ou assinante\n"
                        f"{_TG_DIV}\n"
                        f"<b>Relatórios PDF</b>\n"
                        f"/notainstacable — Fechamento de Nota — Instacable\n"
                        f"/notawes — Fechamento de Nota — WES\n"
                        f"/notathm — Fechamento de Nota — THM\n"
                        f"/notarede — Fechamento de Nota — Rede\n"
                        f"{_TG_DIV}\n"
                        f"/atualizar — Força atualização dos dados do Grafana agora\n"
                        f"/help — Esta mensagem",
                        chat_id_override=cid)
