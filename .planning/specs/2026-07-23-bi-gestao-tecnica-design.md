# Design: Menu "BI-Gestão Técnica" (Painel + Revisitas) portado do i-Manager

**Data:** 2026-07-23
**Status:** Aprovado para plano de implementação

## Contexto

O i-Manager Gerencial (`https://imanagergerencialcentral.cabonnet.com.br/`) é a ferramenta de BI própria da Interfocus (não é Power BI — não tem API de exportação). Ela expõe 3 painéis grandes em "Relatórios → TECNICA": **BI-Gestão Técnica** (20 abas), **BI-Backlog** e **BI-Monitor OS**. O pedido é portar esses painéis pro Cabonnet React, filtrados às 5 cidades do Vale do Paraíba.

Dado o tamanho (3 painéis, dezenas de abas ao todo), este documento cobre **só a primeira fatia**: o painel **BI-Gestão Técnica**, e dentro dele só o subconjunto priorizado nesta rodada — Painel principal e as 3 abas de Revisita. BI-Backlog e BI-Monitor OS ficam para specs futuras.

### Achado crítico: Materiais está bloqueado por permissão

A aba "Materiais (Utilizado/Retirado/Rede)" foi cogitada para esta entrega, mas testando acesso real (não só introspecção `pg_catalog`) contra o Grafana:

```
mobile.vis_os_materiais_utilizados               → permission denied for schema mobile
mobile.vis_os_materiais_utilizados_por_servicos  → permission denied for schema mobile
public.materiaisos                               → permission denied for table materiaisos
public.materiaisosretirada                       → permission denied for table materiaisosretirada
```

Isso repete o mesmo bloqueio já documentado em `.planning/specs/2026-06-19-os-fotos-checklist-mapa-execucao-design.md` (schema `mobile` inteiro negado pra credencial do `GRAFANA_USER`). Reconfirmado agora: **o GRANT pedido naquele spec, para `mobile.vis_os_fotos`/`vis_os_checklist_status`/`vis_os_ocorrencias`, nunca foi aplicado** — mais de um mês depois, continua tudo bloqueado.

**Decisão:** Materiais fica **fora desta entrega**, sem código novo. Só volta a ser viável depois de um GRANT do DBA/Interfocus (ver seção "Pré-requisito de infraestrutura pendente" abaixo). Quando isso acontecer, uma spec própria cobre as 3 abas de Materiais.

### Achado favorável: nada disso precisa de endpoint novo

Todo o escopo desta entrega (Painel + Revisitas) é derivável de dados que **já chegam** no frontend hoje:

- `OSDataContext` já carrega `allRows` com histórico desde `2025-11-01` (a query SQL não tem corte pelo filtro de data da UI — esse filtro é aplicado depois, no client, via `applyDateFilter`). Dá pra montar o gráfico "Total de OS por Mês" multi-mês sem nova chamada de rede.
- `/backlog` (`cabonnet/app.py:838`, já em produção, usado por `QualidadePage.tsx` via `useBacklog`) já retorna `rev_inst`/`rev_manut`/`rev_serv` por linha e agregados por equipe/cidade — exatamente o dado das 3 abas de Revisita do iManager. Roda 100% sobre `public.ordemservico`/`contratos`, schema já liberado (é o mesmo caminho que o resto do app usa).

Ou seja: esta entrega é **puramente frontend** — nenhum endpoint novo em `cabonnet_server.py`, nenhuma query SQL nova em `grafana.py`.

## Escopo desta entrega

| Aba (nome iManager) | Fonte de dado | Endpoint | Novo? |
|---|---|---|---|
| Painel (KPIs + gráfico mensal) | `allRows` (OSDataContext) | `/query` (já existente) | Novo builder client-side |
| Revisita Instalação | `useBacklog` | `/backlog` (já existente) | Nova tela, filtro `tipo=instalacao` |
| Revisita Serviço | `useBacklog` | `/backlog` (já existente) | Nova tela, filtro `tipo=servico` |
| Revisita Manutenção | `useBacklog` | `/backlog` (já existente) | Nova tela, filtro `tipo=manutencao` |
| Materiais (Utilizado/Retirado/Rede) | — | — | **Fora de escopo** (bloqueado, ver acima) |

### Painel — KPIs incluídos nesta rodada

Vistos no iManager e **viáveis** com dado já disponível:

- Total Manutenção / Total Instalação / Total Serviço / Total OS Geral (contagem por `_tipo`)
- Total de OS por Mês (gráfico de barras, últimos ~7 meses, 3 séries: Instalação/Manutenção/Serviço)
- Médias Dias para Execução por tipo (reaproveita lógica de MTTR já existente em `_helpers.ts`)
- Cumprimento de Agenda por tipo (%) — nova métrica, mas 100% sobre campos já carregados (`datacadastro`/`dataagendamento`/`dataexecucao`/`_tipo`). Definição proposta: `OS executadas com dataexecucao <= dataagendamento` ÷ `total de OS agendadas do tipo, no período`. Validar esse critério contra os números do iManager (mesmo filtro/período) antes de fechar o plano — se não bater, ajustar a fórmula é tarefa do plano, não motivo para travar a spec.
- Taxa Manutenção (%) — `Total Manutenção / Total OS Geral`
- Revisita Instalação/Serviço/Manutenção (%) — mesma fonte do `/backlog`, só que como percentual em vez de contagem absoluta

### Painel — KPIs adiados (fase 2, pendência de definição)

- **VT3H / VT24H / VT4H** (cumprimento de prazo) — não existe campo equivalente no banco nem na nossa lógica atual de VT (`getVtPrazoHoras` só conhece VT08H/24H/48H). Precisa de uma sessão de descoberta própria antes de implementar — não é bloqueio de permissão, é falta de definição.
- **Retirada Eq. 1º Mês / Safra 2 Meses** — depende de `materiaisosretirada`, que está bloqueado junto com Materiais. Naturalmente cai na mesma pendência.

