# Redesign Enterprise — Onda 5d: Planner de Equipes (Design)

**Data:** 2026-07-19
**Status:** Aprovado pelo usuário
**Escopo deste documento:** design da Onda 5d — quarta sub-onda de "Onda 5: ERP analíticos" (`docs/superpowers/specs/2026-07-15-redesign-enterprise-onda1-fundacao-design.md` §3, decomposta em 5 sub-ondas de uma tela cada — ver `docs/superpowers/specs/2026-07-19-onda5a-qualidade-design.md` §1). Escopo: `src/features/erp/planner/PlannerPage.tsx` (casca) + `PlannerExecutadoView.tsx` + `PlannerPlanejadoView.tsx`/`PlannerComponents.tsx`.

---

## 1. Contexto

Planner é estruturado como casca (`PlannerPage.tsx`, 26 linhas — título+descrição+toggle Executado/Planejado) + duas views alternadas por um `PlannerModeToggle`. Três achados:

1. **Cabeçalho artesanal na casca**: `<h1>+<p>` (descrição muda conforme o modo) ao lado do `PlannerModeToggle`, sem `PageHeader`.
2. **4ª cópia do `SectionLabel` não pega pela auditoria da Onda 5a**: `PlannerComponents.tsx:107-115` — a spec da Onda 5a (`2026-07-19-onda5a-qualidade-design.md` §1) listou 3 cópias (`DashboardKpiPrimitives.tsx`, `AlertasComponents.tsx`, `PlannerExecutadoView.tsx`), mas `PlannerComponents.tsx` tem uma 4ª, idêntica ao padrão "texto colorido" de Alertas/PlannerExecutadoView, usada por `PlannerPlanejadoView.tsx`. Além disso, `PlannerExecutadoView.tsx:125-133` tem sua própria cópia local — **idêntica** à de `PlannerComponents.tsx` — ou seja, dentro do próprio Planner já existem 2 cópias 100% iguais entre si, sem nenhuma vir de um lugar comum.
3. **Grid de KPIs de `PlannerExecutadoView.tsx`** (linha 516: `grid-cols-2 lg:grid-cols-4`) tem o mesmo problema recorrente de breakpoint intermediário faltando — `PlannerPlanejadoView.tsx` (linha 131) já usa o padrão correto (`grid-cols-2 sm:grid-cols-4`).

**Restrições permanentes (herdadas das ondas anteriores, sem exceção):**
- Design sóbrio: tokens reais do `index.css`, Inter, cor só pra status.
- Sem novas dependências de stack.
- `npm run build`, `npm run lint`, `npm run audit:ds`, `npx tsc --noEmit`, `npm test` limpos antes de qualquer commit.
- Nenhuma mudança de rota, permissão, dado ou lógica de negócio — só reorganização de UI + dedup local. `buildProdutividade`, `buildPlanner`, `getDayLabelsFromRange`, `getWeekDays`, `tipoIcon`, `TeamRow`, `PlannerCell`, `PlannerDrillModal`, `DeltaBadge`, hooks de IA (`useAIProdutividade`/`useAIPlanner`) — tudo intocado.

---

## 2. Decisões de escopo (resolvidas com o usuário)

1. **`SectionLabel` de Planner**: só desduplicar as 2 cópias locais **entre si** — `PlannerExecutadoView.tsx` remove sua definição local e passa a importar de `./PlannerComponents` (já usado por `PlannerPlanejadoView.tsx`). Zero mudança visual (ambas as cópias já eram idênticas). **Não migra pro `SectionLabel` canônico neutro** (`src/components/ui/SectionLabel.tsx`, criado na Onda 5a) — isso mudaria a aparência (ícone/texto perdem cor) e fica pra uma limpeza dedicada que também envolva Alertas, decisão explícita a tomar separadamente.
2. **`PlannerModeToggle` no cabeçalho**: fica dentro do `actions` do `PageHeader`, junto do título — é o controle principal da tela (não um filtro secundário), mantém a posição visual de hoje.
3. **Grid de KPIs de `PlannerExecutadoView.tsx`**: `grid-cols-2 sm:grid-cols-4`, mesmo padrão de 4 itens já usado em Ranking (Onda 5b) e no próprio `PlannerPlanejadoView.tsx`.

---

## 3. Mudanças

### 3.1 `PlannerPage.tsx`

Substitui:
```tsx
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-headline font-bold text-text mb-0.5">Planner de Equipes</h1>
          <p className="text-label text-muted">
            {modo === 'executado'
              ? 'Histórico de execuções por equipe'
              : 'Agenda futura por equipe — clique numa célula para ver as OS'}
          </p>
        </div>
        <PlannerModeToggle modo={modo} onChange={setModo} />
      </div>
```
por:
```tsx
      <PageHeader
        title="Planner de Equipes"
        description={modo === 'executado'
          ? 'Histórico de execuções por equipe'
          : 'Agenda futura por equipe — clique numa célula para ver as OS'}
        actions={<PlannerModeToggle modo={modo} onChange={setModo} />}
      />
```

### 3.2 `PlannerExecutadoView.tsx`

- Remove a função `SectionLabel` local (linhas 123-133) e o comentário de seção `// ─── SectionLabel ─── ` acima dela.
- Adiciona `import { SectionLabel } from './PlannerComponents'` — o tipo `IconComp` local do arquivo (linha 18, usado por `tipoIcon`) não muda; o `SectionLabel` importado usa o `IconComp` de `PlannerComponents.tsx` (mesma forma estrutural, compatível).
- Grid de KPIs (linha 516: `<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">`) vira `grid grid-cols-2 sm:grid-cols-4 gap-3`.
- Uso de `<SectionLabel icon={BarChart3} color="#3b82f6">...</SectionLabel>` (linha 544) **inalterado** — só a fonte do import muda.

### 3.3 `PlannerPlanejadoView.tsx` / `PlannerComponents.tsx`

Nenhuma mudança — `PlannerPlanejadoView.tsx` já importa `SectionLabel` de `./PlannerComponents`, que passa a ser consumido também por `PlannerExecutadoView.tsx`.

---

## 4. Fora do escopo desta implementação

- Migração do `SectionLabel` de Planner pro canônico neutro (`src/components/ui/SectionLabel.tsx`) — decisão explícita adiada, junto com Alertas (Onda 5e).
- Qualquer redesign funcional (grade de dias, drill-down, IA de produtividade/balanceamento, edição de metas).
- Qualquer mudança de rota, permissão ou lógica de dados/negócio.

---

## 5. Testes

- Suíte completa (`npm test`) deve continuar 100% verde — nenhuma mudança de comportamento esperada (só JSX/props/import; nenhum builder/hook muda).
- Verificação manual no navegador: cabeçalho de Planner com `PageHeader` + toggle Executado/Planejado no lugar de sempre, trocar de modo continua funcionando; grid de KPIs de "Executado" responsivo em 3 larguras (375px/768px/1440px); seção "Ranking" (Executado) e "Grade"/"Cidades cobertas" (Planejado) continuam com `SectionLabel` renderizando igual a antes (ícone/texto coloridos, sem mudança visual).

---

## 6. Arquivos afetados

- `src/features/erp/planner/PlannerPage.tsx` — adota `PageHeader` com `actions={PlannerModeToggle}`.
- `src/features/erp/planner/PlannerExecutadoView.tsx` — remove `SectionLabel` local, importa de `PlannerComponents.tsx`, grid de KPIs responsivo.
