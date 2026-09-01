# Redesign Enterprise — Onda 6c: Fechamento (Design)

**Data:** 2026-07-19
**Status:** Aprovado pelo usuário
**Escopo deste documento:** design da Onda 6c — terceira sub-onda de "Onda 6: Periféricas" (`docs/superpowers/specs/2026-07-15-redesign-enterprise-onda1-fundacao-design.md` §3, decomposta em 4 sub-ondas: Fornecedor/Juniper/Fechamento/Usuários — ver `docs/superpowers/specs/2026-07-19-onda6a-fornecedor-design.md` §1). Escopo: `src/features/fechamento/FechamentoPage.tsx` — adoção do `PageHeader`, usando `icon`+`description` (combinação já usada por `RankingTecnicosPage.tsx`, Onda 5b — sem mudança de API).

---

## 1. Contexto

`FechamentoPage.tsx` (501 linhas) tem o cabeçalho mais simples das 4 telas desta decomposição, mais simples até que o de Fornecedor (Onda 6a): ícone (`FileText`) + `<h2>` + uma legenda inline (`— fechamento operacional por período e escopo`), sem badge, indicador ou ação extra no cabeçalho — os botões de exportação (PDF/CSV/Imprimir) ficam num card separado (`KPIHeader`) mais abaixo, não no cabeçalho principal.

**`icon`+`description` já é combinação testada**: `RankingTecnicosPage.tsx` (Onda 5b) já usa `<PageHeader title description icon={Award} />` — nenhuma mudança de API no `PageHeader` necessária aqui.

**Achado importante — nenhum grid precisa de fix, diferente de Fornecedor/Juniper**: os dois grids de 5 itens (`KPIHeader` linha 248, `RedeBlock` linha 440 — ambos `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`) **já têm breakpoint intermediário**, não são o bug de "zero responsividade" corrigido nas duas sub-ondas anteriores — só usam `sm:` em vez de `md:` no meio (inconsistência estética menor com a maioria do codebase — `CidadesPage`/`QualidadePage`/`FilaPage`/`JuniperPage` usam `md:grid-cols-3` — mas funcionalmente já responsivo, fora do escopo desta sub-onda de reorganização de cabeçalho). Os dois grids de 2 itens (linha 173 e 455, `grid-cols-1 lg:grid-cols-2`) já são o padrão mínimo aceitável. **Nenhum grid muda nesta sub-onda.**

**Restrições permanentes (herdadas das ondas anteriores, sem exceção):**
- Design sóbrio: tokens reais do `index.css`, Inter, cor só pra status.
- Sem novas dependências de stack.
- `npm run build`, `npm run lint`, `npm run audit:ds`, `npx tsc --noEmit`, `npm test` limpos antes de qualquer commit.
- Nenhuma mudança de rota, permissão, dado ou lógica de negócio — `filterRows`, `calcStats`, `getPeriodDates`, `getPeriodoNome`, `exportRelatorioCSV`, `generateFechamentoPDF`, `useFechamentoAutomation`, `EquipesTable`/`CidadesChart`/`TiposCards`/`RedeBlock`/`ClientesRedeList`/`KPIHeader`/`Section` ficam intocados.
- `PageHeader` já suporta `icon?`/`description?` — nenhuma mudança de API necessária nesta sub-onda.
- Nota de precisão herdada da Onda 6a (não repetir o erro): adotar `PageHeader` padroniza Fechamento com as 9 telas já migradas, mas o `Navbar.tsx` já renderiza seu próprio `<h1>` por rota — a página passa a ter dois `<h1>`, igual às demais, não "exatamente um".

---

## 2. Decisões de escopo (resolvidas com o usuário)

1. **Cabeçalho de Fechamento**: `<PageHeader title="Relatório de Fechamento" description="Fechamento operacional por período e escopo" icon={FileText} />`. O travessão inicial ("— fechamento...") é removido e o texto capitalizado — fazia sentido só no layout inline antigo; `description` já renderiza como frase própria abaixo do título, mesmo padrão de Ranking/Qualidade/Relatórios (frases capitalizadas).
2. **Nenhum grid muda**: os 2 grids de 5 itens já têm breakpoint intermediário (não são o bug corrigido em Fornecedor/Juniper); os 2 grids de 2 itens já são o padrão mínimo aceitável.

---

## 3. Mudanças

### 3.1 `FechamentoPage.tsx` — cabeçalho

Substitui:
```tsx
      <div className="flex items-center gap-2 flex-wrap">
        <FileText size={16} className="text-primary flex-shrink-0" />
        <h2 className="font-headline text-xl font-semibold text-text">Relatório de Fechamento</h2>
        <span className="text-caption text-muted">— fechamento operacional por período e escopo</span>
      </div>
```
por:
```tsx
      <PageHeader
        title="Relatório de Fechamento"
        description="Fechamento operacional por período e escopo"
        icon={FileText}
      />
```

Novo import (após `import { useOSDerived } from '../../contexts/OSDataContext'`, mantendo ordem de imports já usada no arquivo — checar posição exata na implementação):
```tsx
import { PageHeader } from '../../components/ui/PageHeader'
```

Resto do arquivo (toolbar de período/escopo, `KPIHeader` com botões de exportação, `EquipesTable`, `CidadesChart`, `TiposCards`, `RedeBlock`, `ClientesRedeList`, botões flutuantes de exportação no rodapé) **inalterado**.

---

## 4. Fora do escopo desta implementação

- Usuários — sub-onda seguinte, fora deste plano.
- Qualquer redesign funcional (filtros de período/escopo, exportação PDF/CSV/impressão, automação de fechamento).
- Qualquer mudança de rota, permissão ou lógica de dados/negócio.
- Os 4 grids de `FechamentoPage.tsx` (já responsivos, ver §1).

---

## 5. Testes

- Suíte completa (`npm test`) deve continuar 100% verde — nenhuma mudança de comportamento esperada (só JSX/import; `filterRows`/`calcStats`/hooks não mudam), regressão confirmada nos 9 consumidores existentes do `PageHeader`.
- Verificação manual no navegador: cabeçalho com ícone `FileText`, título "Relatório de Fechamento" e descrição "Fechamento operacional por período e escopo" abaixo (via `<h1>` semântico); toolbar de período/escopo, `KPIHeader` (com botões PDF/CSV/Imprimir), ranking de equipes, produtividade por cidade/tipo, bloco Rede (quando aplicável) e botões flutuantes de exportação continuam funcionando normalmente.

---

## 6. Arquivos afetados

- `src/features/fechamento/FechamentoPage.tsx` — adota `PageHeader` com `icon`/`description`.
