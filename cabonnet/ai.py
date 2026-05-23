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


def _ai_anomalias(payload):
    """Root Cause Analysis das anomalias detectadas via Z-score."""
    data_hash = hashlib.md5(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    now = _time_mod.time()

    with state._ai_anomalias_lock:
        c = state._ai_anomalias_cache
        if c["hash"] == data_hash and (now - c["ts"]) < _AI_CACHE_TTL:
            return {"causa_raiz": c["causa_raiz"], "acoes": c["acoes"],
                    "prioridade": c["prioridade"], "cached": True}

    if not ANTHROPIC_API_KEY:
        return None

    picos   = payload.get("picosDia",       [])
    bairros = payload.get("bairrosAnomalia", [])
    equipes = payload.get("equipesAnomalia", [])
    ctx     = payload.get("contexto",        {})

    picos_txt = "\n".join(
        f"  - {p['date']}: {p['count']} OS abertas (Z={p['zScore']}σ)"
        for p in picos[:5]
    ) or "  nenhum"

    bairros_txt = "\n".join(
        f"  - {b['bairro']}: {b['ratePct']}% SLA excedido ({b['slaExc']}/{b['total']} OS, Z={b['zScore']}σ)"
        for b in bairros[:5]
    ) or "  nenhum"

    equipes_txt = "\n".join(
        f"  - {e['nome']}: aging médio {e['agingMed']}d ({e['count']} OS, Z={e['zScore']}σ)"
        for e in equipes[:5]
    ) or "  nenhum"

    prompt = (
        "Você é um analista sênior de operações de ISP regional. O sistema detectou anomalias "
        "estatísticas (desvios significativos do padrão histórico via Z-score) nos dados de campo.\n\n"
        "=== ANOMALIAS DETECTADAS ===\n\n"
        f"Picos de abertura de OS (volume > média + 2σ):\n{picos_txt}\n\n"
        f"Bairros com SLA anômalo (taxa de excedência > média + 1.5σ):\n{bairros_txt}\n\n"
        f"Equipes com aging elevado (média > média do grupo + 1.5σ):\n{equipes_txt}\n\n"
        "=== CONTEXTO ATUAL ===\n"
        f"OS ativas: {ctx.get('total', '?')} | SLA da fila: {ctx.get('sla_pct', '?')}% | "
        f"Críticas: {ctx.get('criticas', '?')} | Aging médio: {ctx.get('aging_med', '?')}d\n\n"
        "=== INSTRUÇÕES ===\n"
        "Identifique a causa raiz MAIS PROVÁVEL das anomalias (não liste sintomas). "
        "Cite dados específicos do relatório. Proponha ações imediatas e precisas.\n\n"
        "Responda SOMENTE com JSON válido, sem markdown:\n"
        '{"causa_raiz": "1-2 frases: hipótese de causa raiz com dados do relatório", '
        '"acoes": ["Ação específica 1 (quem, o quê, quando)", "Ação 2", "Ação 3"], '
        '"prioridade": "alta|média|baixa"}'
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
                "max_tokens": 600,
                "messages":   [{"role": "user", "content": prompt}],
            },
            timeout=20,
            verify=False,
        )
        if not resp.ok:
            log.warning("[AI] Anomalias API %s: %s", resp.status_code, resp.text[:200])
            return None

        raw = resp.json()["content"][0]["text"].strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = json.loads(raw)
        out = {
            "causa_raiz": result.get("causa_raiz", ""),
            "acoes":      result.get("acoes", [])[:3],
            "prioridade": result.get("prioridade", "média"),
        }

        with state._ai_anomalias_lock:
            state._ai_anomalias_cache.update({"hash": data_hash, "ts": now, **out})

        log.info("[AI] RCA anomalias gerado — prioridade=%s", out["prioridade"])
        return {**out, "cached": False}

    except Exception as ex:
        log.warning("[AI] Erro ao analisar anomalias: %s", str(ex)[:200])
        return None


_AI_FORECAST_TTL = 3600  # 1 hora


