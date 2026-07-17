# Redesign Enterprise — Onda 2: Dashboard (Design)

**Data:** 2026-07-17
**Status:** Aprovado pelo usuário
**Escopo deste documento:** design da Onda 2 do redesign enterprise — reorganização por hierarquia de leitura e simplificação do Hero na tela `/` (`DashboardPage.tsx`). Continuação de `2026-07-15-redesign-enterprise-onda1-fundacao-design.md`.

---

## 1. Contexto

A Onda 1 (Fundação) entregou a base de design system consumida por toda a aplicação: escala tipográfica semântica, `StatCard` canônico, `DataTable` virtualizado com estado vazio, `EmptyState`/`PageHeader`, `audit:ds` no CI. Esta onda aplica essa base à tela mais madura do app — o Dashboard (`/`) — reorganizando-a por hierarquia de leitura em vez de reskin.

**Achado central da auditoria desta onda:** os cards de KPI (`StatCard`) e a maioria dos painéis analíticos (`AgingPanel`, `RitmoEquipesPanel`, `CidadesValePanel`, `ParetoServicoPanel`, `FornecedoresPanel`, `MetaMesCard`) **já seguem** a linguagem sóbria (bordas neutras, cor só em status, barras horizontais com hover, `tabular-nums`) validada pela proposta aprovada (`dashboard-proposta-sobria.html`). O trabalho desta onda não é reskin — é **reorganização por hierarquia** e **simplificação do Hero**, que hoje concentra informação demais no Nível 1 de leitura.

**Restrições permanentes (herdadas da Onda 1, sem exceção):**
- Design sóbrio: tokens reais do `index.css`, Inter, cor apenas para status. Nada de tema conceitual, fonte de destaque, atmosfera/textura.
- Sem novas dependências de stack — sem Next.js, sem shadcn/ui. `recharts` e `framer-motion` já instalados, reaproveitar.
- `npm run build`, `npm run lint`, `npx tsc --noEmit` limpos antes de qualquer commit.

**Validação cruzada (2026-07-17):** proposta revisada contra `ui-ux-pro-max` (banco de padrões de UX/dashboard) e `frontend-design` (skill de interfaces de marketing/portfólio).
- `ui-ux-pro-max` **validou** a direção: "Analytics Dashboard" recomenda Data-Dense + Minimalismo + Dark Mode; os tipos de gráfico já em uso batem com a recomendação por caso de uso (`RitmoEquipesPanel` = bullet chart, `FluxoOSPanel` = line chart de série temporal, rankings por barra = bar chart descendente, gauge restrito a KPI único). Paleta/fonte genéricas sugeridas pela ferramenta foram descartadas — tokens do `index.css` e Inter são regra fixa do projeto, não recomendação de banco de dados.
- `frontend-design` **conflita diretamente** com as restrições permanentes (pede fonte de destaque não-Inter, atmosfera, tema ousado) — é a receita da proposta "Sala de Controle" já rejeitada pelo usuário. Não aplicada.
- Duas melhorias pontuais de acessibilidade de `ui-ux-pro-max` foram incorporadas ao escopo (§4.5).

---

## 2. Decisões de escopo (resolvidas com o usuário)

