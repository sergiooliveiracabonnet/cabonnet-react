# -*- coding: utf-8 -*-
"""
cabonnet/telegram.py — Envio de mensagens Telegram e funções de operadora.
"""

import logging
import re as _re_global
from datetime import datetime

from cabonnet.config import (
    TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
    TELEGRAM_CHAT_INSTACABLE, TELEGRAM_CHAT_WES,
    TELEGRAM_CHAT_ALERTAS, TELEGRAM_CHAT_REDE,
    TELEGRAM_CHAT_OPERACIONAL_THM,
    _TG_DIV,
    _STATUS_CHANGE_BATCH_LIMIT, _STATUS_EMOJI,
    _OPERADORA_GRUPOS,
)
from cabonnet import state

log    = logging.getLogger("CaboNetServer")
log_tg = logging.getLogger("CaboNetServer.Telegram")


def _telegram_enabled():
    return bool(TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)


def _tg_get_session():
    if state._tg_session is None:
        import requests as _req
        state._tg_session = _req.Session()
    return state._tg_session


def _telegram_send(text, chat_id_override=None, reply_markup=None):
    """Envia uma mensagem de texto para o chat configurado via Bot API.
    Trata automaticamente migração de grupo → supergrupo (migrate_to_chat_id).
    """
    if not _telegram_enabled():
        return False
    url = "https://api.telegram.org/bot{}/sendMessage".format(TELEGRAM_BOT_TOKEN)
    chat_id = chat_id_override or TELEGRAM_CHAT_ID
    try:
        payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
        if reply_markup:
            payload["reply_markup"] = reply_markup
        resp = _tg_get_session().post(url, json=payload, timeout=10)
        data = resp.json() if resp.headers.get("content-type","").startswith("application/json") else {}
        if resp.ok:
            log.info("[Telegram] Mensagem enviada — %s chars", len(text))
            return True
        # Grupo migrou para supergrupo — reenviar com novo ID
        new_id = (data.get("parameters") or {}).get("migrate_to_chat_id")
        if new_id:
            log.warning("[Telegram] Grupo migrou para supergrupo. Novo ID: %s — atualize TELEGRAM_CHAT_ID no .env", new_id)
            resp2 = _tg_get_session().post(
                url,
                json={"chat_id": new_id, "text": text, "parse_mode": "HTML"},
                timeout=10,
            )
            if resp2.ok:
                log.info("[Telegram] Reenvio para novo ID %s OK", new_id)
                return True
            log.warning("[Telegram] Falha no reenvio para %s: %s", new_id, resp2.text[:200])
            return False
        log.warning("[Telegram] Falha HTTP %s: %s", resp.status_code, resp.text[:200])
        return False
    except Exception as ex:
        log.warning("[Telegram] Erro ao enviar: %s", str(ex)[:120])
        return False


def _telegram_send_long(text, chat_id_override=None, max_chars=3800):
    """Envia texto longo dividindo em partes ≤ max_chars, quebrando em linhas."""
    lines = text.split("\n")
    chunk = []
    size  = 0
    for line in lines:
        seg = line + "\n"
        if size + len(seg) > max_chars and chunk:
            _telegram_send("\n".join(chunk), chat_id_override=chat_id_override)
            chunk = []
            size  = 0
        chunk.append(line)
        size += len(seg)
    if chunk:
        _telegram_send("\n".join(chunk), chat_id_override=chat_id_override)


def _telegram_send_document(pdf_bytes, filename, caption="", chat_id_override=None):
    """Envia um documento PDF para o chat configurado via Bot API."""
    if not _telegram_enabled():
        return False
    url = "https://api.telegram.org/bot{}/sendDocument".format(TELEGRAM_BOT_TOKEN)
    chat_id = chat_id_override or TELEGRAM_CHAT_ID
    try:
        resp = _tg_get_session().post(
            url,
            data={"chat_id": chat_id, "caption": caption, "parse_mode": "HTML"},
            files={"document": (filename, pdf_bytes, "application/pdf")},
            timeout=30,
        )
        if resp.ok:
            log.info("[Telegram] PDF enviado — %s (%d bytes)", filename, len(pdf_bytes))
            return True
        log.warning("[Telegram] Falha ao enviar PDF: %s", resp.text[:200])
        return False
    except Exception as ex:
        log.warning("[Telegram] Erro ao enviar PDF: %s", str(ex)[:120])
        return False


def _tg_esc(s):
    return str(s or "").replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")