def _ai_forecast(payload: dict):
    """Demand Forecasting — Claude analisa série histórica e projeta próximos 7 dias."""
    data_hash = hashlib.md5(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    now = _time_mod.time()

    with state._ai_forecast_lock:
        c = state._ai_forecast_cache
        if c["hash"] == data_hash and (now - c["ts"]) < _AI_FORECAST_TTL:
            return {
                "tendencia":     c["tendencia"],
                "narrativa":     c["narrativa"],
                "previsao":      c["previsao"],
                "pico_previsto": c["pico_previsto"],
                "cached":        True,
            }

    if not ANTHROPIC_API_KEY:
        return None

    serie   = payload.get("serie", [])
    ctx     = payload.get("contexto", {})

    if len(serie) < 7:
        return None

    serie_txt = "\n".join(
        f"  {p['data']}: {p['abertas']} abertas, {p['concluidas']} concluídas"
        for p in serie[-30:]
    )

    prompt = (
        "Você é um analista de dados de ISP especializado em forecasting de demanda operacional. "
        "Analise a série histórica de OS abaixo e projete os próximos 7 dias.\n\n"
        "=== SÉRIE HISTÓRICA (últimos dias) ===\n"
        f"{serie_txt}\n\n"
        "=== CONTEXTO ===\n"
        f"Total ativo hoje: {ctx.get('total_ativo', '?')} OS | "
        f"Fila pendente: {ctx.get('fila', '?')} | "
        f"Média diária abertas (período): {ctx.get('media_diaria', '?'):.1f}\n\n"
        "=== INSTRUÇÕES ===\n"
        "1. Identifique a tendência (crescente/estável/decrescente) com base nos últimos 7 dias vs. os 7 anteriores.\n"
        "2. Detecte padrões de sazonalidade (picos em certos dias da semana).\n"
        "3. Projete os próximos 7 dias com volume estimado e confiança.\n"
        "4. Confiança: 'alta' se tendência clara, 'media' se estável, 'baixa' se volátil.\n\n"
        "Responda SOMENTE com JSON válido, sem markdown:\n"
        '{"tendencia": "crescente|estável|decrescente", '
        '"narrativa": "2 frases: padrão identificado + risco principal com dados do período", '
        '"previsao": ['
        '{"data": "dd/mm", "volume": <int>, "confianca": "alta|media|baixa"}, '
        '{"data": "dd/mm", "volume": <int>, "confianca": "alta|media|baixa"}, '
        '{"data": "dd/mm", "volume": <int>, "confianca": "alta|media|baixa"}, '
        '{"data": "dd/mm", "volume": <int>, "confianca": "alta|media|baixa"}, '
        '{"data": "dd/mm", "volume": <int>, "confianca": "alta|media|baixa"}, '
        '{"data": "dd/mm", "volume": <int>, "confianca": "alta|media|baixa"}, '
        '{"data": "dd/mm", "volume": <int>, "confianca": "alta|media|baixa"}'
        '], '
        '"pico_previsto": {"data": "dd/mm", "volume": <int>} }'
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
                "max_tokens": 800,
                "messages":   [{"role": "user", "content": prompt}],
            },
            timeout=25,
            verify=False,
        )
        if not resp.ok:
            log.warning("[AI] Forecast API %s: %s", resp.status_code, resp.text[:200])
            return None

        raw = resp.json()["content"][0]["text"].strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = json.loads(raw)
        out = {
            "tendencia":     result.get("tendencia", "estável"),
            "narrativa":     result.get("narrativa", ""),
            "previsao":      result.get("previsao", [])[:7],
            "pico_previsto": result.get("pico_previsto"),
        }

        with state._ai_forecast_lock:
            state._ai_forecast_cache.update({"hash": data_hash, "ts": now, **out})

        log.info("[AI] Forecast gerado — tendência=%s, %d dias projetados", out["tendencia"], len(out["previsao"]))
        return {**out, "cached": False}

    except Exception as ex:
        log.warning("[AI] Erro ao gerar forecast: %s", str(ex)[:200])
        return None


