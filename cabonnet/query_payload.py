# -*- coding: utf-8 -*-
"""Montagem do payload leve consumido pelo dashboard.

As observações são os campos mais pesados da listagem e já possuem uma fonte
sob demanda em /detalhes. O cache evita reprocessar o mesmo snapshot do Grafana
a cada aba ou atualização do navegador.
"""

import csv
import io
import threading
from typing import Any


_HEAVY_DETAIL_FIELDS = frozenset({"observacoes", "observacaocritica"})
_compact_cache_lock = threading.Lock()
_compact_cache_key: tuple[Any, ...] | None = None
_compact_cache_value: dict[str, str] | None = None


def compact_csv(csv_text: str) -> str:
    if not csv_text:
        return ""

    reader = csv.DictReader(io.StringIO(csv_text))
    source_fields = reader.fieldnames or []
    fields = [field for field in source_fields if field not in _HEAVY_DETAIL_FIELDS]
    if len(fields) == len(source_fields):
        return csv_text

    output = io.StringIO(newline="")
    writer = csv.DictWriter(
        output,
        fieldnames=fields,
        extrasaction="ignore",
        lineterminator="\n",
    )
    writer.writeheader()
    writer.writerows(reader)
    return output.getvalue()


def compact_query_parts(
    pendente: str,
    agendado: str,
    futuro: str,
    *,
    cache_token: Any = None,
) -> dict[str, str]:
    global _compact_cache_key, _compact_cache_value

    key = (
        cache_token,
        len(pendente or ""),
        len(agendado or ""),
        len(futuro or ""),
    )
    with _compact_cache_lock:
        if _compact_cache_key == key and _compact_cache_value is not None:
            return dict(_compact_cache_value)

    compacted = {
        "pendente": compact_csv(pendente or ""),
        "agendado": compact_csv(agendado or ""),
        "futuro": compact_csv(futuro or ""),
    }

    with _compact_cache_lock:
        _compact_cache_key = key
        _compact_cache_value = compacted
    return dict(compacted)
