# -*- coding: utf-8 -*-
"""
cabonnet/images.py — Geração de imagens PNG via Pillow para o Telegram.
"""

import io
import logging
from datetime import datetime, date

from cabonnet.config import (
    _SC, _IW, _IC, _OPERADORA_COR, _OPERADORA_LABEL,
    _FONT_PAIRS, _RCOLS, _R_FOOT_H, _DCOLS, _D_FOOT_H, _D_STATUS_COLOR,
    TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
)
from cabonnet import state
from cabonnet.telegram import (
    _telegram_enabled, _tg_get_session,
    _filter_by_operadora,
)
from cabonnet.utils import _parse_data_br

log = logging.getLogger("CaboNetServer")

try:
    from PIL import Image as _PILImage, ImageDraw as _PILDraw, ImageFont as _PILFont
    _PIL_OK = True
except ImportError:
    _PIL_OK = False
    log.warning("[Imagem] Pillow não encontrado — instale com: pip install Pillow")


def _pil_font(size, bold=False):
    if not _PIL_OK:
        return None
    px = size * _SC
    for reg, bld in _FONT_PAIRS:
        try:
            return _PILFont.truetype(bld if bold else reg, px)
        except Exception:
            continue
    try:
        return _PILFont.load_default(size=px)
    except TypeError:
        return _PILFont.load_default()


def _fw(font, s):
    """Largura de texto em pixels (escala nativa)."""
    if font is None:
        return len(str(s)) * 8 * _SC
    s = str(s)
    try:
        return int(font.getlength(s))
    except AttributeError:
        try:
            return font.getbbox(s)[2]
        except Exception:
            return font.getsize(s)[0]


def _itxt(draw, s, x, y, font, color, align="left", max_px=None):
    """Desenha texto com truncagem e alinhamento (coordenadas lógicas → ×_SC)."""
    s = str(s)
    if max_px and font:
        lim = max_px * _SC
        while len(s) > 1 and _fw(font, s) > lim:
            s = s[:-1]
        if len(s) < len(str(s)):
            s = s[:-1] + "…"
    xs = x * _SC
    if align == "center": xs -= _fw(font, s) // 2
    elif align == "right": xs -= _fw(font, s)
    draw.text((xs, y * _SC), s, font=font, fill=color)


def _irect(draw, x, y, w, h, color):
    draw.rectangle([x*_SC, y*_SC, (x+w)*_SC-1, (y+h)*_SC-1], fill=color)


def _iline(draw, x1, y1, x2, y2, color=None):
    draw.line([x1*_SC, y1*_SC, x2*_SC, y2*_SC], fill=color or _IC["border"], width=1)


def _telegram_send_image(img_bytes, caption, chat_id, as_document=False):
    """Envia imagem PNG para um chat via Bot API."""
    if not _telegram_enabled() or not img_bytes:
        return False
    method = "sendDocument" if as_document else "sendPhoto"
    field  = "document"    if as_document else "photo"
    fname  = "relatorio-cabonnet.png"
    url    = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/{method}"
    try:
        resp = _tg_get_session().post(
            url,
            data={"chat_id": chat_id, "caption": caption, "parse_mode": "HTML"},
            files={field: (fname, img_bytes, "image/png")},
            timeout=30,
        )
        if resp.ok:
            log.info("[Telegram] Imagem enviada via %s — %d bytes", method, len(img_bytes))
        else:
            log.warning("[Telegram] Falha %s: %s", method, resp.text[:200])
        return resp.ok
    except Exception as ex:
        log.warning("[Telegram] Erro ao enviar imagem: %s", str(ex)[:120])
        return False


def _fonts():
    global _F
    from cabonnet import state as _st
    if not _st._F and _PIL_OK:
        _st._F = {
            "hdr":    _pil_font(15, bold=True),
            "sub":    _pil_font(12, bold=True),
            "ts":     _pil_font(10),
            "col":    _pil_font(9,  bold=True),
            "data":   _pil_font(12),
            "data_b": _pil_font(12, bold=True),
            "eq":     _pil_font(11, bold=True),
            "foot":   _pil_font(10),
        }
    return _st._F


# ── Resumo por equipe ─────────────────────────────────────────────────────────
_R_HDR_H = 74
_R_COL_H = 30
_R_ROW_H = 36