def _ai_daily_briefing(payload: dict):
    """Briefing executivo diário gerado pelo Claude — resumo do dia anterior + riscos + 3 ações."""
    if not ANTHROPIC_API_KEY:
        return None

    fila    = payload.get("fila", {})
    cidades = payload.get("por_cidade", [])
    tipos   = payload.get("por_tipo", [])
    ontem   = payload.get("ontem", {})
    data_str = payload.get("data", "")

    cidades_txt = "\n".join(
        f"  - {c['cidade']}: {c['pendente']} pendentes, {c['atendimento']} em atendimento, {c['criticas']} críticas"
        for c in cidades[:5]
    ) or "  sem dados"

    tipos_txt = "\n".join(
        f"  - {t['tipo']}: {t['n']} OS, {t['sla_exc']} fora de SLA"
        for t in tipos[:5]
    ) or "  sem dados"

    ontem_txt = (
        f"Executadas ontem: {ontem.get('executadas', '?')} | "
        f"Abertas ontem: {ontem.get('abertas', '?')} | "
        f"Taxa: {ontem.get('taxa', '?')}%"
        if ontem else "dados do dia anterior indisponíveis"
    )

    prompt = (
        "Você é um diretor de operações de ISP regional. Gere um briefing executivo matinal "
        "conciso, acionável e em português brasileiro para a equipe de gestão.\n\n"
        "=== SITUAÇÃO DA FILA ATUAL ===\n"
        f"Total ativo: {fila.get('total', 0)} OS | "
        f"Pendentes: {fila.get('pendente', 0)} | "
        f"Em atendimento: {fila.get('atendimento', 0)} | "
        f"Críticas (SLA 2×): {fila.get('criticas', 0)} | "
        f"Sem agendamento: {fila.get('sem_agendamento', 0)} | "
        f"SLA da fila: {fila.get('sla_pct', 0)}% | "
        f"Aging médio: {fila.get('aging_med', 0):.1f}d\n\n"
        f"=== ONTEM ===\n{ontem_txt}\n\n"
        f"=== POR CIDADE ===\n{cidades_txt}\n\n"
        f"=== POR TIPO DE SERVIÇO ===\n{tipos_txt}\n\n"
        "=== INSTRUÇÕES ===\n"
        "Seja direto e específico. Identifique o risco principal do dia com dados reais. "
        "Não use frases genéricas. As ações devem ser concretas (quem, o quê, quando).\n\n"
        "Responda SOMENTE com JSON válido, sem markdown:\n"
        '{"texto": "2-3 frases: diagnóstico da situação atual + risco principal do dia com dados", '
        '"acoes": ['
        '"Ação 1 — específica com dado do relatório (ex: contatar equipe X, {N} OS críticas)", '
        '"Ação 2 — específica", '
        '"Ação 3 — específica"'
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
                "max_tokens": 700,
                "messages":   [{"role": "user", "content": prompt}],
            },
            timeout=25,
            verify=False,
        )
        if not resp.ok:
            log.warning("[AI] Briefing API %s: %s", resp.status_code, resp.text[:200])
            return None

        raw = resp.json()["content"][0]["text"].strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = json.loads(raw)
        out = {
            "texto": result.get("texto", ""),
            "acoes": result.get("acoes", [])[:3],
            "data":  data_str,
        }

        with state._ai_briefing_lock:
            state._ai_briefing_cache.update({**out, "ts": _time_mod.time()})

        log.info("[AI] Briefing diário gerado — %d chars, %d ações", len(out["texto"]), len(out["acoes"]))
        return out

    except Exception as ex:
        log.warning("[AI] Erro ao gerar briefing diário: %s", str(ex)[:200])
        return None


def _ai_suggest_team(payload: dict):
    """Sugere e justifica ranking de equipes para uma OS via Claude API. Cache 15 min por hash."""
    data_hash = hashlib.md5(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    now = _time_mod.time()

    with state._ai_suggest_lock:
        cached = state._ai_suggest_cache.get(data_hash)
        if cached and (now - cached["ts"]) < 900:
            return {**cached["data"], "cached": True}

    if not ANTHROPIC_API_KEY:
        return None

    os_data = payload.get("os", {})
    teams   = payload.get("availableTeams", [])

    os_txt = (
        f"OS #{os_data.get('numos', '?')} | Tipo: {os_data.get('_tipo', '?')} | "
        f"Cidade: {os_data.get('nomedacidade', '?')} | Bairro: {os_data.get('bairro', '?')} | "
        f"Serviço: {os_data.get('tiposervico', '?')} | "
        f"Aging: {os_data.get('_aging', 0)} dias | Risco SLA: {os_data.get('_riskScore', 0)}/100"
    )

    teams_txt = "\n".join(
        f"- {t.get('code', '?')}: {t.get('queue', 0)}/{t.get('maxQueue', 12)} na fila | "
        f"SLA {t.get('sla_pct', 0):.0f}%"
        for t in teams
    ) or "Nenhuma equipe disponível"

    prompt = (
        "Você é um despachante sênior de ISP. Analise esta OS e ranqueie as equipes disponíveis.\n\n"
        f"OS a despachar:\n{os_txt}\n\n"
        f"Equipes ({len(teams)}):\n{teams_txt}\n\n"
        "Ranqueie priorizando: compatibilidade de tipo, capacidade livre, SLA histórico, urgência da OS.\n\n"
        "Responda SOMENTE com JSON válido, sem markdown:\n"
        '{"sugestoes": [{"code": "F01", "score": 85, "motivo": "frase curta direta", '
        '"impacto": "frase curta de consequência"}, ...], '
        '"resumo": "1 frase sobre a melhor escolha"}\n\n'
        f"Liste no máximo {min(len(teams), 4)} equipes. Score 0-100. Seja técnico e direto."
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
                "max_tokens": 600,
                "messages":   [{"role": "user", "content": prompt}],
            },
            timeout=20,
            verify=False,
        )
        if not resp.ok:
            log.warning("[AI] suggest-team %s: %s", resp.status_code, resp.text[:200])
            return None

        raw = resp.json()["content"][0]["text"].strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = json.loads(raw)
        data   = {
            "sugestoes": result.get("sugestoes", [])[:4],
            "resumo":    result.get("resumo", ""),
        }

        with state._ai_suggest_lock:
            state._ai_suggest_cache[data_hash] = {"data": data, "ts": now}

        log.info("[AI] suggest-team gerado — %d sugestões", len(data["sugestoes"]))
        return {**data, "cached": False}

    except Exception as ex:
        log.warning("[AI] Erro suggest-team: %s", str(ex)[:200])
        return None
