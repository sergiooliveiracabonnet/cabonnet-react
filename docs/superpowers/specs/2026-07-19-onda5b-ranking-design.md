# Redesign Enterprise — Onda 5b: Ranking de Técnicos (Design)

**Data:** 2026-07-19
**Status:** Aprovado pelo usuário
**Escopo deste documento:** design da Onda 5b — segunda sub-onda de "Onda 5: ERP analíticos" (`docs/superpowers/specs/2026-07-15-redesign-enterprise-onda1-fundacao-design.md` §3, decomposta em 5 sub-ondas de uma tela cada — ver `docs/superpowers/specs/2026-07-19-onda5a-qualidade-design.md` §1). Escopo: `src/features/erp/ranking/RankingTecnicosPage.tsx` — adoção do `PageHeader`, que precisa ganhar uma prop `icon?` nova pra suportar o ícone que o título desta tela já tem.

---

## 1. Contexto

`RankingTecnicosPage.tsx` é bem mais simples que Qualidade (Onda 5a): 296 linhas, cabeçalho + grid de 4 KPIs + uma tabela ordenável só, sem seções com "rótulo colorido" — não há candidato a `SectionLabel` aqui. Dois achados:

1. **Cabeçalho artesanal com ícone**: `<h1>` tem `<Award size={18} className="text-primary" />` inline antes do texto "Ranking de Técnicos" — nenhuma das 3 telas que já adotaram `PageHeader` (Ordens, Fila, Qualidade — Onda 4/5a) tinha ícone no título, então `PageHeaderProps` nunca precisou de um slot pra isso. É a primeira vez que aparece.
2. **Grid de KPIs sem breakpoint intermediário**: `grid-cols-2 lg:grid-cols-4` (linha 214) pula direto de 2 pra 4 colunas — mesma classe de problema já corrigida em Fila/Qualidade, mas o fix certo pra **4** itens é diferente do fix pra 5: o padrão dominante no repo pra grids de exatamente 4 KPIs é `grid-cols-2 sm:grid-cols-4` (usado em `DashboardHeroBlock.tsx`, `PulsoHero.tsx`, `PlannerPlanejadoView.tsx`, `RelatoriosPage.tsx` ×2, `GerencialPage.tsx` ×2/base de `FornecedorPage.tsx`), não `md:grid-cols-3 lg:grid-cols-4` (inventado, sem precedente, e 3 não divide bem 4 itens).

**Restrições permanentes (herdadas das ondas anteriores, sem exceção):**
- Design sóbrio: tokens reais do `index.css`, Inter, cor só pra status.
- Sem novas dependências de stack.
- `npm run build`, `npm run lint`, `npm run audit:ds`, `npx tsc --noEmit`, `npm test` limpos antes de qualquer commit.
- Nenhuma mudança de rota, permissão, dado ou lógica de negócio — só reorganização de UI. Tabela, ordenação (`SortIcon`/`toggleSort`), edição de nome do técnico (`TecnicoCell`) e `buildRankingTecnicos` (função pura já testada) ficam intocados.

---

## 2. Decisões de escopo (resolvidas com o usuário)

1. **`PageHeader` ganha `icon?`**: prop opcional `ComponentType<{ size?: number; className?: string }>`. Quando presente, renderiza antes do título com o mesmo estilo do `Award` original (`size={18}`, `className="text-primary"`). Sem `icon`, o `<h1>` renderiza exatamente como hoje — mudança aditiva e retrocompatível, não quebra Ordens/Fila/Qualidade (nenhuma das 3 passa essa prop).
2. **Grid de KPIs**: `grid-cols-2 sm:grid-cols-4`, seguindo o padrão dominante do repo pra grids de 4 itens (não o padrão de 5 itens usado em Qualidade/Fila).

---

## 3. Mudanças

### 3.1 `src/components/ui/PageHeader.tsx`

```tsx
import type { ComponentType, ReactNode } from 'react'

export interface PageHeaderProps {
  title:        string
  description?: string
  icon?:        ComponentType<{ size?: number; className?: string }>
  actions?:     ReactNode
  className?:   string
}

export function PageHeader({ title, description, icon: Icon, actions, className = '' }: PageHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-4 flex-wrap ${className}`}>
      <div className="min-w-0">
        <h1 className="text-title font-semibold text-text flex items-center gap-2">
          {Icon && <Icon size={18} className="text-primary" />}
          {title}
        </h1>
        {description && <p className="text-label text-muted mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}
```

### 3.2 `RankingTecnicosPage.tsx`

- Substitui o bloco `<div><h1>...<Award.../>...Ranking de Técnicos</h1><p>...</p></div>` (linhas 205-212) por `<PageHeader title="Ranking de Técnicos" description="Volume, SLA e taxa de retrabalho por técnico, lado a lado — sem score composto, sem peso inventado" icon={Award} />`.
- Grid de KPIs (linha 214: `<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">`) vira `grid grid-cols-2 sm:grid-cols-4 gap-4` — mesmos 4 `StatCard`, sem adição/remoção.
- Resto do arquivo (tabela, `SortIcon`, `TecnicoCell`, `buildRankingTecnicos`) **inalterado**.

---

## 4. Fora do escopo desta implementação

- Qualquer redesign da tabela (colunas, ordenação, edição de técnico).
- Auditoria de outras telas com o mesmo padrão de grid `grid-cols-2 lg:grid-cols-4` sem breakpoint intermediário (achado em `PlannerExecutadoView.tsx:516` e `JuniperPage.tsx:344,498` durante esta auditoria) — fora do escopo desta sub-onda, registrado como observação pra quando 5d (Planner) chegar ou uma limpeza dedicada.
- `SortIcon` também existe em `MapaComponents.tsx` — não investigado se é duplicação real ou coincidência de nome; fora de escopo.

---

## 5. Testes

- **`src/components/ui/PageHeader.test.tsx`**: adicionar um teste pro novo comportamento (`icon` renderiza um SVG antes do título; sem `icon`, nenhum SVG extra aparece) — mesmo arquivo/padrão já existente, só estende a cobertura.
- Suíte completa (`npm test`) deve continuar 100% verde — nenhuma mudança de comportamento esperada em `RankingTecnicosPage.tsx` (só JSX/props, `buildRankingTecnicos` e a lógica de ordenação não mudam).
- Verificação manual no navegador: cabeçalho com ícone Award antes do título, grid de KPIs responsivo em 3 larguras (375px/768px/1440px), Ordens/Fila/Qualidade continuam com cabeçalho idêntico ao de antes (regressão visual da mudança de API do `PageHeader`).

---

## 6. Arquivos afetados

- `src/components/ui/PageHeader.tsx` — ganha prop `icon?`.
- `src/components/ui/PageHeader.test.tsx` — novo teste de `icon`.
- `src/features/erp/ranking/RankingTecnicosPage.tsx` — adota `PageHeader` com `icon={Award}`, grid de KPIs responsivo.