def _tg_header(emoji, titulo, escopo=None, sub=None):
    """Cabeçalho padrão: título em negrito, data · hora em itálico, divisória.

    titulo/escopo/sub já devem vir escapados quando contiverem dados externos.
    """
    linha_titulo = f"{emoji} <b>{titulo}" + (f" — {escopo}" if escopo else "") + "</b>"
    linhas = [linha_titulo, f"<i>{datetime.now().strftime('%d/%m/%Y · %H:%M')}</i>"]
    if sub:
        linhas.append(f"<i>{sub}</i>")
    linhas.append(_TG_DIV)
    return linhas


def _tg_footer(*itens):
    """Rodapé padrão: divisória + itens úteis (comandos, notas) em itálico.

    Sem itens (ou todos vazios) não gera rodapé — a mensagem termina no corpo.
    """
    uteis = [i for i in itens if i]
    if not uteis:
        return []
    return ["", _TG_DIV, "<i>" + "  ·  ".join(uteis) + "</i>"]


def _abrev_equipe(nome):
    """Equivalente Python do abreviarEquipe() do JS."""
    import re
    if not nome:
        return ""
    s = re.sub(r"^03-\s*VAL\s*-\s*", "", nome, flags=re.IGNORECASE)
    s = re.sub(r"^INSTALACAO\b", "INST",    s, flags=re.IGNORECASE)
    s = re.sub(r"^MANUTENCAO\b", "MANUT",   s, flags=re.IGNORECASE)
    s = re.sub(r"^COPE\s*-\s*INSTALACAO\b", "COPE INST",  s, flags=re.IGNORECASE)
    s = re.sub(r"^COPE\s*-\s*MANUTENCAO\b", "COPE MANUT", s, flags=re.IGNORECASE)
    s = re.sub(r"^COPE\s*-\s*RETIRADA\b",   "COPE RETIR", s, flags=re.IGNORECASE)
    s = re.sub(r"^REAGENDAMENTO\s*-\s*INVIABILIDADE\b.*", "REAGEND. INVIAB.", s, flags=re.IGNORECASE)
    s = re.sub(r"^REAGENDAMENTO\s+O\.?S\.?\s*MOBILE\b.*", "REAGEND. MOBILE",  s, flags=re.IGNORECASE)
    s = re.sub(r"^REAGENDAMENTO\b.*",         "REAGEND.",       s, flags=re.IGNORECASE)
    s = re.sub(r"^ATENDIMENTO\b.*",           "ATENDIMENTO",    s, flags=re.IGNORECASE)
    return s.strip()


def _is_campo(eq):
    """True se for equipe de campo (exclui internas como COPE, ATENDIMENTO, etc.)."""
    u = (eq or "").upper()
    return not any(x in u for x in ("COPE", "ATENDIMENTO", "REAGENDAMENTO", "MIGRADO"))


def _operadora_for_chat(chat_id):
    """Retorna operadora vinculada ao chat_id, ou None para visão global (Alertas)."""
    s = str(chat_id)
    if TELEGRAM_CHAT_INSTACABLE      and s == str(TELEGRAM_CHAT_INSTACABLE):      return "INSTACABLE"
    if TELEGRAM_CHAT_WES             and s == str(TELEGRAM_CHAT_WES):             return "WES"
    if TELEGRAM_CHAT_REDE            and s == str(TELEGRAM_CHAT_REDE):            return "REDE"
    if TELEGRAM_CHAT_OPERACIONAL_THM and s == str(TELEGRAM_CHAT_OPERACIONAL_THM): return "THM"
    return None  # Alertas | Cabonnet = visão global


def _filter_by_operadora(rows, operadora):
    """Filtra linhas pela operadora. None/ausente = sem filtro (global)."""
    if not operadora:
        return rows
    if operadora == "REDE":
        return [r for r in rows if (r.get("servico") or "").upper().startswith("REDE")]
    frentes = _OPERADORA_GRUPOS.get(operadora, [])
    if not frentes:
        return rows
    def _match(r):
        raw = _re_global.sub(r'([A-Z])\s+(\d)', r'\1\2', (r.get("nomedaequipe") or "").upper())
        return any(f in raw for f in frentes)
    return [r for r in rows if _match(r)]


def _label_operadora(operadora):
    """Rótulo legível para o cabeçalho da operadora."""
    return {"INSTACABLE": "INSTACABLE", "WES": "WES", "REDE": "REDE", "THM": "THM"}.get(operadora or "", "GLOBAL")


def _operadora_da_os(row):
    """Retorna 'INSTACABLE', 'WES', 'REDE' ou None conforme equipe/serviço da OS."""
    if (row.get("servico") or "").upper().startswith("REDE"):
        return "REDE"
    raw = _re_global.sub(r'([A-Z])\s+(\d)', r'\1\2', (row.get("nomedaequipe") or "").upper())
    for op_name, frentes in _OPERADORA_GRUPOS.items():
        if any(f in raw for f in frentes):
            return op_name
    return None


