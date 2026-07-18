# Redesign Enterprise — Onda 3b: Sidebar por Fluxo de Trabalho (Design)

**Data:** 2026-07-18
**Status:** Aprovado pelo usuário
**Escopo deste documento:** design da Onda 3b do redesign enterprise — reorganização dos grupos de navegação da sidebar (`src/components/layout/Sidebar.tsx`), trocando o critério de agrupamento de "categoria técnica" para "frequência/urgência de uso". Continuação de `2026-07-18-onda3a-fusoes-erp-design.md` (Onda 3a reduziu o grupo ERP de 8 para 6 telas — pré-requisito explícito desta onda, conforme `docs/superpowers/specs/2026-07-15-redesign-enterprise-onda1-fundacao-design.md` §3: "Sidebar por fluxo de trabalho... Decidir *o que existe* antes de redesenhar tela a tela").

---

## 1. Contexto

A sidebar hoje agrupa as 15 telas + Usuários em 4 grupos técnicos: **ERP** (Relatórios, Alertas, Ranking Técnicos, Qualidade, Planner, Fila de Prioridade), **Operacional** (Dashboard, Cidades, Mapa, Ordens), **Análise** (Gráficos, Fechamento), **Campo & Infra** (Fornecedor, Juniper, NOC). Essa categorização reflete como o sistema foi construído (módulo ERP vs. núcleo do app), não como o usuário decide o que abrir primeiro no dia.

**Decisão aprovada:** trocar o critério de agrupamento para frequência/urgência de uso — "o que precisa de atenção agora" → "o que eu opero no dia a dia" → "o que eu analiso com menos frequência" → "infraestrutura/config, uso esporádico". Nenhuma tela é fundida, removida ou tem rota alterada nesta onda — é puramente uma reorganização de `baseGroups`, o array de configuração da sidebar.

**Fora de escopo (decidido com o usuário):**
- Auditoria de sobreposição de conteúdo entre telas dos grupos Operacional/Análise/Campo & Infra — ponto que ficou em aberto ao final da Onda 3a, decidido agora como **não incluído** nesta onda. Se houver sobreposição real, é uma decisão futura separada.
- Upgrade do command palette (busca do header, hoje só filtro de OS/cliente) — Onda 3c, roadmap original da Onda 1 §3.

---

## 2. Decisões de escopo (resolvidas com o usuário)

1. **Estrutura:** 4 grupos (mesma quantidade de hoje), critério trocado de categoria técnica para urgência/frequência — preserva a "forma" familiar da sidebar, só muda a lógica por trás.
2. **Cores dos grupos:** as 4 cores já em uso (`#c4b5fd`, `#22d3ee`, `#4ade80`, `#fb923c`) são reaproveitadas, só reatribuídas a outros grupos — nenhum hex novo, nenhuma entrada nova na baseline do `audit:ds`.
3. **"Usuários" (item só-gestor):** entra no grupo **INFRA & CAMPO**, junto de Fornecedor/Juniper/NOC — grupo com perfil de "configuração/sistema", onde administração de acesso encaixa semanticamente melhor do que nos outros 3.

---

## 3. Mapeamento final — grupo → telas → cor

| Grupo | `key` | Cor | Telas (ordem de exibição) |
|---|---|---|---|
| **AGORA** | `agora` | `#c4b5fd` (era `erp`) | Dashboard, Fila de Prioridade, Alertas |
| **OPERAR** | `operar` | `#22d3ee` (era `ops`) | Ordens, Planner, Mapa |
| **ANALISAR** | `analisar` | `#4ade80` (era `anal`) | Cidades, Ranking Técnicos, Qualidade, Relatórios, Gráficos, Fechamento |
| **INFRA & CAMPO** | `infra` | `#fb923c` (inalterado) | Fornecedor, Juniper, NOC, Usuários *(só gestor, acrescentado em runtime como hoje)* |

**Racional de cada tela:**
- **Dashboard, Fila de Prioridade, Alertas → AGORA**: as 3 respondem "o que precisa de atenção agora" — pulso geral, fila urgente/violada, motor de regras/notificações. É o mesmo papel que a extinta Central de Ação (Onda 3a) tentava cobrir com uma lista unificada; aqui a resposta é agrupar as fontes desse sinal na sidebar, não redigerir dado.
- **Ordens, Planner, Mapa → OPERAR**: trabalho operacional do dia a dia — lista de OS, execução/planejamento por equipe, geolocalização.
- **Cidades, Ranking Técnicos, Qualidade, Relatórios, Gráficos, Fechamento → ANALISAR**: análise e relatórios de menor frequência de consulta — desempenho por cidade/equipe/técnico, séries históricas, fechamento mensal.
- **Fornecedor, Juniper, NOC, Usuários → INFRA & CAMPO**: monitoramento técnico (PPPoE/Juniper, SLA de fornecedor, modo NOC full-screen) e administração de sistema (Usuários) — público mais restrito, uso esporádico.

---

## 4. O que muda vs. o que não muda

**Muda (único arquivo tocado):**
- `src/components/layout/Sidebar.tsx:45-81` — o array `baseGroups`: `key`, `label` e `color` de 3 dos 4 grupos (o 4º, `infra`, já mapeia 1:1 e não muda), e a distribuição dos `links` entre eles.

**Não muda:**
- Nenhuma rota (`App.tsx`), nenhum módulo de permissão (`src/lib/modulos.ts`, `cabonnet/db.py`), nenhuma tela.
- Ícone de cada link individual — representa a tela, não o grupo, continua o mesmo (`LayoutDashboard`, `Siren`, `Bell`, `ClipboardList`, etc.).
- A lógica de filtragem por papel (`podeVer`/`rotaParaModulo` em `Sidebar.tsx:164-181`) — grupos que ficam sem nenhum link visível pro papel continuam somem automaticamente; nenhuma mudança de código nessa parte, só o conteúdo de `baseGroups` que ela filtra.
- O padrão visual do cabeçalho de grupo (barra colorida de 3px + label uppercase) e do tooltip em modo colapsado — nenhum componente novo, nenhuma dependência nova.
- `NavItem`, `NavLinkDef`, `NavGroup` (interfaces e componente) — inalterados, só os dados que os alimentam mudam.

---

## 5. Fora de escopo (fica para depois)

- Auditoria de sobreposição de conteúdo entre telas — decidido explicitamente fora desta onda (§1).
- Upgrade do command palette — Onda 3c.
- Qualquer mudança de ícone, cor de status (SLA/críticos), ou redesign visual de tela individual — nenhuma tela muda, só a organização da sidebar que aponta pra elas.
