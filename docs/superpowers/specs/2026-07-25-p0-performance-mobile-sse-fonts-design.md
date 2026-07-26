# P0 — Performance, mobile, SSE e fontes

**Data:** 2026-07-25

## Objetivo

Entregar uma primeira tela operacional útil em até 3 segundos, reduzir drasticamente o payload inicial e tornar o shell utilizável em 375–1440 px sem alterar a lógica dos indicadores.

## Escopo

- `/query?compact=1` omite `observacoes` e `observacaocritica` da listagem; `/detalhes` continua sendo a fonte completa sob demanda.
- Compressão gzip para respostas grandes do FastAPI.
- `/stats` aparece durante o processamento do conjunto completo.
- Persistência e BroadcastChannel não clonam payloads acima do limite seguro.
- Sidebar móvel vira drawer com backdrop; conteúdo, navbar e filtros não recebem recuo lateral abaixo de `md`.
- Controles primários móveis têm alvo mínimo de 44 px e o documento não cria overflow horizontal.
- `/events` e `/stats` são encaminhados pelos servidores Node/Vite.
- Inter permanece como identidade do produto, usando a pilha local do sistema para não depender de Google Fonts nem violar CSP.

## Fora do escopo

- Alterar fórmulas de KPI, metas ou filtros de negócio.
- Redesenhar a hierarquia do dashboard (P1).
- Remover colunas necessárias a mapas, filas ou drill-downs.

## Critérios de aceite

1. O payload compacto preserva todas as colunas, exceto os dois campos de observação, e declara `compact: true`.
2. Observações aparecem na modal/drawer depois da consulta `/detalhes`.
3. `/query?compact=1` responde comprimido quando o cliente aceita gzip.
4. `/stats` e `/events` não retornam o HTML do SPA nem 404 pelo proxy.
5. Em 375, 768, 1280 e 1440 px não há scroll horizontal do documento.
6. Em mobile, sidebar fechada não ocupa largura; aberta usa drawer e pode ser fechada pelo backdrop, navegação ou Escape.
7. Não há requisição a `fonts.googleapis.com`/`fonts.gstatic.com`.
8. Testes Python/Vitest, build e QA Playwright passam.

## Direção visual

Preservar os tokens zinc/Inter e o dark mode atuais. A recomendação genérica de navegação horizontal da skill foi rejeitada por conflito com o uso operacional; navegação móvel será um drawer convencional, previsível e acessível.