def _tg_fmt_status_change(row, old_st, new_st):
    """Monta texto HTML de notificação de mudança de status."""
    numos     = row.get("numos", "?")
    cliente   = _tg_esc(row.get("nomecliente", ""))
    tipo      = _tg_esc(row.get("tiposervico", ""))
    equipe    = _tg_esc(_abrev_equipe(row.get("nomedaequipe", "")))
    bairro    = _tg_esc(row.get("bairro", ""))
    cidade    = _tg_esc(row.get("nomedacidade", ""))
    dt_agend  = _tg_esc(row.get("dataagendamento", ""))
    local     = " · ".join(x for x in (bairro, cidade) if x)

    endereco = " ".join(x for x in (str(row.get("logradouro") or "").strip(),
                                    str(row.get("numero") or "").strip()) if x)
    compl    = str(row.get("complemento") or "").strip()
    if compl:
        endereco += f" · {compl}"
    endereco = _tg_esc(endereco)

    e_new = _STATUS_EMOJI.get(new_st, "🔄")

    lines = [
        f"{e_new} <b>OS {numos} — {_tg_esc(new_st)}</b>",
        f"<i>{_tg_esc(old_st)} → {_tg_esc(new_st)}</i>",
        _TG_DIV,
        f"👤 {cliente}",
    ]
    if tipo:
        lines.append(f"🔧 {tipo}" + (f" · {equipe}" if equipe else ""))
    if endereco:
        lines.append(f"📍 {endereco}")
    if local:
        lines.append(f"🏘 {local}")
    if dt_agend:
        lines.append(f"📅 Agendada: {dt_agend}")
    return "\n".join(lines)


def _tg_fmt_status_summary(changes):
    """Resumo compacto quando há muitas mudanças de uma vez."""
    lines = [f"🔄 <b>{len(changes)} OS mudaram de status</b>", _TG_DIV]
    for row, old_st, new_st in changes:
        e_new = _STATUS_EMOJI.get(new_st, "🔄")
        numos = row.get("numos", "?")
        cli   = _tg_esc((row.get("nomecliente") or "")[:28])
        lines.append(f"{e_new} <b>{numos}</b> {cli}  <i>{_tg_esc(old_st)} → {_tg_esc(new_st)}</i>")
    return "\n".join(lines)


def _is_equipe_rede_ou_manut(row):
    """True se o nome da equipe começa com REDE ou MANUT — notifica só no Alertas."""
    name = (row.get("nomedaequipe") or "").strip().upper()
    return name.startswith("REDE") or name.startswith("MANUT")


def _tg_broadcast_status_changes(changes):
    """Envia notificações de mudança de status nos grupos corretos."""
    if not _telegram_enabled() or not changes:
        return

    # Separa mudanças por operadora para grupos restritos.
    # Equipes REDE F** e MANUT F** só vão para Alertas, nunca para o grupo da operadora.
    wes_ch   = [(r, o, n) for r, o, n in changes if _operadora_da_os(r) == "WES"        and not _is_equipe_rede_ou_manut(r)]
    inst_ch  = [(r, o, n) for r, o, n in changes if _operadora_da_os(r) == "INSTACABLE" and not _is_equipe_rede_ou_manut(r)]
    rede_ch  = [(r, o, n) for r, o, n in changes if _operadora_da_os(r) == "REDE"]
    thm_ch   = [(r, o, n) for r, o, n in changes if _operadora_da_os(r) == "THM"        and not _is_equipe_rede_ou_manut(r)]

    def _send_batch(batch, chat_id):
        if not chat_id or not batch:
            return
        if len(batch) > _STATUS_CHANGE_BATCH_LIMIT:
            _telegram_send(_tg_fmt_status_summary(batch), chat_id_override=chat_id)
        else:
            for row, old_st, new_st in batch:
                _telegram_send(_tg_fmt_status_change(row, old_st, new_st), chat_id_override=chat_id)

    # Alertas — recebe TODAS as mudanças
    _send_batch(changes, TELEGRAM_CHAT_ALERTAS)

    # Operacional (Produtividade) — somente instalações
    inst_ch_op = [(r, o, n) for r, o, n in changes if "INSTALAC" in (r.get("tiposervico", "") or "").upper()]
    _send_batch(inst_ch_op, TELEGRAM_CHAT_ID)

    # Grupos restritos — apenas OS da própria operadora
    _send_batch(wes_ch,  TELEGRAM_CHAT_WES)
    _send_batch(inst_ch, TELEGRAM_CHAT_INSTACABLE)
    _send_batch(rede_ch, TELEGRAM_CHAT_REDE)
    _send_batch(thm_ch,  TELEGRAM_CHAT_OPERACIONAL_THM)