def _build_img_resumo(operadora=None):
    """Gera bytes PNG do resumo de OS agrupado por equipe."""
    if not _PIL_OK:
        return None
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        return None

    hoje  = date.today()
    rows  = _filter_by_operadora(rows, operadora)
    ativos = [r for r in rows if r.get("descsituacao") in ("Pendente", "Atendimento")
              and not (r.get("servico") or "").upper().startswith("REDE")]
    if not ativos:
        return None

    grupos_raw = {}
    for r in ativos:
        eq = (r.get("nomedaequipe") or "Sem equipe").strip()
        grupos_raw.setdefault(eq, []).append(r)

    def _sort_eq(name):
        import re as _re
        m = _re.search(r'(\d+)', name)
        return (int(m.group(1)) if m else 9999, name)

    grupos_sorted = sorted(grupos_raw.items(), key=lambda x: _sort_eq(x[0]))

    ordenado = []
    for eq, os_list in grupos_sorted:
        pend  = sum(1 for r in os_list if r.get("descsituacao") == "Pendente")
        atend = sum(1 for r in os_list if r.get("descsituacao") == "Atendimento")
        aging_vals = []
        criticas   = 0
        for r in os_list:
            dt = _parse_data_br(r.get("datacadastro", ""))
            if dt:
                a  = (hoje - dt).days
                aging_vals.append(a)
                tp = (r.get("tiposervico", "") or "").upper()
                lim = 2 if "INSTALAC" in tp else 1 if "MANUTENC" in tp else 2
                if a >= lim * 2:
                    criticas += 1
        ordenado.append((eq, {"total": len(os_list), "pendente": pend, "atend": atend,
                               "aging": aging_vals, "criticas": criticas}))
    all_aging  = [a for _, g in ordenado for a in g["aging"]]
    med_aging  = round(sum(all_aging) / len(all_aging), 1) if all_aging else 0
    total_crit = sum(g["criticas"] for _, g in ordenado)
    accent     = _OPERADORA_COR.get(operadora, _IC["cyan"])
    label      = _OPERADORA_LABEL.get(operadora, "Todos")

    H = _R_HDR_H + _R_COL_H + len(ordenado) * _R_ROW_H + _R_ROW_H + _R_FOOT_H
    img  = _PILImage.new("RGB", (_IW * _SC, H * _SC), _IC["bg"])
    draw = _PILDraw.Draw(img)
    F    = _fonts()

    _irect(draw, 0, 0, _IW, _R_HDR_H, _IC["bg_hdr"])
    _irect(draw, 0, 0, 4, _R_HDR_H, accent)
    _itxt(draw, "CABONNET · Ordens por Fornecedor", 20, 20, F["hdr"], _IC["text"])
    _itxt(draw, label.upper(), 20, 40, F["sub"], accent)
    now = datetime.now()
    ts  = now.strftime("%d/%m/%Y %H:%M")
    _itxt(draw, ts, 20, 58, F["ts"], _IC["muted"])
    _itxt(draw, f"{len(ativos)} OS · {len(ordenado)} equipes · menor→maior", _IW - 16, 40, F["ts"], _IC["dim"], align="right")
    _iline(draw, 0, _R_HDR_H, _IW, _R_HDR_H)

    _irect(draw, 0, _R_HDR_H, _IW, _R_COL_H, _IC["bg_col"])
    for c in _RCOLS:
        tx = c["x"] + c["w"] // 2 if c["al"] == "center" else c["x"]
        _itxt(draw, c["label"], tx, _R_HDR_H + 9, F["col"], _IC["muted"], align=c["al"])
    _iline(draw, 0, _R_HDR_H + _R_COL_H, _IW, _R_HDR_H + _R_COL_H)

    base_y = _R_HDR_H + _R_COL_H
    for i, (eq, g) in enumerate(ordenado):
        y    = base_y + i * _R_ROW_H
        bg   = _IC["bg_alt"] if i % 2 else _IC["bg"]
        _irect(draw, 0, y, _IW, _R_ROW_H, bg)
        if i: _iline(draw, 16, y, _IW - 16, y, _IC["border"])
        cy = y + 12

        aging_med  = round(sum(g["aging"]) / len(g["aging"]), 1) if g["aging"] else None
        aging_col  = _IC["red"] if aging_med and aging_med >= 6 else _IC["yellow"] if aging_med and aging_med >= 3 else _IC["dim"]
        crit_col   = _IC["red"] if g["criticas"] else _IC["muted"]

        for c in _RCOLS:
            tx = c["x"] + c["w"] // 2 if c["al"] == "center" else c["x"]
            if c["key"] == "equipe":
                _itxt(draw, eq, tx, cy, F["data"], _IC["text"], max_px=c["w"] - 4)
            elif c["key"] == "total":
                _itxt(draw, g["total"], tx, cy, F["data_b"], _IC["text"], align="center")
            elif c["key"] == "pendente":
                v = g["pendente"]
                _itxt(draw, v if v else "—", tx, cy, F["data"], _IC["dim"] if v else _IC["muted"], align="center")
            elif c["key"] == "atend":
                v = g["atend"]
                _itxt(draw, v if v else "—", tx, cy, F["data"], _IC["dim"] if v else _IC["muted"], align="center")
            elif c["key"] == "aging":
                _itxt(draw, f"{aging_med}d" if aging_med is not None else "—", tx, cy, F["data"], aging_col, align="center")
            elif c["key"] == "criticas":
                _itxt(draw, g["criticas"] if g["criticas"] else "—", tx, cy,
                      F["data_b"] if g["criticas"] else F["data"], crit_col, align="center")

    ty = base_y + len(ordenado) * _R_ROW_H
    _irect(draw, 0, ty, _IW, _R_ROW_H, _IC["bg_total"])
    _iline(draw, 0, ty, _IW, ty)
    tcy = ty + 12
    for c in _RCOLS:
        tx = c["x"] + c["w"] // 2 if c["al"] == "center" else c["x"]
        if c["key"] == "equipe":
            _itxt(draw, "TOTAL", tx, tcy, F["data_b"], _IC["dim"])
        elif c["key"] == "total":
            _itxt(draw, len(ativos), tx, tcy, F["data_b"], _IC["text"], align="center")
        elif c["key"] == "pendente":
            _itxt(draw, sum(g["pendente"] for _, g in ordenado), tx, tcy, F["data_b"], _IC["dim"], align="center")
        elif c["key"] == "atend":
            _itxt(draw, sum(g["atend"] for _, g in ordenado), tx, tcy, F["data_b"], _IC["dim"], align="center")
        elif c["key"] == "aging":
            ac = _IC["red"] if med_aging >= 6 else _IC["yellow"] if med_aging >= 3 else _IC["dim"]
            _itxt(draw, f"{med_aging}d" if all_aging else "—", tx, tcy, F["data_b"], ac, align="center")
        elif c["key"] == "criticas":
            _itxt(draw, total_crit if total_crit else "—", tx, tcy,
                  F["data_b"], _IC["red"] if total_crit else _IC["muted"], align="center")

    fy = ty + _R_ROW_H
    _irect(draw, 0, fy, _IW, _R_FOOT_H, _IC["bg_foot"])
    _iline(draw, 0, fy, _IW, fy)
    _itxt(draw, "Dashboard Cabonnet · Gerado automaticamente", 16, fy + 8, F["foot"], _IC["muted"])

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ── Detalhado por equipe ──────────────────────────────────────────────────────
_D_HDR_H = 70
_D_COL_H = 27
_D_EQ_H  = 32
_D_ROW_H = 27


