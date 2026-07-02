# -*- coding: utf-8 -*-
"""
cabonnet/stats.py — KPIs server-side a partir do cache de OS.

Porta a lógica de enriquecimento de src/lib/transform.ts para Python,
operando sobre os CSVs já em cache (sem nova chamada ao Grafana).
"""

import re as _re
import unicodedata
from collections import defaultdict
from datetime import date

from cabonnet.config import _SLA_LIMITS
from cabonnet.utils import _parse_csv_rows, _parse_data_br, isConcluida_str

# ── Cidades válidas (espelho de CIDADES_ATENDIDAS em transform.ts) ───────────

def _norm(s: str) -> str:
    return unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().upper().strip()

_CIDADES_VALIDAS = {
    "PINDAMONHANGABA", "TREMEMBE", "TAUBATE",
    "CACAPAVA", "SAO JOSE", "SAO JOSE DOS CAMPOS",
}

def _cidade_valida(c: str) -> bool:
    return _norm(c) in _CIDADES_VALIDAS

# ── Filtros de linha (espelho de parseCSV em transform.ts) ───────────────────

_EQUIPES_EXCLUIR = {
    "ESTOQUE", "COPE - RETIRADA", "ATENDIMENTO",
    "REGUA DE COBRANCA", "REGUA DE COBRANCA",
    "MIGRADO", "RECONEXAO AUTOMATICA", "RECONEXAO AUTOMATICA",
}
_SERVICOS_EXCLUIR = [
    "INADIMPLENCIA", "RECONEXAO AUTOMATICA", "LIBERACAO DE CONFIANCA",
    "ALTERACAO DE PROGRAMACAO", "REGUA DE CONFIANCA",
    "RETIRADA DE EQUIPAMENTO", "CONTRATO - UPGRADE",
]

def _row_valido(r: dict) -> bool:
    numos = (r.get("numos") or "").strip()
    if not numos or not numos.isdigit() or len(numos) != 7:
        return False
    if not _cidade_valida(r.get("nomedacidade") or ""):
        return False
    eq = _norm(r.get("nomedaequipe") or "")
    if eq in _EQUIPES_EXCLUIR:
        return False
    sv = _norm(r.get("servico") or "")
    if any(x in sv for x in _SERVICOS_EXCLUIR):
        return False
    return True

# ── Classificadores (espelho de transform.ts) ────────────────────────────────

def _is_cope(equipe: str) -> bool:
    return "COPE" in (equipe or "").upper()

def _is_reagend(equipe: str) -> bool:
    return "REAGEND" in (equipe or "").upper()

def _reagend_tipo(equipe: str) -> str | None:
    """Subtipo do reagendamento (espelha getReagendTipo do transform.ts)."""
    u = (equipe or "").upper()
    if "REAGEND" not in u:
        return None
    if "INVIABILID" in u: return "inviabilidade"
    if "MOBILE" in u:     return "mobile"
    return "futura"

def _is_ativo(descsituacao: str) -> bool:
    return (descsituacao or "") in ("Pendente", "Atendimento")

_FCODE_RE = _re.compile(r'\bF\d{2,}\b')
_WES_CODES  = {"F08", "F11", "F23", "F36", "F44"}
_INST_CODES = {"F01", "F04", "F05", "F07", "F20", "F45", "F46", "F47", "F48", "F49", "F50"}
_THM_CODES  = {"F12", "F13", "F14"}

def _get_tipo(equipe: str, tiposervico: str) -> str:
    u = (equipe or "").upper()
    t = (tiposervico or "").upper()
    if "REDE" in u:     return "REDE"
    if "INSTALAC" in t: return "INSTALACAO"
    if "MANUTENC" in u: return "MANUTENCAO"
    if "MANUTENC" in t: return "MANUTENCAO"
    return "OUTRO"

def _sla_limite(tiposervico: str, servico: str) -> int:
    s = (servico or "").upper()
    t = (tiposervico or "").upper()
    if "VT 24H" in s or "VT 08H" in s: return 1
    if "VT 48H" in s:                   return 2
    if "INSTALAC" in t: return _SLA_LIMITS.get("INSTALAC", 2)
    if "MANUTENC" in t: return _SLA_LIMITS.get("MANUTENC", 1)
    return _SLA_LIMITS.get("DEFAULT", 2)

# ── Enriquecimento de uma row ────────────────────────────────────────────────

