# Redesign Enterprise — Onda 6a: Fornecedor (Design)

**Data:** 2026-07-19
**Status:** Aprovado pelo usuário
**Escopo deste documento:** design da Onda 6a — primeira sub-onda de "Onda 6: Periféricas" (`docs/superpowers/specs/2026-07-15-redesign-enterprise-onda1-fundacao-design.md` §3). Escopo original de Onda 6: Fornecedor, Juniper, Fechamento, Mapa, NOC, Usuários, Login. Decomposta: só Fornecedor, Juniper, Fechamento, Usuários entram no ciclo spec→plano→implementação (mesmo padrão de reorganização de cabeçalho das 5 sub-ondas de Onda 5) — Mapa, NOC e Login ficam de fora por serem estruturalmente diferentes (NOC é full-screen fora do `AppLayout` e bypassa autenticação; Login é a própria tela de autenticação, pré-`AppLayout`; Mapa não tem título tradicional, pode ser uma view diferente) e são avaliadas separadamente, se fizer sentido, fora deste plano.

---

## 1. Contexto

`FornecedorPage.tsx` (391 linhas) é a mais simples das 4 telas desta decomposição: cabeçalho artesanal com ícone (`Home`) + `<h2>` (não `<h1>` — é a primeira tela do redesign onde o título principal não usa `<h1>`), sem descrição. Filtro por operadora (pills coloridos) já numa linha própria abaixo do título. Grid de KPIs dentro de cada painel de fornecedor (7 itens) já é totalmente responsivo (`grid-cols-2 sm:grid-cols-4 lg:grid-cols-7`) — nenhum fix de grid necessário aqui, diferente da maioria das sub-ondas anteriores.

**Achado que não é um problema**: `SectionTitle` (`src/components/ui/SectionTitle.tsx`, usado no "Ranking por Score Composto") é um componente diferente do `SectionLabel` das ondas anteriores — mais discreto (`text-caption uppercase text-muted`, sem barra colorida), já canônico em `components/ui/`, sem duplicação. Não é tocado nesta onda.

**Restrições permanentes (herdadas das ondas anteriores, sem exceção):**
- Design sóbrio: tokens reais do `index.css`, Inter, cor só pra status.
- Sem novas dependências de stack.
- `npm run build`, `npm run lint`, `npm run audit:ds`, `npx tsc --noEmit`, `npm test` limpos antes de qualquer commit.
- Nenhuma mudança de rota, permissão, dado ou lógica de negócio — `buildFornecedor`, `useAIFornecedor`, `FornecedorPanel`, `scoreColor`, `fmtCusto` ficam intocados.
- `PageHeader` já suporta `icon?` (Onda 5b) — nenhuma mudança de API necessária nesta sub-onda.

---

## 2. Decisões de escopo (resolvidas com o usuário)

1. **Decomposição de Onda 6**: 4 sub-ondas (Fornecedor, Juniper, Fechamento, Usuários), uma tela por vez — Mapa/NOC/Login fora do escopo deste ciclo.
2. **Cabeçalho de Fornecedor**: `<PageHeader title="Análise por Fornecedor" icon={Home} />`, sem `description` (não existe hoje). O `<h2>` vira semanticamente `<h1>` (única mudança estrutural real — `PageHeader` sempre renderiza `<h1>`, e esta é a primeira tela onde o título principal não era `<h1>`; consequência positiva, cada página passa a ter exatamente um `<h1>`, consistente com as 7 telas já migradas).

---

## 3. Mudanças

### 3.1 `FornecedorPage.tsx`

Substitui:
```tsx
      <div className="flex items-center gap-2">
        <Home size={16} className="text-primary" />
        <h2 className="font-headline text-xl font-semibold text-text">Análise por Fornecedor</h2>
      </div>
```
por:
```tsx
      <PageHeader title="Análise por Fornecedor" icon={Home} />
```

Resto do arquivo (filtro por operadora, ranking por score, análise de IA, painéis por fornecedor com KPIs/tabela de equipes/gráfico) **inalterado**.

---

## 4. Fora do escopo desta implementação

- Mapa, NOC, Login — avaliação separada, fora deste plano de 4 sub-ondas.
- Qualquer redesign funcional (ranking, painéis, IA, edição de meta/custo).
- Qualquer mudança de rota, permissão ou lógica de dados/negócio.

---

## 5. Testes

- Suíte completa (`npm test`) deve continuar 100% verde — nenhuma mudança de comportamento esperada (só JSX/import).
- Verificação manual no navegador: cabeçalho com ícone `Home` + título "Análise por Fornecedor" via `PageHeader`; filtro por operadora, ranking, análise de IA e painéis continuam funcionando normalmente.

---

## 6. Arquivos afetados

- `src/features/fornecedor/FornecedorPage.tsx` — adota `PageHeader` com `icon={Home}`.
