"""Regras determinísticas para relacionar revisitas oficiais à OS anterior.

Este módulo não tenta descobrir a causa da revisita. Ele cria o vínculo
auditável que permitirá agregar ocorrências, materiais e demais evidências.
"""

from __future__ import annotations

import datetime as dt
import unicodedata
from collections import defaultdict
from typing import Any


def _text(value: Any) -> str:
    return str(value or "").strip()


def _key_text(value: Any) -> str:
    normalized = unicodedata.normalize("NFKD", _text(value))
    return normalized.encode("ascii", "ignore").decode().upper()


def _date(row: dict[str, Any]) -> dt.datetime | None:
    value = row.get("dataexecucao") or row.get("dataexecutada") or row.get("databaixasistema")
    if not isinstance(value, str):
        return None
    for pattern in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y"):
        try:
            return dt.datetime.strptime(value, pattern)
        except ValueError:
            continue
    return None


def _recurrence(row: dict[str, Any]) -> int:
    try:
        return max(0, int(row.get("recorrencia") or 0))
    except (TypeError, ValueError):
        return 0


def _group_key(row: dict[str, Any]) -> tuple[str, str, str] | None:
    city = _key_text(row.get("nomedacidade"))
    contract = _key_text(row.get("codigocontrato"))
    customer = _key_text(row.get("codigocliente"))
    if not city:
        return None
    if contract:
        return (city, "contract", contract)
    if customer:
        return (city, "customer", customer)
    return None


def _same_team(origin: dict[str, Any], revisit: dict[str, Any]) -> bool | None:
    left = _key_text(origin.get("equipeexecutou") or origin.get("nomedaequipe"))
    right = _key_text(revisit.get("equipeexecutou") or revisit.get("nomedaequipe"))
    return left == right if left and right else None


def build_revisit_journeys(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Retorna um registro auditável para cada linha com ``recorrencia > 0``.

    O pareamento usa a visita imediatamente anterior dentro da mesma cidade e
    contrato. Código do cliente só é usado quando o contrato está ausente nas
    duas linhas. Nome do cliente nunca é chave de correlação.
    """
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    revisits: list[dict[str, Any]] = []

    for row in rows:
        key = _group_key(row)
        if key and _date(row):
            grouped[key].append(row)
        if _recurrence(row) > 0:
            revisits.append(row)

    previous_by_os: dict[str, tuple[dict[str, Any], str] | None] = {}
    for key, group in grouped.items():
        ordered = sorted(group, key=lambda item: (_date(item), _text(item.get("numos"))))
        for index, row in enumerate(ordered):
            previous_by_os[_text(row.get("numos"))] = (
                (ordered[index - 1], key[1]) if index else None
            )

    result: list[dict[str, Any]] = []
    for revisit in sorted(revisits, key=lambda item: (_date(item) or dt.datetime.max, _text(item.get("numos")))):
        revisit_os = _text(revisit.get("numos"))
        linked = previous_by_os.get(revisit_os)
        origin, basis = linked if linked else (None, None)
        origin_date = _date(origin) if origin else None
        revisit_date = _date(revisit)

        confidence = "unlinked"
        if origin:
            sequence_matches = _recurrence(origin) == _recurrence(revisit) - 1
            if basis == "contract" and sequence_matches:
                confidence = "high"
            elif basis == "customer" and sequence_matches:
                confidence = "medium"
            else:
                confidence = "low"

        result.append({
            "origin_os": _text(origin.get("numos")) if origin else None,
            "revisit_os": revisit_os,
            "recurrence": _recurrence(revisit),
            "link_basis": basis,
            "link_confidence": confidence,
            "days_between": (revisit_date.date() - origin_date.date()).days
            if origin_date and revisit_date else None,
            "same_team": _same_team(origin, revisit) if origin else None,
            "origin": origin,
            "revisit": revisit,
        })

    return result