def _enrich(r: dict, hoje: date) -> dict:
    equipe   = r.get("nomedaequipe", "") or ""
    servico  = r.get("servico",       "") or ""
    tipo_sv  = r.get("tiposervico",   "") or ""
    desc_sit = r.get("descsituacao",  "") or ""

    ativo = _is_ativo(desc_sit)

    dt_cad   = _parse_data_br(r.get("datacadastro",    ""))
    dt_agend = _parse_data_br(r.get("dataagendamento", ""))

    aging = (hoje - dt_cad).days if dt_cad else None

    limite = _sla_limite(tipo_sv, servico)

    if dt_cad and dt_agend and dt_agend >= dt_cad:
        dias_agend = (dt_agend - dt_cad).days
        sla_exc    = ativo and dias_agend > limite
        sla_sem    = False
    else:
        sla_exc = False
        sla_sem = ativo and aging is not None and aging > limite

    sla_critico = ativo and aging is not None and aging > limite * 2
    tipo = _get_tipo(equipe, tipo_sv)
    is_rede = tipo == "REDE"

    return {
        **r,
        "_aging":       aging if ativo else None,
        "_slaCritico":  sla_critico,
        "_slaExcedido": sla_exc or sla_sem,
        "_tipo":        tipo,
        "_ativo":       ativo,
        "_cope":        _is_cope(equipe),
        "_reagend":     _is_reagend(equipe),
        "_rede":        is_rede,
    }

# ── Função principal ─────────────────────────────────────────────────────────

def compute_stats(csv_pendente: str, csv_agendado: str, csv_futuro: str) -> dict:
    """Retorna KPIs da fila operacional a partir dos CSVs em cache."""
    hoje = date.today()

    raw = (
        _parse_csv_rows(csv_pendente) +
        _parse_csv_rows(csv_agendado) +
        _parse_csv_rows(csv_futuro)
    )

    # deduplica por numos (pendente + agendado podem sobrepor)
    seen: set[str] = set()
    unique = []
    for r in raw:
        n = r.get("numos", "")
        if n and n not in seen:
            seen.add(n)
            unique.append(r)

    rows = [_enrich(r, hoje) for r in unique if _row_valido(r)]

    pendente = atend = rede = criticas = sem_equipe = sem_agend = sla_exc_fila = reagend = 0
    reagend_inviab = reagend_mobile = reagend_futura = 0
    cope_aguardando = 0
    aging_arr: list[int] = []
    aging_dist = {"le1d": 0, "d2a3": 0, "d4a7": 0, "d8mais": 0}
    por_cidade: dict = defaultdict(lambda: {"pendente": 0, "atendimento": 0, "criticas": 0})
    por_tipo:   dict = defaultdict(lambda: {"n": 0, "sla_exc": 0})

    for r in rows:
        if r["_reagend"] and r["_ativo"]:
            reagend += 1
            _rt = _reagend_tipo(r.get("nomedaequipe", ""))
            if   _rt == "inviabilidade": reagend_inviab += 1
            elif _rt == "mobile":        reagend_mobile += 1
            else:                        reagend_futura += 1
        if r["_cope"]:
            if r["_ativo"]:
                cope_aguardando += 1
            continue
        if r["_reagend"]:
            continue
        if not r["_ativo"]:
            continue
        if r["_rede"]:
            rede += 1
            continue

        desc = r.get("descsituacao", "")
        cid  = (r.get("nomedacidade") or "").strip().upper()
        tipo = r["_tipo"]

        if desc == "Pendente":
            pendente += 1
            por_cidade[cid]["pendente"] += 1
        elif "Atendimento" in desc:
            atend += 1
            por_cidade[cid]["atendimento"] += 1

        if r["_slaCritico"]:
            criticas += 1
            por_cidade[cid]["criticas"] += 1

        if r["_slaExcedido"]:
            sla_exc_fila += 1

        if not (r.get("nomedaequipe") or "").strip():
            sem_equipe += 1

        if not (r.get("dataagendamento") or "").strip():
            sem_agend += 1

        aging = r["_aging"]
        if aging is not None:
            aging_arr.append(aging)
            if   aging <= 1: aging_dist["le1d"]  += 1
            elif aging <= 3: aging_dist["d2a3"]  += 1
            elif aging <= 7: aging_dist["d4a7"]  += 1
            else:            aging_dist["d8mais"] += 1

        por_tipo[tipo]["n"] += 1
        if r["_slaExcedido"]:
            por_tipo[tipo]["sla_exc"] += 1

    total     = pendente + atend
    aging_med = round(sum(aging_arr) / len(aging_arr)) if aging_arr else 0
    sla_pct   = round((total - sla_exc_fila) / total * 100) if total else 100

    return {
        "fila": {
            "pendente":        pendente,
            "atendimento":     atend,
            "total":           total,
            "rede":            rede,
            "criticas":        criticas,
            "sem_equipe":      sem_equipe,
            "sem_agendamento": sem_agend,
            "reagend":         reagend,
            "reagend_inviab":  reagend_inviab,
            "reagend_mobile":  reagend_mobile,
            "reagend_futura":  reagend_futura,
            "cope_aguardando": cope_aguardando,
            "sla_pct":         sla_pct,
            "aging_med":       aging_med,
            "aging_dist":      aging_dist,
        },
        "por_cidade": [
            {"cidade": c, **v}
            for c, v in sorted(
                por_cidade.items(),
                key=lambda x: -(x[1]["pendente"] + x[1]["atendimento"]),
            )
        ],
        "por_tipo": [
            {"tipo": t, **v}
            for t, v in sorted(por_tipo.items(), key=lambda x: -x[1]["n"])
        ],
    }