def _build_img_detalhado(operadora=None):
    """Gera bytes PNG do relatório detalhado de OS por equipe."""
    if not _PIL_OK:
        return None
    with state._dados_cache_lock:
        rows = list(state._dados_cache["agendado"])
    if not rows:
        return None

    hoje  = date.today()
    rows  = _filter_by_operadora(rows, operadora)
    ativos = [r for r in rows if r.get("descsituacao") in ("Pendente", "Atendimento")
              and not (r.get("servico") or "").upper().startswith("REDE")]
    if not ativos:
        return None

    def _ag(r):
        dt = _parse_data_br(r.get("datacadastro", ""))
        return (hoje - dt).days if dt else 0

    grupos = {}
    for r in ativos:
        eq = (r.get("nomedaequipe") or "Sem equipe").strip()
        grupos.setdefault(eq, []).append(r)

    def _sort_eq_d(name):
        import re as _re
        m = _re.search(r'(\d+)', name)
        return (int(m.group(1)) if m else 9999, name)

    ordenado = sorted(grupos.items(), key=lambda x: _sort_eq_d(x[0]))
    accent   = _OPERADORA_COR.get(operadora, _IC["cyan"])
    label    = _OPERADORA_LABEL.get(operadora, "Todos")
    total_os = len(ativos)

    H = _D_HDR_H + _D_COL_H + sum(_D_EQ_H + len(v) * _D_ROW_H for _, v in ordenado) + _D_FOOT_H
    img  = _PILImage.new("RGB", (_IW * _SC, H * _SC), _IC["bg"])
    draw = _PILDraw.Draw(img)
    F    = _fonts()

    _irect(draw, 0, 0, _IW, _D_HDR_H, _IC["bg_hdr"])
    _irect(draw, 0, 0, 4, _D_HDR_H, accent)
    _itxt(draw, "CABONNET · Relatório Detalhado por Equipe", 20, 18, F["hdr"], _IC["text"])
    _itxt(draw, label.upper(), 20, 38, F["sub"], accent)
    ts = datetime.now().strftime("%d/%m/%Y %H:%M")
    _itxt(draw, ts, 20, 55, F["ts"], _IC["muted"])
    _itxt(draw, f"{total_os} OS · {len(ordenado)} equipes · menor→maior", _IW - 16, 38, F["ts"], _IC["dim"], align="right")
    _itxt(draw, "Alertas | Cabonnet", _IW - 16, 55, F["ts"], _IC["muted"], align="right")
    _iline(draw, 0, _D_HDR_H, _IW, _D_HDR_H)

    _irect(draw, 0, _D_HDR_H, _IW, _D_COL_H, _IC["bg_col"])
    for c in _DCOLS:
        tx = c["x"] + c["w"] // 2 if c["al"] == "center" else c["x"]
        _itxt(draw, c["label"].upper(), tx, _D_HDR_H + 8, F["col"], _IC["muted"], align=c["al"])
    _iline(draw, 0, _D_HDR_H + _D_COL_H, _IW, _D_HDR_H + _D_COL_H)

    cy = _D_HDR_H + _D_COL_H
    for gi, (eq, os_list) in enumerate(ordenado):
        eq_bg = (17, 29, 46) if gi % 2 == 0 else (15, 26, 42)
        _irect(draw, 0, cy, _IW, _D_EQ_H, eq_bg)
        _irect(draw, 0, cy, 3, _D_EQ_H, accent)
        eq_short = eq if len(eq) <= 40 else eq[:38] + "…"
        _itxt(draw, eq_short, 10, cy + 10, F["eq"], _IC["text"])
        _itxt(draw, f"{len(os_list)} OS", _IW - 16, cy + 10, F["eq"], accent, align="right")
        _iline(draw, 0, cy + _D_EQ_H, _IW, cy + _D_EQ_H, (40, 60, 85))
        cy += _D_EQ_H

        os_sorted = sorted(os_list, key=_ag, reverse=True)
        for ri, r in enumerate(os_sorted):
            row_bg = _IC["bg"] if ri % 2 == 0 else _IC["bg_alt"]
            _irect(draw, 0, cy, _IW, _D_ROW_H, row_bg)
            if ri: _iline(draw, 16, cy, _IW - 16, cy, (22, 32, 46))
            ry = cy + 8

            ag  = _ag(r)
            ag_col = _IC["red"] if ag >= 6 else _IC["yellow"] if ag >= 3 else _IC["dim"]
            st  = r.get("descsituacao", "")
            st_col = _D_STATUS_COLOR.get(st, _IC["muted"])
            tipo_s = (r.get("tiposervico") or "").replace("INSTALACAO","Inst.").replace("MANUTENCAO","Manut.")

            for c in _DCOLS:
                tx = c["x"] + c["w"] // 2 if c["al"] == "center" else c["x"]
                if c["key"] == "numos":
                    _itxt(draw, r.get("numos", "—"), tx, ry, F["data_b"], _IC["cyan"])
                elif c["key"] == "cliente":
                    _itxt(draw, r.get("nomecliente", "—"), tx, ry, F["data"], _IC["text"], max_px=c["w"]-4)
                elif c["key"] == "cidade":
                    _itxt(draw, (r.get("nomedacidade") or "—").upper(), tx, ry, F["data"], _IC["dim"], max_px=c["w"]-4)
                elif c["key"] == "tipo":
                    _itxt(draw, tipo_s or "—", tx, ry, F["data"], _IC["dim"], max_px=c["w"]-2)
                elif c["key"] == "aging":
                    _itxt(draw, f"{ag}d", tx, ry, F["data_b"] if ag >= 3 else F["data"], ag_col, align="center")
                elif c["key"] == "agend":
                    ag_dt = (r.get("dataagendamento") or "")[:5]
                    _itxt(draw, ag_dt or "—", tx, ry, F["data"], _IC["dim"] if ag_dt else _IC["muted"], align="center")
                elif c["key"] == "status":
                    _itxt(draw, st or "—", tx, ry, F["data"], st_col, max_px=c["w"]-4)

            cy += _D_ROW_H

    _irect(draw, 0, cy, _IW, _D_FOOT_H, _IC["bg_foot"])
    _iline(draw, 0, cy, _IW, cy)
    _itxt(draw, "Dashboard Cabonnet · Gerado automaticamente", 16, cy + 8, F["foot"], _IC["muted"])
    _itxt(draw, f"{total_os} ordens de serviço", _IW - 16, cy + 8, F["foot"], _IC["muted"], align="right")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
