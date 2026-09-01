# Plano de implementação — P1 hierarquia decisória

Data: 2026-07-25

## Fase 1 — Contratos em vermelho

1. Criar testes de `DashboardCommandCenter` para ordem, ações e projeção.
2. Atualizar testes de `PulsoHero` para narrativa-first, IA recolhida e métricas compactas.
3. Executar apenas os testes novos/alterados e confirmar falha antes da produção.

## Fase 2 — Centro de decisão

1. Criar `src/features/dashboard/DashboardCommandCenter.tsx`.
2. Implementar painel `Prioridades agora` com cinco linhas de KPI e projeção 24/48h.
3. Garantir callbacks puros para modal/drill-down, sem acesso direto ao contexto.

## Fase 3 — Pulso compacto

1. Refatorar `PulsoHero.tsx` mantendo seu contrato público sempre que possível.
2. Tornar narrativa nativa o conteúdo padrão.
3. Recolher o formulário de IA e manter estados de carregamento/resultado.
4. Remover sparklines duplicadas do hero e compactar o fluxo em 2 × 2 / 4 colunas.

## Fase 4 — Integração e remoção de duplicação

1. Integrar `DashboardCommandCenter` em `DashboardPage.tsx`.
2. Remover a grade separada `Alertas & Risco` e a projeção isolada.
3. Renomear performance para `Capacidade & Entrega`.
4. Preservar banners de cluster/anomalia, modais e demais painéis.

## Fase 5 — Verificação

1. Rodar testes focados até verde e refatorar.
2. Rodar `npm test`, `npm run lint`, `npm run build` e `git diff --check`.
3. Executar QA em Chromium em 375, 768, 1280 e 1440 px.
4. Comparar y dos headings e altura do documento contra a linha de base.
5. Validar abertura de prioridade, modal, IA recolhida e ausência de overflow/console errors.

