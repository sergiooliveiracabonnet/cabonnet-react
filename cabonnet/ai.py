# -*- coding: utf-8 -*-
"""
cabonnet/ai.py — Narrativa operacional e análise de revisitas via Claude API.
"""

import hashlib
import json
import logging
import time as _time_mod

import requests

from cabonnet.config import ANTHROPIC_API_KEY, _AI_CACHE_TTL
from cabonnet import state

log = logging.getLogger("CaboNetServer")


def _ai_narrative(payload):
    """Gera narrativa operacional via Claude API com cache de 5 minutos por hash de payload."""
    data_hash = hashlib.md5(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    now = _time_mod.time()

    with state._ai_cache_lock:
        if state._ai_cache["hash"] == data_hash and (now - state._ai_cache["ts"]) < _AI_CACHE_TTL:
            return {"narrativa": state._ai_cache["narrativa"], "insights": state._ai_cache["insights"], "cached": True}

    if not ANTHROPIC_API_KEY:
        return None

    fornecedores_txt = ", ".join(
        f"{f['nome']} ({f['sla']}% SLA, {f['total']} OS)" for f in payload.get("fornecedores", [])
    ) or "sem dados"
    cidades_txt = ", ".join(
        f"{c['cidade']} ({c['count']} críticas)" for c in payload.get("topCidadesCriticas", [])
    ) or "nenhuma"

    prompt = (
        "Você é um analista sênior de operações de ISP. Analise os dados abaixo e gere uma narrativa "
        "operacional concisa e acionável em português brasileiro.\n\n"
        f"OS ativas: {payload.get('total', 0)} | Críticas (SLA 2×): {payload.get('criticas', 0)} | "
        f"Sem equipe: {payload.get('semEquipe', 0)} | Em atendimento: {payload.get('atend', 0)} | "
        f"Pendentes: {payload.get('pend', 0)}\n"
        f"SLA da fila: {payload.get('slaFila', 0)}% | Taxa de conclusão: {payload.get('taxa', 0)}% | "
        f"Aging médio: {payload.get('agingMed', 0):.1f}d | MTTR: {payload.get('mttr', 0):.1f}d | "
        f"Sem agendamento: {payload.get('semAgendamento', 0)}\n"
        f"Top cidades críticas: {cidades_txt}\n"
        f"Fornecedores: {fornecedores_txt}\n"
        f"Anomalias detectadas: {payload.get('anomalias', {}).get('total', 0)}\n\n"
        "Responda SOMENTE com JSON válido, sem markdown:\n"
        '{"narrativa": "2-3 frases diretas sobre estado real, gargalo principal e ação urgente", '
        '"insights": ["insight 1", "insight 2", "insight 3"]}\n\n'
        "Regras: seja cirúrgico, identifique causas (não sintomas), priorize por urgência."
    )

    try:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key":           ANTHROPIC_API_KEY,
                "anthropic-version":   "2023-06-01",
                "content-type":        "application/json",
            },
            json={
                "model":      "claude-haiku-4-5-20251001",
                "max_tokens": 512,
                "messages":   [{"role": "user", "content": prompt}],
            },
            timeout=20,
            verify=False,
        )
        if not resp.ok:
            log.warning("[AI] Anthropic API %s: %s", resp.status_code, resp.text[:200])
            return None

        raw = resp.json()["content"][0]["text"].strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result    = json.loads(raw)
        narrativa = result.get("narrativa", "")
        insights  = result.get("insights", [])[:3]

        with state._ai_cache_lock:
            state._ai_cache.update({"hash": data_hash, "narrativa": narrativa, "insights": insights, "ts": now})

        log.info("[AI] Narrativa gerada — %d chars, %d insights", len(narrativa), len(insights))
        return {"narrativa": narrativa, "insights": insights, "cached": False}

    except Exception as ex:
        log.warning("[AI] Erro ao gerar narrativa: %s", str(ex)[:200])
        return None


