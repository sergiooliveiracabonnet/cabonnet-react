# Redesign Enterprise — Onda 3a: Fusões de Telas ERP (Design)

**Data:** 2026-07-18
**Status:** Decisões aprovadas pelo usuário em 2026-07-18 · spec formalizada nesta sessão
**Escopo deste documento:** design da Onda 3a do redesign enterprise — fusão/remoção de 3 das 8 telas do grupo ERP da sidebar, decompondo a Onda 3 ("IA & Navegação"). Continuação de `2026-07-17-redesign-enterprise-onda2-dashboard-design.md`. A Onda 3b (sidebar por fluxo de trabalho) depende da lista final de telas produzida aqui; a Onda 3c (upgrade do command palette) vem depois.

---

## 1. Contexto

O app tem 18 rotas ativas (17 telas + login), 8 delas só no grupo ERP da sidebar, com sobreposição real de dado entre várias — cada uma foi construída para responder uma pergunta específica, mas o cruzamento das 8 nunca foi auditado em conjunto. Antes de redesenhar a sidebar (Onda 3b), esta onda decide **o que existe**.

### Mapeamento das 8 telas ERP

| # | Tela | Rota | Conteúdo | Dado próprio / duplicado |
|---|---|---|---|---|
| 1 | Central de Ação | `/erp/acao` | Agregador puro: fila urgente/violada, equipes sem execução há 4h+ (fila≥3 e zero concluída hoje), sem-equipe-atribuída >4h, clusters de bairro, técnicos com SLA<75% — lista única ordenada por severidade, clicável (abre `OSDrawer` ou navega) | 100% derivado — nenhuma lógica de negócio própria |
| 2 | Relatórios Operacionais | `/erp/relatorios` | 4 KPIs, "Produção Consolidada" (execuções por tipo), 4 gráficos, tabela de ranking por equipe (líder, tipo, execuções/tipo, fila, SLA%, SLA vencido, aging médio), export CSV+PDF | Ranking de equipe duplica Ranking de Técnicos |
| 3 | Notificações & Alertas | `/erp/alertas` | Motor de regras configurável por gravidade (`equipe_parada`, `sem_equipe_4h`, `sla_crise`, `fila_alta`, `falha_cidade`, `aging_os`) + "Regras de Negócio" + faixa "OS por Cidade" + análise IA opcional | Único — é a fonte que já emite os mesmos sinais que a Central de Ação exibia |
| 4 | Produtividade por Equipe | `/erp/produtividade` | Grade equipe×dia **retroativa** (só concluídas), sparkline por equipe, delta semana atual vs anterior, IA de análise de quedas | Volume por equipe duplica Ranking/Relatórios/Planner |
| 5 | Ranking de Técnicos | `/erp/ranking` | Tabela por técnico: volume concluído, SLA%, críticas, taxa de retrabalho — edição inline de nome/contato | Retrabalho duplica Qualidade; falta execuções/tipo, fila, aging (só em Relatórios) |
| 6 | Qualidade — Revisitas | `/erp/qualidade` | Gráfico diário de revisitas, **ranking por equipe (retrabalho)**, clientes crônicos (3+ revisitas), causa-raiz manual+IA, taxa de primeira visita | Ranking por equipe duplica Ranking de Técnicos; causa-raiz/crônicos é único |
| 7 | Planner Semanal | `/erp/planner` | Grade equipe×7dias **futura** (todas OS agendadas), navegação por semana (offset), metas por equipe (edição gestor-only), cidades cobertas, IA de balanceamento | Volume por equipe duplica Produtividade/Relatórios/Ranking |
| 8 | Fila de Prioridade | `/erp/fila` | Fonte da verdade da fila ativa (já substituiu 2 filas antigas VT/SLA). 5 KPIs, painéis de carga por fornecedor/cidade, tendência de violação 7d | Único |

**Sobreposições identificadas:** urgência/SLA em 4 telas (Fila→Central Ação→Alertas→Relatórios); volume por equipe em 4 (Produtividade→Relatórios→Ranking→Planner); retrabalho/revisita em 2 (Ranking→Qualidade); carga por cidade em 3 (Fila→Planner→Central Ação).