## Arquitetura

```
OSDataContext (já existe)
  │  allRows (histórico desde 2025-11-01, sem filtro de data aplicado)
  ▼
src/lib/builders/biGestaoTecnica.ts   (NOVO — client-side, sem rede)
  │  KPIs do Painel + série mensal
  ▼
src/features/erp/biGestaoTecnica/BiGestaoTecnicaPage.tsx   (NOVO)
  ├─ aba Painel
  ├─ aba Revisita Instalação   ─┐
  ├─ aba Revisita Serviço       ├─ useBacklog(inicio, fim)  (já existe, mesmo hook do QualidadePage)
  └─ aba Revisita Manutenção   ─┘
```

## Frontend

### 1. `src/lib/builders/biGestaoTecnica.ts` (novo)

Função `buildBiGestaoTecnicaPainel(allRows: OSRow[], dateFilter)`, retornando:

```ts
interface BiGestaoTecnicaPainel {
  totalManutencao: number
  totalInstalacao: number
  totalServico: number
  totalGeral: number
  taxaManutencaoPct: number
  ostPorMes: { mes: string; instalacao: number; manutencao: number; servico: number }[]
  mediaDiasExecucao: { instalacao: number; manutencao: number; servico: number }
  cumprimentoAgendaPct: { instalacao: number; manutencao: number; servico: number }
}
```

Segue o padrão dos demais arquivos em `src/lib/builders/` (puro, testável com Vitest, sem I/O). Filtra por `_tipo` e pelas 5 cidades (já garantido — `enrichRows`/`OSDataContext` só processam essas cidades, conforme regra do projeto).

### 2. `BiGestaoTecnicaPage.tsx` (novo, em `src/features/erp/biGestaoTecnica/`)

Segue o padrão de abas já usado em outras páginas ERP (ex.: `AlertasPage.tsx`, `PlannerPage`). 4 abas: Painel, Revisita Instalação, Revisita Serviço, Revisita Manutenção.

- **Painel:** StatCards (reutiliza `StatCard` de `components/ui`) + gráfico de barras mensal (reutiliza `BarChart` de `components/ui/bar-chart`, mesmo padrão do `QualidadePage`).
- **Revisita {Tipo}:** reaproveita `useBacklog(inicio, fim)` já usado no Qualidade, filtrando client-side por `tipoAtivo = 'instalacao' | 'manutencao' | 'servico'` (mesma lógica de `contagens`/`revisitasFiltradas` já implementada em `QualidadePage.tsx:135-148` — extrair para um hook/helper compartilhado em vez de duplicar, já que agora tem 2 consumidores).

### 3. Navegação

Novo item de menu **"BI-Gestão Técnica"** em `src/components/layout/Sidebar.tsx` e rota em `src/pages/index.jsx` (lazy-loaded, como as demais). Path sugerido: `/erp/bi-gestao-tecnica`.

## Refactor pontual (justificado pelo reuso)

`QualidadePage.tsx` tem a lógica de filtro por tipo (`contagens`, `revisitasFiltradas`, breakdown por cidade) inline no componente. Com a nova página consumindo a mesma fonte (`useBacklog`) do mesmo jeito, essa lógica deveria virar um hook compartilhado (ex.: `useRevisitaPorTipo(data, tipo)`) usado pelos dois lugares — evita duas implementações da mesma regra divergindo com o tempo. Isso é um refactor pequeno e direto, feito como parte desta entrega (não é escopo extra, é manutenção do único ponto de verdade que a régua de `_helpers.ts` já pratica em outros builders).

## Pré-requisito de infraestrutura pendente (fora do código)

Ação do DBA/fornecedor Interfocus — **acumulando dois pedidos agora**:

```sql
GRANT USAGE ON SCHEMA mobile TO <usuário GRAFANA_USER>;
GRANT SELECT ON
  mobile.vis_os_ocorrencias,
  mobile.vis_os_materiais_utilizados,
  mobile.vis_os_materiais_utilizados_por_servicos,
  mobile.vis_os_materiais_retirados,
  mobile.vis_os_fotos,
  mobile.vis_os_checklist_status,
  mobile.vis_os_motivosinconclusivos,
  mobile.vis_os_ordemservico
TO <usuário GRAFANA_USER>;

GRANT SELECT ON public.materiaisos, public.materiaisosretirada TO <usuário GRAFANA_USER>;
```

Sem isso: Materiais (esta spec) e Fotos/Checklist/Ocorrências (spec de 19/06) continuam bloqueados indefinidamente.

## Testes

- **Vitest:** `biGestaoTecnica.test.ts` cobrindo `buildBiGestaoTecnicaPainel` — contagens por tipo, série mensal, cumprimento de agenda, com casos de borda (mês sem OS, tipo ausente).
- **Vitest:** hook compartilhado `useRevisitaPorTipo` testado isoladamente (extração do que já é testado indiretamente hoje via `QualidadePage`).
- Sem testes de backend — não há código Python novo nesta entrega.

## Fora de escopo (decisões explícitas)

- Materiais (Utilizado/Retirado/Rede) — bloqueado por permissão, ver acima.
- VT3H/VT24H/VT4H e Retirada de Equipamento no Painel — sem definição/fonte de dado ainda; fase 2.
- BI-Backlog e BI-Monitor OS (os outros 2 painéis do iManager) — specs próprias, futuras.
- Coluna "Praça" vista na aba Material Rede do iManager — não existe no banco; investigar só quando Materiais for desbloqueado.
