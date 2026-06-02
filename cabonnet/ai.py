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
    """Gera análise operacional estruturada via Claude API com cache de 5 minutos por hash de payload."""
    data_hash = hashlib.md5(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    now = _time_mod.time()

    with state._ai_cache_lock:
        c = state._ai_cache
        if c["hash"] == data_hash and (now - c["ts"]) < _AI_CACHE_TTL:
            return {
                "problema": c.get("problema", ""), "sugestao": c.get("sugestao", ""),
                "acao":     c.get("acao", ""),     "insights": c.get("insights", []),
                "cached": True,
            }

    if not ANTHROPIC_API_KEY:
        return None

    fornecedores_txt = ", ".join(
        f"{f['nome']} ({f['sla']}% SLA, {f['total']} OS)" for f in payload.get("fornecedores", [])
    ) or "sem dados"
    cidades_txt = ", ".join(
        f"{c['cidade']} ({c['count']} críticas)" for c in payload.get("topCidadesCriticas", [])
    ) or "nenhuma"

    prompt = (
        "Você é um analista sênior de operações de ISP. Analise os dados abaixo e responda em "
        "português brasileiro com três seções distintas e objetivas.\n\n"
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
        '{"problema": "1 frase identificando o principal gargalo com dados concretos (ex: N OS críticas, aging Xd)", '
        '"sugestao": "1 frase sobre o que precisa ser feito para resolver (estratégia, não tática)", '
        '"acao": "1 frase de ação imediata e específica (quem faz o quê agora)", '
        '"insights": ["dado relevante 1", "dado relevante 2", "dado relevante 3"]}\n\n'
        "Regras: cite números reais dos dados, identifique causas (não sintomas), seja cirúrgico."
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
        result   = json.loads(raw)
        problema = result.get("problema", "")
        sugestao = result.get("sugestao", "")
        acao     = result.get("acao", "")
        insights = result.get("insights", [])[:3]

        with state._ai_cache_lock:
            state._ai_cache.update({
                "hash": data_hash, "ts": now,
                "problema": problema, "sugestao": sugestao,
                "acao": acao, "insights": insights,
            })

        log.info("[AI] Análise gerada — problema:%d, sugestao:%d, acao:%d", len(problema), len(sugestao), len(acao))
        return {"problema": problema, "sugestao": sugestao, "acao": acao, "insights": insights, "cached": False}

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


def _ai_alertas(payload):
    """Analisa alertas operacionais ativos e identifica o mais urgente com causa raiz e ação imediata."""
    data_hash = hashlib.md5(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    now = _time_mod.time()

    with state._ai_alertas_lock:
        c = state._ai_alertas_cache
        if c["hash"] == data_hash and (now - c["ts"]) < _AI_CACHE_TTL:
            return {**{k: c[k] for k in c if k not in ("hash", "ts")}, "cached": True}

    if not ANTHROPIC_API_KEY:
        return None

    alertas = payload.get("alertas", [])
    ctx     = payload.get("contexto", {})

    alertas_txt = "\n".join(
        f"  - [{a.get('nivel','?').upper()}] {a.get('titulo','?')}: {a.get('msg','?')} (ref: {a.get('ref','?')})"
        for a in alertas
    ) or "  nenhum alerta"

    prompt = (
        "Você é um analista de operações de ISP regional. Analise os alertas operacionais abaixo "
        "e identifique qual é o mais urgente, sua causa raiz e a ação imediata necessária.\n\n"
        "=== ALERTAS ATIVOS ===\n"
        f"{alertas_txt}\n\n"
        "=== CONTEXTO ===\n"
        f"Total OS: {ctx.get('total', 0)} | Críticas: {ctx.get('criticas', 0)} | "
        f"Sem equipe: {ctx.get('semEquipe', 0)} | Aging médio: {ctx.get('aging', 0):.1f}d\n\n"
        "Cite os dados reais dos alertas. Identifique causa raiz (não sintoma). "
        "A ação imediata deve especificar quem faz o quê agora.\n\n"
        "Responda SOMENTE com JSON válido, sem markdown:\n"
        '{"prioridade": "nome do alerta mais urgente", '
        '"causa_raiz": "1 frase com hipótese de causa raiz", '
        '"acao_imediata": "1 frase de ação específica (quem, o quê)", '
        '"insights": ["dado relevante 1", "dado relevante 2"]}'
    )

    try:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": "claude-haiku-4-5-20251001", "max_tokens": 500, "messages": [{"role": "user", "content": prompt}]},
            timeout=20, verify=False,
        )
        if not resp.ok:
            log.warning("[AI] alertas %s: %s", resp.status_code, resp.text[:200])
            return None
        raw = resp.json()["content"][0]["text"].strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"): raw = raw[4:]
        result = json.loads(raw)
        out = {
            "prioridade":    result.get("prioridade", ""),
            "causa_raiz":    result.get("causa_raiz", ""),
            "acao_imediata": result.get("acao_imediata", ""),
            "insights":      result.get("insights", [])[:2],
        }
        with state._ai_alertas_lock:
            state._ai_alertas_cache.update({"hash": data_hash, "ts": now, **out})
        log.info("[AI] alertas gerado — prioridade=%s", out["prioridade"])
        return {**out, "cached": False}
    except Exception as ex:
        log.warning("[AI] alertas erro: %s", str(ex)[:200])
        return None


def _ai_capacidade(payload):
    """Diagnóstico de capacidade operacional: fila vs ritmo vs meta."""
    data_hash = hashlib.md5(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    now = _time_mod.time()

    with state._ai_capacidade_lock:
        c = state._ai_capacidade_cache
        if c["hash"] == data_hash and (now - c["ts"]) < _AI_CACHE_TTL:
            return {**{k: c[k] for k in c if k not in ("hash", "ts")}, "cached": True}

    if not ANTHROPIC_API_KEY:
        return None

    por_tipo_txt = ", ".join(
        f"{t}: {n}" for t, n in payload.get("por_tipo", {}).items()
    ) or "sem dados"

    prompt = (
        "Você é um analista de capacidade de ISP regional. "
        "Com os dados de fila, ritmo e meta diária, diagnostique a situação e recomende ação concreta.\n\n"
        "=== CAPACIDADE ATUAL ===\n"
        f"Fila total: {payload.get('fila', 0)} OS | "
        f"Ritmo atual: {payload.get('ritmo_dia', 0):.1f} OS/dia | "
        f"Meta: {payload.get('meta_dia', 0)} OS/dia | "
        f"Dias previstos para zerar: {payload.get('dias_previstos', 0):.1f}d | "
        f"Equipes ativas: {payload.get('equipes_ativas', 0)}\n"
        f"Por tipo: {por_tipo_txt}\n\n"
        "Cite os números reais. O diagnóstico deve ser 1 frase com a situação atual. "
        "A projeção deve dizer o que acontece se nada mudar. "
        "A recomendação deve ser 1 ação concreta e específica.\n\n"
        "Responda SOMENTE com JSON válido, sem markdown:\n"
        '{"diagnostico": "1 frase: situação real com números", '
        '"projecao": "1 frase: o que acontece se nada mudar", '
        '"recomendacao": "1 frase: ação concreta"}'
    )

    try:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": "claude-haiku-4-5-20251001", "max_tokens": 400, "messages": [{"role": "user", "content": prompt}]},
            timeout=20, verify=False,
        )
        if not resp.ok:
            log.warning("[AI] capacidade %s: %s", resp.status_code, resp.text[:200])
            return None
        raw = resp.json()["content"][0]["text"].strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"): raw = raw[4:]
        result = json.loads(raw)
        out = {
            "diagnostico":  result.get("diagnostico", ""),
            "projecao":     result.get("projecao", ""),
            "recomendacao": result.get("recomendacao", ""),
        }
        with state._ai_capacidade_lock:
            state._ai_capacidade_cache.update({"hash": data_hash, "ts": now, **out})
        log.info("[AI] capacidade gerado")
        return {**out, "cached": False}
    except Exception as ex:
        log.warning("[AI] capacidade erro: %s", str(ex)[:200])
        return None


def _ai_campo_previsao(payload):
    """Analisa desempenho de fornecedores de campo e prevê fechamento semanal de SLA."""
    data_hash = hashlib.md5(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    now = _time_mod.time()

    with state._ai_campo_lock:
        c = state._ai_campo_cache
        if c["hash"] == data_hash and (now - c["ts"]) < _AI_CACHE_TTL:
            return {**{k: c[k] for k in c if k not in ("hash", "ts")}, "cached": True}

    if not ANTHROPIC_API_KEY:
        return None

    forn_txt = "\n".join(
        f"  - {f['nome']}: fila={f.get('fila',0)}, ritmo={f.get('ritmo',0):.1f}/dia, "
        f"SLA={f.get('sla_pct',0)}%, críticas={f.get('criticas',0)}"
        for f in payload.get("fornecedores", [])
    ) or "  sem dados"

    prompt = (
        "Você é um especialista em campo de ISP regional. "
        "Analise o desempenho de cada fornecedor e preveja se vai fechar a semana no SLA.\n\n"
        f"Meta SLA: {payload.get('meta_sla', 80)}%\n\n"
        "=== FORNECEDORES ===\n"
        f"{forn_txt}\n\n"
        "Para cada fornecedor, classifique: ok (SLA acima da meta e tendência positiva), "
        "risco (próximo da meta ou queda), crítico (abaixo da meta). "
        "A recomendação deve indicar a ação mais urgente.\n\n"
        "Responda SOMENTE com JSON válido, sem markdown:\n"
        '{"analises": [{"nome": "WES", "status": "ok|risco|critico", '
        '"narrativa": "1 frase com dado específico", "risco": "baixo|médio|alto"}], '
        '"recomendacao": "1 frase com ação mais urgente"}'
    )

    try:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": "claude-haiku-4-5-20251001", "max_tokens": 500, "messages": [{"role": "user", "content": prompt}]},
            timeout=20, verify=False,
        )
        if not resp.ok:
            log.warning("[AI] campo-previsao %s: %s", resp.status_code, resp.text[:200])
            return None
        raw = resp.json()["content"][0]["text"].strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"): raw = raw[4:]
        result = json.loads(raw)
        out = {
            "analises":     result.get("analises", []),
            "recomendacao": result.get("recomendacao", ""),
        }
        with state._ai_campo_lock:
            state._ai_campo_cache.update({"hash": data_hash, "ts": now, **out})
        log.info("[AI] campo-previsao gerado — %d fornecedores", len(out["analises"]))
        return {**out, "cached": False}
    except Exception as ex:
        log.warning("[AI] campo-previsao erro: %s", str(ex)[:200])
        return None


def _ai_fornecedor_rec(payload):
    """Avalia portfolio de fornecedores (score, SLA, MTTR, custo) e recomenda realocação."""
    data_hash = hashlib.md5(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    now = _time_mod.time()

    with state._ai_fornecedor_lock:
        c = state._ai_fornecedor_cache
        if c["hash"] == data_hash and (now - c["ts"]) < _AI_CACHE_TTL:
            return {**{k: c[k] for k in c if k not in ("hash", "ts")}, "cached": True}

    if not ANTHROPIC_API_KEY:
        return None

    forn_txt = "\n".join(
        f"  - {f['nome']}: score={f.get('score',0)}, SLA={f.get('sla',0)}%, "
        f"MTTR={f.get('mttr',0):.1f}d, total={f.get('total',0)} OS, "
        f"críticas={f.get('criticas',0)}, custo/OS=R${f.get('custo_por_os',0)}"
        for f in payload.get("fornecedores", [])
    ) or "  sem dados"

    prompt = (
        "Você é um analista de fornecedores de ISP regional. "
        "Avalie o portfolio considerando score composto, SLA, MTTR e custo por OS. "
        "Identifique o melhor, o pior e recomende onde aumentar ou reduzir alocação.\n\n"
        "=== FORNECEDORES ===\n"
        f"{forn_txt}\n\n"
        "Tier A: alto score, baixo custo, SLA acima da meta. "
        "Tier B: performance mediana. Tier C: baixo score ou custo elevado sem contrapartida.\n\n"
        "Responda SOMENTE com JSON válido, sem markdown:\n"
        '{"narrativa": "1-2 frases: diagnóstico do portfolio com dados", '
        '"ranking": [{"nome": "...", "tier": "A|B|C", '
        '"recomendacao": "aumentar|manter|reduzir", "motivo": "1 frase"}]}'
    )

    try:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": "claude-haiku-4-5-20251001", "max_tokens": 600, "messages": [{"role": "user", "content": prompt}]},
            timeout=20, verify=False,
        )
        if not resp.ok:
            log.warning("[AI] fornecedor-rec %s: %s", resp.status_code, resp.text[:200])
            return None
        raw = resp.json()["content"][0]["text"].strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"): raw = raw[4:]
        result = json.loads(raw)
        out = {
            "narrativa": result.get("narrativa", ""),
            "ranking":   result.get("ranking", []),
        }
        with state._ai_fornecedor_lock:
            state._ai_fornecedor_cache.update({"hash": data_hash, "ts": now, **out})
        log.info("[AI] fornecedor-rec gerado — %d fornecedores ranqueados", len(out["ranking"]))
        return {**out, "cached": False}
    except Exception as ex:
        log.warning("[AI] fornecedor-rec erro: %s", str(ex)[:200])
        return None


def _ai_planner(payload):
    """Analisa distribuição de carga semanal por equipe e por dia, sugere redistribuição."""
    data_hash = hashlib.md5(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    now = _time_mod.time()

    with state._ai_planner_lock:
        c = state._ai_planner_cache
        if c["hash"] == data_hash and (now - c["ts"]) < _AI_CACHE_TTL:
            return {**{k: c[k] for k in c if k not in ("hash", "ts")}, "cached": True}

    if not ANTHROPIC_API_KEY:
        return None

    dias = payload.get("dias", ["seg", "ter", "qua", "qui", "sex"])
    meta = payload.get("meta_diaria", 4)

    equipes_txt = "\n".join(
        f"  - {e['nome']}: total={e.get('total_semana', 0)} | " +
        " | ".join(f"{d}={e.get('por_dia', {}).get(d, 0)}" for d in dias)
        for e in payload.get("equipes", [])
    ) or "  sem dados"

    prompt = (
        "Você é um gestor de escalonamento de ISP regional. "
        "Analise a distribuição de carga semanal por equipe e por dia. "
        f"Meta diária por equipe: {meta} OS.\n\n"
        "=== DISTRIBUIÇÃO SEMANAL ===\n"
        f"{equipes_txt}\n\n"
        "Identifique desbalanceamento entre dias (picos e vales) e entre equipes. "
        "Sugira redistribuição específica com impacto esperado.\n\n"
        "Responda SOMENTE com JSON válido, sem markdown:\n"
        '{"narrativa": "1 frase: diagnóstico do desbalanceamento com dados", '
        '"sugestoes": [{"equipe": "F01 - JOAO", '
        '"acao": "1 frase de ação específica", '
        '"impacto": "1 frase de impacto esperado"}]}'
    )

    try:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": "claude-haiku-4-5-20251001", "max_tokens": 700, "messages": [{"role": "user", "content": prompt}]},
            timeout=20, verify=False,
        )
        if not resp.ok:
            log.warning("[AI] planner %s: %s", resp.status_code, resp.text[:200])
            return None
        raw = resp.json()["content"][0]["text"].strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"): raw = raw[4:]
        result = json.loads(raw)
        out = {
            "narrativa": result.get("narrativa", ""),
            "sugestoes": result.get("sugestoes", []),
        }
        with state._ai_planner_lock:
            state._ai_planner_cache.update({"hash": data_hash, "ts": now, **out})
        log.info("[AI] planner gerado — %d sugestões", len(out["sugestoes"]))
        return {**out, "cached": False}
    except Exception as ex:
        log.warning("[AI] planner erro: %s", str(ex)[:200])
        return None


def _ai_proxima_os(payload):
    """Seleciona as próximas N OS a executar por prioridade (SLA risco, aging, tipo)."""
    data_hash = hashlib.md5(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    now = _time_mod.time()

    with state._ai_proxima_lock:
        c = state._ai_proxima_cache
        if c["hash"] == data_hash and (now - c["ts"]) < _AI_CACHE_TTL:
            return {**{k: c[k] for k in c if k not in ("hash", "ts")}, "cached": True}

    if not ANTHROPIC_API_KEY:
        return None

    n    = payload.get("n", 3)
    fila = payload.get("fila", [])

    fila_txt = "\n".join(
        f"  - OS#{o.get('numos','?')}: tipo={o.get('tipo','?')}, cidade={o.get('cidade','?')}, "
        f"bairro={o.get('bairro','?')}, aging={o.get('aging',0)}d, "
        f"sla_risco={o.get('sla_risco',0)}, equipe={o.get('equipe','?')}"
        for o in fila[:20]
    ) or "  fila vazia"

    prompt = (
        "Você é um despachante sênior de ISP regional. "
        f"Da fila fornecida, selecione as próximas {n} OS a executar com prioridade. "
        "Critérios: SLA risco (quanto maior mais urgente), aging (maior = mais urgente), "
        "tipo (críticos: INSTALACAO com aging alto, MANUTENCAO com SLA alto primeiro).\n\n"
        "=== FILA ===\n"
        f"{fila_txt}\n\n"
        "Justifique cada escolha em 1 frase com dados concretos.\n\n"
        "Responda SOMENTE com JSON válido, sem markdown:\n"
        '{"proximas": [{"numos": "1234567", "motivo": "1 frase de justificativa", '
        '"urgencia": "critica|alta|normal"}], '
        '"narrativa": "1 frase explicando o critério de priorização"}'
    )

    try:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": "claude-haiku-4-5-20251001", "max_tokens": 500, "messages": [{"role": "user", "content": prompt}]},
            timeout=20, verify=False,
        )
        if not resp.ok:
            log.warning("[AI] proxima-os %s: %s", resp.status_code, resp.text[:200])
            return None
        raw = resp.json()["content"][0]["text"].strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"): raw = raw[4:]
        result = json.loads(raw)
        out = {
            "proximas":  result.get("proximas", [])[:n],
            "narrativa": result.get("narrativa", ""),
        }
        with state._ai_proxima_lock:
            state._ai_proxima_cache.update({"hash": data_hash, "ts": now, **out})
        log.info("[AI] proxima-os gerado — %d OS priorizadas", len(out["proximas"]))
        return {**out, "cached": False}
    except Exception as ex:
        log.warning("[AI] proxima-os erro: %s", str(ex)[:200])
        return None


def _ai_cidades_cluster(payload):
    """Identifica clusters geográficos de OS pendentes para otimização logística."""
    data_hash = hashlib.md5(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    now = _time_mod.time()

    with state._ai_cluster_lock:
        c = state._ai_cluster_cache
        if c["hash"] == data_hash and (now - c["ts"]) < _AI_CACHE_TTL:
            return {**{k: c[k] for k in c if k not in ("hash", "ts")}, "cached": True}

    if not ANTHROPIC_API_KEY:
        return None

    pendentes = payload.get("pendentes", [])

    pendentes_txt = "\n".join(
        f"  - OS#{o.get('numos','?')}: {o.get('cidade','?')} / {o.get('bairro','?')}, "
        f"tipo={o.get('tipo','?')}, aging={o.get('aging',0)}d"
        for o in pendentes[:30]
    ) or "  sem pendentes"

    prompt = (
        "Você é um analista logístico de ISP regional. "
        "Identifique concentrações (clusters) de OS pendentes no mesmo bairro/cidade "
        "que poderiam ser atendidas por uma única ida de equipe, reduzindo deslocamento.\n\n"
        "=== OS PENDENTES ===\n"
        f"{pendentes_txt}\n\n"
        "Agrupe por bairro+cidade. Clusters com 2+ OS têm oportunidade logística. "
        "Priorize clusters com maior count e aging mais alto.\n\n"
        "Responda SOMENTE com JSON válido, sem markdown:\n"
        '{"clusters": [{"bairro": "Centro", "cidade": "Taubaté", "count": 5, '
        '"tipos": ["MANUTENCAO"], "sugestao": "1 frase de ação logística"}], '
        '"narrativa": "1 frase: maior oportunidade de otimização"}'
    )

    try:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": "claude-haiku-4-5-20251001", "max_tokens": 500, "messages": [{"role": "user", "content": prompt}]},
            timeout=20, verify=False,
        )
        if not resp.ok:
            log.warning("[AI] cidades-cluster %s: %s", resp.status_code, resp.text[:200])
            return None
        raw = resp.json()["content"][0]["text"].strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"): raw = raw[4:]
        result = json.loads(raw)
        out = {
            "clusters":  result.get("clusters", []),
            "narrativa": result.get("narrativa", ""),
        }
        with state._ai_cluster_lock:
            state._ai_cluster_cache.update({"hash": data_hash, "ts": now, **out})
        log.info("[AI] cidades-cluster gerado — %d clusters", len(out["clusters"]))
        return {**out, "cached": False}
    except Exception as ex:
        log.warning("[AI] cidades-cluster erro: %s", str(ex)[:200])
        return None


def _ai_produtividade_analise(payload):
    """Analisa quedas de produtividade por equipe e identifica causa mais provável."""
    data_hash = hashlib.md5(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    now = _time_mod.time()

    with state._ai_produtiv_lock:
        c = state._ai_produtiv_cache
        if c["hash"] == data_hash and (now - c["ts"]) < _AI_CACHE_TTL:
            return {**{k: c[k] for k in c if k not in ("hash", "ts")}, "cached": True}

    if not ANTHROPIC_API_KEY:
        return None

    quedas = payload.get("quedas", [])
    ctx    = payload.get("contexto", "semana normal")

    quedas_txt = "\n".join(
        f"  - {q['equipe']}: atual={q.get('atual', 0)} OS, anterior={q.get('anterior', 0)} OS, "
        f"variação={q.get('delta_pct', 0):+.0f}%"
        for q in quedas
    ) or "  sem quedas detectadas"

    prompt = (
        "Você é um gestor de RH de ISP regional especializado em performance de campo. "
        "Analise as quedas de produtividade por equipe e identifique a causa mais provável "
        "(feriado, equipe reduzida, demanda baixa, problema de performance, recesso).\n\n"
        f"Contexto da semana: {ctx}\n\n"
        "=== QUEDAS DE PRODUTIVIDADE ===\n"
        f"{quedas_txt}\n\n"
        "Para cada equipe, aponte a hipótese de causa raiz mais provável com base nos dados. "
        "O diagnóstico geral deve resumir o padrão observado.\n\n"
        "Responda SOMENTE com JSON válido, sem markdown:\n"
        '{"analises": [{"equipe": "F01 - JOAO", '
        '"causa": "1 frase com hipótese de causa raiz", '
        '"recomendacao": "1 frase de ação específica"}], '
        '"narrativa": "1 frase: diagnóstico geral"}'
    )

    try:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": "claude-haiku-4-5-20251001", "max_tokens": 500, "messages": [{"role": "user", "content": prompt}]},
            timeout=20, verify=False,
        )
        if not resp.ok:
            log.warning("[AI] produtividade-analise %s: %s", resp.status_code, resp.text[:200])
            return None
        raw = resp.json()["content"][0]["text"].strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"): raw = raw[4:]
        result = json.loads(raw)
        out = {
            "analises":  result.get("analises", []),
            "narrativa": result.get("narrativa", ""),
        }
        with state._ai_produtiv_lock:
            state._ai_produtiv_cache.update({"hash": data_hash, "ts": now, **out})
        log.info("[AI] produtividade-analise gerado — %d equipes", len(out["analises"]))
        return {**out, "cached": False}
    except Exception as ex:
        log.warning("[AI] produtividade-analise erro: %s", str(ex)[:200])
        return None


def _ai_juniper_correlacao(payload):
    """Correlaciona clientes inativos no Juniper com OS abertas, detectando quedas sem OS."""
    data_hash = hashlib.md5(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    now = _time_mod.time()

    with state._ai_juniper_lock:
        c = state._ai_juniper_cache
        if c["hash"] == data_hash and (now - c["ts"]) < _AI_CACHE_TTL:
            return {**{k: c[k] for k in c if k not in ("hash", "ts")}, "cached": True}

    if not ANTHROPIC_API_KEY:
        return None

    inativos  = payload.get("inativos", [])
    os_ativas = payload.get("os_ativas", [])

    inativos_txt = "\n".join(
        f"  - {c['nome']} ({c.get('cidade', '?')})"
        for c in inativos[:30]
    ) or "  nenhum inativo"

    os_txt = "\n".join(
        f"  - OS#{o.get('numos','?')}: {o.get('cidade','?')}, tipo={o.get('tipo','?')}"
        for o in os_ativas[:30]
    ) or "  nenhuma OS ativa"

    prompt = (
        "Você é um analista NOC de ISP regional. "
        "Compare clientes inativos no Juniper (PPPoE offline) com OS abertas no sistema. "
        "Identifique clientes inativos SEM OS correspondente — estes são possíveis incidentes "
        "não reportados que precisam de abertura de OS proativa.\n\n"
        "=== CLIENTES INATIVOS NO JUNIPER ===\n"
        f"{inativos_txt}\n\n"
        "=== OS ATIVAS NO SISTEMA ===\n"
        f"{os_txt}\n\n"
        "Um cliente inativo tem OS correspondente se houver OS da mesma cidade/bairro com tipo MANUTENCAO ou INSTALACAO. "
        "Liste apenas os sem OS. O resumo deve ser 1 frase sobre a situação geral.\n\n"
        "Responda SOMENTE com JSON válido, sem markdown:\n"
        '{"sem_os": [{"nome": "CLI-001", "cidade": "Taubaté", '
        '"alerta": "Cliente inativo sem OS — possível queda não reportada"}], '
        '"narrativa": "1 frase: resumo da situação de correlação"}'
    )

    try:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": "claude-haiku-4-5-20251001", "max_tokens": 400, "messages": [{"role": "user", "content": prompt}]},
            timeout=20, verify=False,
        )
        if not resp.ok:
            log.warning("[AI] juniper-correlacao %s: %s", resp.status_code, resp.text[:200])
            return None
        raw = resp.json()["content"][0]["text"].strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"): raw = raw[4:]
        result = json.loads(raw)
        out = {
            "sem_os":    result.get("sem_os", []),
            "narrativa": result.get("narrativa", ""),
        }
        with state._ai_juniper_lock:
            state._ai_juniper_cache.update({"hash": data_hash, "ts": now, **out})
        log.info("[AI] juniper-correlacao gerado — %d sem OS", len(out["sem_os"]))
        return {**out, "cached": False}
    except Exception as ex:
        log.warning("[AI] juniper-correlacao erro: %s", str(ex)[:200])
        return None