**Validação da Central de Ação:** a Central de Ação parecia ser a única fonte de "o que precisa de atenção agora", mas o motor de `useAlertasEngine.ts` já dispara os mesmos sinais (`equipe_parada`, `sem_equipe_4h`, `sla_crise`) como alertas configuráveis com notificação Telegram — o dado não desaparece ao remover a tela, só perde a UX de lista única clicável dentro do app. Isso valida a decisão abaixo: a informação já existe em `/erp/alertas` (contínuo, fora do app) e no Dashboard (pontual, dentro do app), mesmo sem replicar o layout exato de lista priorizada.

**Restrições permanentes (herdadas da Onda 1/2, sem exceção):**
- Design sóbrio: tokens reais do `index.css`, Inter, cor apenas para status.
- Sem novas dependências de stack.
- `npm run build`, `npm run lint`, `npx tsc --noEmit` e **`npm run audit:ds`** limpos antes de qualquer commit — `audit:ds` ficou de fora das checagens da Onda 2 e um hex fora da baseline só foi pego pelo CI. Incluir nas checagens de toda task desta onda.

---

## 2. Decisões de escopo (aprovadas pelo usuário em 2026-07-18)

1. **Central de Ação removida.** Rota `/erp/acao` vira redirect para `/` (Dashboard — já cobre o pulso geral via Onda 2, e os sinais individuais de equipe-parada/sem-equipe seguem disponíveis em `/erp/alertas` + Telegram). Módulo de permissão `erp_acao` é removido.
2. **Produtividade + Planner fundidos** em `/erp/planner` (sobrevive esse nome/URL). Toggle **Executado / Planejado** no topo da tela, abre em **Executado** por padrão. Edição de metas (gestor-only) migra para o modo Planejado. `/erp/produtividade` vira redirect para `/erp/planner`. Módulo de permissão `erp_produtividade` é removido; `erp_planner` passa a cobrir os dois modos.
3. **Ranking de Técnicos consolidado como fonte única de desempenho por equipe.** Ganha as colunas hoje só em Relatórios (execuções por tipo, OS na fila, SLA vencido, aging médio). Relatórios perde a tabela de ranking (mantém KPIs/gráficos/export). Qualidade perde a seção "Ranking — Revisitas por Equipe" (mantém gráfico diário, causa-raiz e clientes crônicos, que são únicos).

**Resultado:** 8 telas ERP → 6. Módulos de permissão ERP: 8 → 6 (`erp_relatorios`, `erp_alertas`, `erp_planner`, `erp_qualidade`, `erp_fila`, `erp_ranking`).

**Pendente / fora desta spec:** se vale auditar sobreposição nos outros 3 grupos da sidebar (Operacional, Análise, Campo & Infra) fica para decisão futura — não bloqueia esta onda.

---

## 3. Arquitetura de rotas — antes → depois

| Rota | Hoje | Depois |
|---|---|---|
| `/erp/acao` | `CentralAcaoPage` | `<Navigate to="/" replace />` — mesmo padrão já usado por `/erp/vt → /erp/fila` e `/gerencial → /cidades` em `App.tsx:67,82` |
| `/erp/produtividade` | `ProdutividadePage` | `<Navigate to="/erp/planner" replace />` |
| `/erp/planner` | `PlannerPage` | `PlannerPage` fundida (Executado + Planejado) |
| `/erp/ranking` | `RankingTecnicosPage` (4 colunas) | `RankingTecnicosPage` consolidada (9 colunas) |
| `/erp/relatorios` | `RelatoriosPage` (KPIs+gráficos+ranking) | `RelatoriosPage` sem a tabela de ranking |
| `/erp/qualidade` | `QualidadePage` (revisitas+ranking) | `QualidadePage` sem a seção de ranking por equipe |
| `/erp/alertas` | sem mudança | sem mudança |
| `/erp/fila` | sem mudança | sem mudança |

Arquivos removidos: `src/features/erp/acao/CentralAcaoPage.tsx`, `src/features/erp/produtividade/ProdutividadePage.tsx` (conteúdo migra para dentro de `planner/`, não é descartado).

---

## 4. Design detalhado

### 4.1 Fusão Produtividade + Planner (`/erp/planner`)

As duas telas hoje têm fontes de dado e controles de navegação **incompatíveis** — não é um simples toggle de exibição:

| | Produtividade (Executado) | Planner (Planejado) |
|---|---|---|
| Dado | `useERPRows().rows` filtrado por `isConcluida` | `useERPRows().allRows` (todas as OS agendadas) |
| Range de dias | `dateFilter` global (from/to), até 31 colunas | navegação por semana (`weekOffset`), sempre 7 colunas |
| Interação de linha | expandir equipe → cards de dia → tabela inline de OS do dia | clique direto na célula → abre `PlannerDrillModal` |
| Exclusivo do modo | sparkline de barras por dia, "quedas >20%" + IA de causa/recomendação | metas por equipe (input gestor-only), % da meta, cidades cobertas, IA de balanceamento |

**Estrutura proposta:** um componente-casca `PlannerPage.tsx` com:
- Toggle segmentado no header (`Executado` / `Planejado`), estado local (`useState`, não persistido — mesma decisão que `PulsoHero` da Onda 2 não persiste estado de UI transitório).
- Cada modo renderiza seu próprio bloco de controle de navegação (range picker do filtro global para Executado; setas de semana + "Hoje" para Planejado) — não faz sentido forçar um controle único, os modos navegam eixos de tempo diferentes (histórico vs futuro).
- KPI strip trocam de conjunto conforme o modo (Executado: Executadas/Melhoraram/Pior queda/Líder; Planejado: OS na semana/Equipes ativas/Equipes sem OS/Cidades cobertas) — sem tentar unificar em 4 KPIs genéricos, perderia sinal.
- Grade principal (tabela equipe×dias) é o elemento visualmente compartilhado — mesma estrutura de tabela, células e header trocam de comportamento (drill inline expansível vs modal de clique).
- Bloco de IA no rodapé troca de conteúdo (análise de quedas vs sugestão de balanceamento) mas mantém o mesmo padrão visual (`Sparkles` + botão "Analisar com IA" + card de resultado).
- Renomear arquivos: `ProdutividadePage.tsx` conteúdo vira `PlannerExecutadoView.tsx`, `PlannerPage.tsx` atual vira `PlannerPlanejadoView.tsx`, novo `PlannerPage.tsx` é a casca com o toggle. `PlannerComponents.tsx` (helpers hoje só do modo Planejado) permanece, ganha equivalentes do modo Executado que hoje vivem inline em `ProdutividadePage.tsx` (`buildProdutividade`, `getDayLabelsFromRange`, `TeamRow`, `OSInlineTable`).

**Decisão de implementação (plano decide o resto):** usar tabs/toggle simples, não rota separada (`/erp/planner?modo=executado`) — mantém a URL estável e evita adicionar lógica de query param só para isso. Se o usuário quiser voltar ao modo depois de navegar para outra tela, o padrão (Executado) é aceitável — não é um estado que precise sobreviver à navegação.

### 4.2 Consolidação do Ranking de Técnicos (`/erp/ranking`)

Colunas atuais: Técnico, Volume concluído, SLA, Críticas, Retrabalho.

Colunas novas (vindas de Relatórios): Exec. Instalação, Exec. Manutenção, Exec. Serviço, OS na Fila, SLA Vencido, Aging Médio.

**Atenção a uma diferença de granularidade:** `RankingTecnicosPage` hoje agrupa por `nomedaequipe` completo (via `shortEquipe`), enquanto `RelatoriosPage.ranking` agrupa por `code` (prefixo antes do primeiro ` - `, cruzado com um array `TEAMS` fixo de líder/tipo) e inclui `leader`/`tipo` que não existem na página de Ranking hoje. O plano de implementação precisa decidir: (a) adotar o agrupamento por `code` da Relatórios (mais rico, mas perde técnicos fora do array `TEAMS`), ou (b) manter agrupamento por nome completo da Ranking e apenas somar as métricas novas nesse nível. Como Ranking já é a fonte de verdade de todos os técnicos (inclusive os sem SLA/retrabalho calculado), a opção (b) é a que preserva cobertura total — o plano deve validar contra o array `TEAMS` de `RelatoriosPage.tsx` se ele ainda é necessário ou se pode ser descartado.

`RelatoriosPage.tsx` perde a seção "Ranking de Equipes" (linhas ~455-610) e a função `handleExportRanking` / uso de `ranking` em `printRelatoriosPDF` precisa ser revisto — os KPIs consolidados (`totals`) que hoje derivam de `ranking` continuam sendo necessários para a seção "Produção Consolidada", então o cálculo de `ranking` como estrutura interna (não a tabela visual) pode continuar existindo em `RelatoriosPage`, só a `<table>` de exibição some.

