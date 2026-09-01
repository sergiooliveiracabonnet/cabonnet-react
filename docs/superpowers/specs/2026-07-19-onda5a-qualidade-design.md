# Redesign Enterprise — Onda 5a: Qualidade (Design)

**Data:** 2026-07-19
**Status:** Aprovado pelo usuário
**Escopo deste documento:** design da Onda 5a — primeira sub-onda de "Onda 5: ERP analíticos" (`docs/superpowers/specs/2026-07-15-redesign-enterprise-onda1-fundacao-design.md` §3), decomposta em sub-ondas de uma tela cada (5a Qualidade, 5b Ranking, 5c Relatórios, 5d Planner, 5e Alertas — ordem e escopo das seguintes a decidir quando chegar a vez). Escopo desta sub-onda: `src/features/erp/qualidade/QualidadePage.tsx` — adoção do `PageHeader` (já usado em Ordens/Fila, Onda 4) e extração de um `SectionLabel` canônico (hoje duplicado 3× no repo, nunca usado em Qualidade).

---

## 1. Contexto

Onda 1 original listava "ERP analíticos: Produtividade, Qualidade, Ranking, Relatórios, Planner, Central de Ação, Alertas" como Onda 5. A Onda 3a já removeu Central de Ação e fundiu Produtividade em Planner (toggle) — sobraram 5 telas candidatas (Qualidade, Ranking, Relatórios, Planner, Alertas), ~2700 linhas ao todo, grande demais pra um ciclo único de spec→plano→implementação. Decisão: quebrar em 5 sub-ondas de uma tela cada, começando por Qualidade (a maior, 532 linhas).

`QualidadePage.tsx` já segue a linguagem sóbria nos componentes internos (`StatCard` com `tone`, `TIPO_COLOR`/`TIPO_LABEL` como taxonomia cross-screen já estabelecida — ver `[[project_onda3c_command_palette]]`/Onda 3c pra outro exemplo do mesmo tipo de auditoria "reorganização, não reskin"). Dois achados nesta auditoria:

1. **Cabeçalho artesanal**: `<h1>+<p>` + controles de período (preset Mês Atual/Anterior/Personalizado + datas + botão Atualizar) tudo numa única linha `flex items-start justify-between`, sem usar `PageHeader`.
2. **`SectionLabel` duplicado 3× no repo, Qualidade não usa nenhuma cópia**: `src/features/dashboard/DashboardKpiPrimitives.tsx`, `src/features/erp/alertas/AlertasComponents.tsx`, e uma redefinição local dentro de `src/features/erp/planner/PlannerExecutadoView.tsx` — as 3 compartilham a mesma assinatura de props (`{ icon, color, children }` → barra colorida + ícone + rótulo uppercase), mas **não têm a mesma forma visual**: `DashboardKpiPrimitives.tsx` usa barra `h-3.5`, ícone neutro (`text-muted`, sem cor) e `<h2>` com texto neutro (`text-secondary`); `AlertasComponents.tsx` e `PlannerExecutadoView.tsx` (idênticas entre si) usam barra `h-4`, ícone colorido (`style={{ color }}`) e `<span>` com texto colorido (`style={{ color }}`, `font-bold`, `tracking-[0.07em]`). `QualidadePage.tsx` reimplementa inline 6× um padrão parecido com o de Alertas/Planner (4 das 6 seções colorem ícone e texto, não só a barra) — mais próximo dessas duas telas do que do Dashboard.

**Grid de KPIs sem breakpoint intermediário**: `grid-cols-2 lg:grid-cols-5` (linha 327) pula direto de 2 pra 5 colunas, sem `md:`, mesmo problema já corrigido na Fila (Onda 4) — fica 2 colunas até 1024px.

**Restrições permanentes (herdadas das ondas anteriores, sem exceção):**
- Design sóbrio: tokens reais do `index.css`, Inter, cor só pra status/taxonomia já estabelecida — `TIPO_COLOR` não muda.
- Sem novas dependências de stack.
- `npm run build`, `npm run lint`, `npm run audit:ds`, `npx tsc --noEmit`, `npm test` limpos antes de qualquer commit.
- Nenhuma mudança de rota, permissão, dado ou lógica de negócio — só reorganização de UI + extração de componente compartilhado.