1. **Escopo desta onda:** só a tela `/` (DashboardPage). Ordens, Mapa, Gráficos, Cidades, Fornecedor, Juniper, Fechamento, ERP/* ficam para ondas seguintes, reaproveitando o mesmo design system.
2. **Ponto de partida:** `dashboard-proposta-sobria.html` é a spec visual — decisões de estilo já tomadas não são reabertas.
3. **Densidade do Hero:** simplificar para o nível do mockup (anel + 1 frase + 4 tiles). Conteúdo hoje no Hero que não está no mockup migra para outros lugares (§4.2), não é removido.
4. **Painéis fora do mockup** (Meta do Mês, Pareto de Serviço, Clusters por Bairro, Fornecedores, Projeção de Risco, Executadas Hoje): mantidos todos, reorganizados nos 5 níveis de leitura (§4.1).
5. **Sparklines:** só nos tiles de fluxo do Hero (Entradas/Concluídas/Saldo), que já têm série de 14 dias via `graficos.evolucao`. Os 10 `StatCard` de risco/performance **não** ganham sparkline nesta onda — não há histórico diário salvo por KPI (mesma razão pela qual a sparkline do score já havia sido adiada). Fica registrado como melhoria futura condicionada a um endpoint de snapshot diário.

---

## 3. Arquitetura da informação atual → nova

| Bloco | Componente | Hoje (ordem) | Nova posição (nível) |
|---|---|---|---|
| Alerta de topo | `AlertaTopoBanner` | 1º | Nível 1 |
| Hero (simplificado) | `PulsoHero` | 2º | Nível 1 |
| Trajetória | `MudancasStrip` | 3º | Nível 1 |
| KPIs Alertas & Risco | `StatCard` grid | 4º | Nível 2 |
| KPIs Fila & Performance | `StatCard` grid | 8º | Nível 2 (sobe, junto do bloco acima) |
| Projeção de risco | `ProjecaoRiscoPanel` | 5º | Nível 3 |
| Clusters de falha | `ClustersBairroPanel` | 12º | Nível 3 (sobe) |
| Anomalias | `AnomaliaSection` | 14º (condicional) | Nível 3 (sobe) |
| Executadas Hoje | `ExecutadasHeroBlock` | 6º | Nível 4 |
| Fluxo de OS 14d | `FluxoOSPanel` | 9º | Nível 4 |
| Aging da fila | `AgingPanel` | 9º | Nível 4 |
| Ritmo por equipe | `RitmoEquipesPanel` | 13º | Nível 4 |
| Cidades do Vale | `CidadesValePanel` | 11º | Nível 4 |
| Composição da fila (Pareto) | `ParetoServicoPanel` | 10º | Nível 4 |
| Meta do Mês | `MetaMesCard` | 11º | Nível 5 |
| Fornecedores | `FornecedoresPanel` | 13º | Nível 5 |
| Qualidade do Período (novo) | — | (dentro do Hero hoje) | Nível 5 |

Fluxo de leitura resultante: **estado geral → o que fazer agora → onde priorizar → detalhamento operacional → contexto secundário**. Nenhum painel é removido; a mudança é 100% de posição/agrupamento.

---

## 4. Design detalhado

### 4.1 Os 5 níveis

1. **Estado geral (<2s):** `AlertaTopoBanner` + `PulsoHero` simplificado + `MudancasStrip`.
2. **KPIs principais:** as duas grades de `StatCard` (Alertas & Risco, Fila & Performance), lado a lado logo após o Nível 1.
3. **Alertas críticos:** `ProjecaoRiscoPanel`, `ClustersBairroPanel`, `AnomaliaSection` — agrupados imediatamente após os KPIs, não mais espalhados pela página.
4. **Detalhamento operacional:** `ExecutadasHeroBlock`, `FluxoOSPanel`, `AgingPanel`, `RitmoEquipesPanel`, `CidadesValePanel`, `ParetoServicoPanel` — o miolo analítico, grid de 2-3 colunas como hoje.
5. **Análises secundárias:** `MetaMesCard`, `FornecedoresPanel`, novo painel "Qualidade do Período".

### 4.2 Hero simplificado — o que sai e para onde vai

**Fica no Hero (Nível 1):** anel de score (`GaugeChart`) + badge de tendência (▲/▼ N vs anterior) + narrativa operacional (texto gerado, sem os controles de reanálise sempre visíveis) + 4 tiles de fluxo do dia (Entradas, Concluídas, Saldo, Projeção do mês) — cada tile com sparkline dos últimos 14 dias onde a série existe.

**Sai do Hero:**
- **Breakdown de peso do score** (3 barras SLA 45%/Taxa 35%/MTTR 20%) → vira conteúdo de tooltip/popover ao passar o mouse (ou tocar, no mobile) no anel de score. Continua acessível em 1 interação, mas não ocupa espaço fixo no Nível 1.
- **6 mini-stats** (SLA da Fila, SLA Atendido, MTTR, Aging Médio, Sem Agendamento, Revisitas) → novo painel `QualidadePeriodoCard` no Nível 5, mesmo padrão visual dos outros cards de painel (`SectionLabel` + grid 2×3 de valores). Esses números são do período, não do "agora" — fazem mais sentido como contexto secundário do que competindo com o pulso do Nível 1.
- **Controle de reanálise da IA** (textarea de contexto + botão reanalisar) → vira `<details>`/disclosure fechado por padrão ("Refinar análise ▾") dentro do próprio Hero. A narrativa gerada continua sempre visível; o controle de ajuste fica a 1 clique, não sempre aberto.

### 4.3 Sparklines nos tiles de fluxo

Prop opcional no `StatCard`: `sparkline?: number[]`. Renderiza um mini gráfico de linha (SVG simples, sem eixos/legendas — mesmo espírito de `recharts` `Sparklines` ou SVG feito à mão, decisão de implementação fica para o plano) alimentado por `graficos.evolucao.abertas`/`.concluidas` (14 pontos). Escopo restrito aos 4 tiles do Hero — os 10 `StatCard` de KPI (Alertas & Risco, Fila & Performance) não ganham essa prop nesta onda.

### 4.4 Reordenação de painéis (Nível 3 e Nível 4)

Pura mudança de posição em `DashboardPage.tsx`: `ClustersBairroPanel` e `AnomaliaSection` sobem para logo após as grades de KPI (Nível 3, junto de `ProjecaoRiscoPanel`, que já está bem posicionado). Os grids de 2-3 colunas do Nível 4 mantêm a composição atual (`FluxoOSPanel`+`AgingPanel`; `ParetoServicoPanel`+`CidadesValePanel`+`MetaMesCard` — este último desce para o Nível 5, então esse grid perde uma coluna ou ganha outro painel de Nível 4 no lugar; `ClustersBairroPanel`+`RitmoEquipesPanel`+`FornecedoresPanel` — os dois primeiros saem para Nível 3/5, então esse grid é refeito). O plano de implementação define os grids exatos linha a linha.

### 4.5 Acessibilidade (validado via `ui-ux-pro-max`)

- `FluxoOSPanel`: as duas linhas (Entradas/Concluídas) hoje se diferenciam só por cor (azul/roxo). Adicionar diferenciação por traço (uma linha sólida, outra tracejada) para não depender só de cor.
- `SectionLabel`: confirmar que renderiza um heading semântico (`<h2>`/`<h3>`, conforme nível na página) e não só um `<span>` estilizado — importa para navegação por leitor de tela em página com muitas seções. Se hoje for `<span>`, corrigir nesta onda.

### 4.6 Sem mudanças

- Nenhuma alteração de paleta, tipografia base (Inter) ou tokens de `index.css`.
- Nenhuma dependência nova (sem Next.js, sem shadcn/ui). `recharts`/`framer-motion` já instalados.
- Nenhum painel removido ou com lógica de dado alterada — só reposicionamento e, no caso do Hero, redistribuição de onde a informação já existente é exibida.

---

## 5. Fora de escopo (fica para depois)

- Sparkline nos 10 `StatCard` de risco/performance — precisa de endpoint de snapshot diário por KPI (mesmo bloqueio já registrado para a sparkline do score).
- Redesign de qualquer outra tela (`/ordens`, `/mapa`, `/graficos`, etc.) — ondas seguintes do mapa da Onda 1 (§3 do documento da Onda 1).
- Pesos/faixas/alvo configuráveis do score — já registrado como baixo valor no histórico do projeto.