`QualidadePage.tsx` perde a seção "Ranking — Revisitas por Equipe" (linhas ~463-510, variável `rankingEquipe`) — a taxa de revisita por equipe já aparece em `RankingTecnicosPage` via `derived.revisitas.porEquipe`, mesma fonte.

### 4.3 Remoção da Central de Ação (`/erp/acao`)

Página inteira (`CentralAcaoPage.tsx`) é removida, não migrada — seu conteúdo é 100% agregação de dado que já vive em outros lugares (ver §1, validação). Referências a remover:
- `src/pages/index.ts`: export `ERPCentralAcaoPage`
- `src/App.tsx:69`: rota `acao`, troca por redirect
- `src/components/layout/Sidebar.tsx:49`: item "Central de Ação"
- `src/lib/modulos.ts:22`: entrada `erp_acao`
- `cabonnet/db.py`: `erp_acao` em `ALL_MODULOS` e `_DEFAULT_OPERADOR_MODULOS`

### 4.4 Migração de permissões (papel, não usuário individual)

Confirmado lendo `cabonnet/db.py`: permissões são por **papel** (`role_permissoes(role, modulo)`), não por usuário individual — `gestor` sempre tem acesso total (fixo). Isso simplifica a migração: não é preciso tocar em nenhuma linha de usuário, só nas listas de módulo e nos dados existentes de `role_permissoes` para `operador`/`viewer`.

**Mudanças em `cabonnet/db.py`:**
```python
ALL_MODULOS = [
    "dashboard", "ordens", "graficos", "cidades", "fornecedor", "juniper",
    "fechamento", "mapa", "noc",
    "erp_relatorios", "erp_alertas", "erp_qualidade",
    "erp_planner", "erp_fila", "erp_ranking",
]  # remove erp_produtividade, erp_acao

_DEFAULT_OPERADOR_MODULOS = [
    "dashboard", "ordens", "cidades", "mapa", "juniper",
    "erp_relatorios", "erp_alertas", "erp_qualidade",
    "erp_planner", "erp_fila", "erp_ranking",
]
```

**Migração de dados existentes (rodar uma vez no startup, idempotente):** para cada `role` em `role_permissoes`, se tinha `erp_produtividade` → garantir `erp_planner` presente; se tinha `erp_acao` → garantir `dashboard` presente; depois `DELETE FROM role_permissoes WHERE modulo IN ('erp_produtividade','erp_acao')`. Como a tabela já é pequena (2 papéis configuráveis) e `_db_set_permissoes` já faz `DELETE + INSERT` por papel, a forma mais simples é rodar essa migração uma vez em `_db_init()` guardada por uma verificação (`SELECT 1 FROM role_permissoes WHERE modulo IN (...)`) antes de aplicar — o plano de implementação detalha o SQL exato.

**Frontend:** `src/lib/modulos.ts` remove as 2 entradas (`erp_produtividade`, `erp_acao`). Qualquer `RequireModulo modulo="erp_produtividade"` ou `"erp_acao"` no `App.tsx` é substituído pelos redirects do §3 (sem `RequireModulo` no redirect, já que a rota de destino tem sua própria checagem).

### 4.5 Sidebar (`src/components/layout/Sidebar.tsx`)

Remove os itens "Central de Ação" (linha 49) e "Produtividade" (linha 52). "Planner" (linha 55) permanece como único item que cobre os dois modos — não precisa de label nova, o toggle interno já comunica o modo. Reordenação de posição na sidebar fica para a Onda 3b (depende da lista final de telas).

---

## 5. Fora de escopo (fica para depois)

- Reorganização da sidebar por fluxo de trabalho — Onda 3b, depende do resultado desta onda.
- Upgrade do command palette — Onda 3c.
- Auditoria de sobreposição nos outros 3 grupos (Operacional, Análise, Campo & Infra) — não decidido ainda se vale a pena.
- Qualquer redesign visual das 6 telas ERP restantes além das mudanças estruturais aqui descritas — reaproveitam o design system das Ondas 1/2 como já fazem hoje.
- Migração de permissão por usuário individual — não existe nesse app (permissão é por papel), então não há N usuários para migrar, só 2 papéis configuráveis.