---

## 2. Decisões de escopo (resolvidas com o usuário)

1. **Decomposição da Onda 5**: 5 sub-ondas sequenciais, uma tela por vez. Esta sub-onda (5a) cobre só Qualidade.
2. **`SectionLabel` canônico**: criar `src/components/ui/SectionLabel.tsx` agora, na forma do `DashboardKpiPrimitives.tsx` (a única das 3 cópias com texto neutro — ver correção abaixo), Qualidade passa a usá-lo nas 6 seções. **Não mexe** em `DashboardKpiPrimitives.tsx`, `AlertasComponents.tsx`, ou `PlannerExecutadoView.tsx` — essas continuam com suas cópias locais por enquanto; a consolidação delas fica pra quando as sub-ondas 5d (Planner)/5e (Alertas) chegarem, ou uma limpeza dedicada futura. Como as 3 cópias hoje têm formas diferentes entre si (§1), migrar Alertas/Planner pra essa versão canônica no futuro vai mudar a aparência delas (perdem cor no ícone/texto) — decisão explícita a tomar quando essas sub-ondas chegarem, não implícita nesta.
3. **Texto neutro** (decisão corrigida em 2026-07-19, ver nota abaixo): adotar o padrão do `DashboardKpiPrimitives.tsx` onde só a barra+ícone carregam cor, texto fica `text-secondary`. **Correção**: a justificativa original dizia "consistência com Dashboard/Alertas/Planner que já usam esse padrão" — isso está errado, só o Dashboard usa texto neutro; Alertas e Planner usam texto colorido (mais parecido com o padrão atual de Qualidade). Levada a decisão de volta ao usuário com a informação correta (achado do revisor da Task 1) — mantida a escolha de texto neutro, agora pelo mesmo raciocínio da Onda 4 (título de Ordens perdeu `font-headline` ao adotar `PageHeader`, consequência aceita de unificar num componente compartilhado), não por "consenso" entre as 3 telas.
4. **Cabeçalho**: `PageHeader` só com `title`+`description` (sem `actions` — não há botão de exportar/notificar nesta tela). Controles de período (preset + datas + Atualizar) saem da linha do título e viram uma linha própria abaixo, mesmo JSX de hoje.
5. **Grid de KPIs**: ganha o breakpoint `md:grid-cols-3` que falta, mesmo fix já aplicado à Fila na Onda 4.

---

## 3. Mudanças

### 3.1 `src/components/ui/SectionLabel.tsx` (novo)

```tsx
import type { ComponentType, ReactNode } from 'react'

export interface SectionLabelProps {
  icon:  ComponentType<{ size?: number; className?: string }>
  color: string
  children: ReactNode
}

export function SectionLabel({ icon: Icon, color, children }: SectionLabelProps) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[3px] h-3.5 rounded-full flex-shrink-0" style={{ background: color }} />
      <Icon size={12} className="flex-shrink-0 text-muted" />
      <h2 className="text-caption font-semibold uppercase tracking-[0.09em] text-secondary m-0">
        {children}
      </h2>
    </div>
  )
}
```

Cópia exata da forma já usada em `DashboardKpiPrimitives.tsx`/`AlertasComponents.tsx`/`PlannerExecutadoView.tsx` (mesmas classes, mesmo `h-3.5`/`w-[3px]`, mesmo `tracking-[0.09em]`), só relocada pra `components/ui/` como fonte única pra novos consumidores. Nenhuma das 3 cópias existentes é removida ou alterada nesta sub-onda.

### 3.2 `QualidadePage.tsx` — cabeçalho e KPIs

- Substitui o bloco `<div className="flex items-start justify-between gap-4 flex-wrap">...</div>` (linhas 198-236) por:
  - `<PageHeader title="Qualidade — Revisitas" description="Clientes que abriram nova OS após atendimento recente · instalação · manutenção · serviço" />`
  - Logo abaixo, uma linha própria com os controles de período (preset Mês Atual/Anterior/Personalizado, inputs de data quando `custom`, botão Atualizar) — mesmo JSX interno de hoje, só fora da linha do título.
- Grid de KPIs (linha 327: `<div className="grid grid-cols-2 lg:grid-cols-5 gap-3">`) vira `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3` — mesmos 5 `StatCard`, sem adição/remoção.