def _ai_revisitas(payload):
    """Gera análise especializada de revisitas via Claude API com cache de 5 minutos."""
    data_hash = hashlib.md5(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    now = _time_mod.time()

    with state._ai_revisitas_lock:
        c = state._ai_revisitas_cache
        if c["hash"] == data_hash and (now - c["ts"]) < _AI_CACHE_TTL:
            return {"narrativa": c["narrativa"], "insights": c["insights"],
                    "estrategia": c["estrategia"], "prioridades": c["prioridades"], "cached": True}

    if not ANTHROPIC_API_KEY:
        return None

    taxa_geral  = payload.get("taxaGeral", 0)
    taxa_inst   = payload.get("taxaInst", 0)
    taxa_manut  = payload.get("taxaManut", 0)
    total       = payload.get("totalRevisitas", 0)
    evitaveis   = payload.get("evitaveisPct", 0)
    tempo_medio = payload.get("tempoMedio", 0)
    custo       = payload.get("custoEstimado", 0)
    tendencia   = payload.get("tendencia", {})
    dias_dist   = payload.get("diasDist", {})

    equipes_txt = "\n".join(
        f"  - {e['equipe']}: {e['taxa']}% de revisita ({e['total']} ocorrências)"
        for e in payload.get("porEquipe", [])[:6]
    ) or "  sem dados"

    cidades_txt = "\n".join(
        f"  - {c['cidade']}: {c['taxa']}% ({c['revisitas']} revisitas / {c['totalBase']} OS)"
        for c in payload.get("porCidade", [])[:5]
    ) or "  sem dados"

    cronicos_txt = ", ".join(
        f"{c['cliente']} ({c['count']} OS, {c.get('revisitas', 0)} revisitas)"
        for c in payload.get("cronicos", [])[:5]
    ) or "nenhum"

    trend_txt = ""
    if tendencia.get("delta", 0) != 0:
        sinal = "↑ piorou" if tendencia["delta"] > 0 else "↓ melhorou"
        trend_txt = f"\nTendência vs período anterior: {sinal} {abs(tendencia['delta'])}pp ({tendencia.get('prevTaxa', 0)}% → {taxa_geral}%)"

    prompt = (
        "Você é um especialista sênior em operações de ISP regional com 15 anos de experiência "
        "em gestão de campo, redução de retrabalho e qualidade de instalações de fibra óptica.\n\n"
        "Analise os dados abaixo e gere uma análise COMPLETA, CIRÚRGICA e ACIONÁVEL em português brasileiro.\n\n"
        "=== DADOS DE REVISITAS ===\n"
        f"Taxa Geral: {taxa_geral}% (meta ≤5%) | Instalação: {taxa_inst}% | Manutenção: {taxa_manut}%\n"
        f"Total de revisitas: {total} | Evitáveis: {evitaveis}% | Tempo médio até revisita: {tempo_medio} dias\n"
        f"Custo estimado de retrabalho: R$ {custo:,}{trend_txt}\n\n"
        f"Distribuição por tempo: 1-7d={dias_dist.get('1-7',0)}, 8-14d={dias_dist.get('8-14',0)}, "
        f"15-20d={dias_dist.get('15-20',0)}, 21-30d={dias_dist.get('21-30',0)}\n\n"
        f"Top equipes com revisitas:\n{equipes_txt}\n\n"
        f"Top cidades com revisitas:\n{cidades_txt}\n\n"
        f"Clientes crônicos: {cronicos_txt}\n\n"
        "=== INSTRUÇÕES ===\n"
        "Cite os dados reais do relatório. Identifique padrões (equipe x cidade, tempo x tipo). "
        "Seja específico sobre causa raiz — não diga 'melhorar qualidade', diga O QUÊ exatamente fazer.\n\n"
        "Responda SOMENTE com JSON válido, sem markdown:\n"
        '{"narrativa": "2-3 frases: diagnóstico preciso com dados, causa raiz principal, impacto financeiro real", '
        '"insights": ["insight com dado específico 1", "insight 2", "insight 3", "insight 4"], '
        '"estrategia": ["Ação 1 (prazo e responsável)", "Ação 2", "Ação 3", "Ação 4", "Ação 5"], '
        '"prioridades": ['
        '{"area": "Campo / Técnico", "acao": "ação específica citando equipe ou indicador do relatório", "impacto": "alto"}, '
        '{"area": "Material / Logística", "acao": "ação específica", "impacto": "médio"}, '
        '{"area": "Gestão / Processo", "acao": "ação específica", "impacto": "alto"}'
        ']}'
    )

    try:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key":         ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type":      "application/json",
            },
            json={
                "model":      "claude-haiku-4-5-20251001",
                "max_tokens": 1200,
                "messages":   [{"role": "user", "content": prompt}],
            },
            timeout=30,
            verify=False,
        )
        if not resp.ok:
            log.warning("[AI] Revisitas API %s: %s", resp.status_code, resp.text[:200])
            return None

        raw = resp.json()["content"][0]["text"].strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = json.loads(raw)
        out = {
            "narrativa":   result.get("narrativa", ""),
            "insights":    result.get("insights", [])[:4],
            "estrategia":  result.get("estrategia", [])[:5],
            "prioridades": result.get("prioridades", [])[:3],
            "cached":      False,
        }

        with state._ai_revisitas_lock:
            state._ai_revisitas_cache.update({"hash": data_hash, "ts": now, **out})

        log.info("[AI] Análise revisitas gerada — %d chars, %d ações", len(out["narrativa"]), len(out["estrategia"]))
        return out

    except Exception as ex:
        log.warning("[AI] Erro ao analisar revisitas: %s", str(ex)[:200])
        return None