### 3.3 `QualidadePage.tsx` — as 6 seções passam a usar `SectionLabel`

Cada bloco `<div className="flex items-center gap-2.5">...</div>` (barra + ícone opcional + `<span>` de texto colorido/neutro) vira `<SectionLabel icon={...} color={...}>texto</SectionLabel>`. Mapeamento exato (cor = cor da **barra** no original, escolhida como a cor primária quando barra e ícone/texto do original divergiam):

| Seção (linha original) | Ícone novo/mantido | `color` |
|---|---|---|
| "Acompanhamento Diário — Instalação vs Manutenção" (270-276) | `Activity` (novo — nenhuma seção tinha ícone aqui; escolhido por analogia com `QualidadePeriodoCard` do Dashboard, que já usa `Activity` pra um card de estatísticas do período) | `#a78bfa` (era `bg-violet-400`) |
| "Principais Ocorrências — clique para ver as OS" (352-357) | `BarChart3` (novo — mesmo ícone usado pelo Dashboard em seções de composição/ranking por barra, ex. `ParetoServicoPanel`) | `cor` (variável já existente = `TIPO_COLOR[tipoAtivo]`, dinâmica — **não** vira hex fixo) |
| "Por Cidade" (441-446) | `MapPin` (já usado) | `#22d3ee` (era `bg-cyan-400`/`text-cyan-400`, já consistentes) |
| "Crônicos — 2+ revisitas" (471-476) | `AlertTriangle` (já usado) | `#f87171` (era `bg-red-400`/`text-red-400`, já consistentes) |
| "Causa Raiz Registrada pelo Time" (506-511) | `ClipboardCheck` (já usado) | `#2dd4bf` (era `bg-teal-400`/`text-teal-400`, já consistentes) |
| "Causa Raiz de Revisitas (IA, inferida das observações)" (518-523) | `Sparkles` (já usado) | `#8b5cf6` (era `bg-violet-500` na barra — **não** `#a78bfa`/`text-violet-400` que estava no ícone/texto original; a barra e o texto já divergiam no código atual, resolvido a favor da cor da barra) |

`Activity` e `BarChart3` precisam ser adicionados ao import de `lucide-react` no topo do arquivo (os outros 4 ícones já estão importados).

---

## 4. Fora do escopo desta implementação

- Migrar `DashboardKpiPrimitives.tsx`/`AlertasComponents.tsx`/`PlannerExecutadoView.tsx` pra importar o novo `SectionLabel` canônico — fica pra quando as ondas 5d/5e chegarem, ou uma limpeza dedicada.
- Qualquer redesign funcional (gráficos, drill-down, causa raiz IA/manual, filtros de tipo, tabela de crônicos/cidades) — só cabeçalho e rótulos de seção mudam.
- Qualquer mudança de rota, permissão ou lógica de dados/negócio.
- Escopo/ordem das sub-ondas 5b-5e — a decidir quando cada uma começar.

---

## 5. Testes

- **`src/components/ui/SectionLabel.tsx`**: componente puro e trivial (mesmo padrão de `PageHeader.tsx`, que tem `PageHeader.test.tsx` com testes de renderização básica — título, descrição opcional, ações opcionais). Teste equivalente: renderiza com `icon`+`color`+`children`, confirma que o texto aparece e que a cor é aplicada ao elemento certo (barra/ícone, não ao texto).
- Suíte completa (`npm test`) deve continuar 100% verde — nenhuma mudança de comportamento esperada em `QualidadePage.tsx` (só JSX/props, nenhum dado/cálculo muda).
- Verificação manual no navegador: cabeçalho (título+descrição no `PageHeader`, controles de período numa linha própria abaixo), grid de KPIs responsivo em 3 larguras (375px/768px/1440px), as 6 seções com barra+ícone coloridos e texto neutro, cores batendo com a tabela do §3.3.

---

## 6. Arquivos afetados

- `src/components/ui/SectionLabel.tsx` (novo) — componente `SectionLabel`.
- `src/components/ui/SectionLabel.test.tsx` (novo) — teste de renderização básica.
- `src/features/erp/qualidade/QualidadePage.tsx` — adota `PageHeader`, `SectionLabel` nas 6 seções, grid de KPIs responsivo.
