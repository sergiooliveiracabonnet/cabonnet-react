# Redesign Enterprise — Onda 5c: Relatórios Operacionais (Design)

**Data:** 2026-07-19
**Status:** Aprovado pelo usuário
**Escopo deste documento:** design da Onda 5c — terceira sub-onda de "Onda 5: ERP analíticos" (`docs/superpowers/specs/2026-07-15-redesign-enterprise-onda1-fundacao-design.md` §3, decomposta em 5 sub-ondas de uma tela cada — ver `docs/superpowers/specs/2026-07-19-onda5a-qualidade-design.md` §1). Escopo: `src/features/erp/relatorios/RelatoriosPage.tsx` — adoção do `PageHeader`.

---

## 1. Contexto

`RelatoriosPage.tsx` já segue a linguagem sóbria estabelecida (KPIs com ícone/cor por status, `Section`/`Empty`/`OSListModal` já são componentes locais bem encapsulados e reutilizados, sem duplicação). Único achado: cabeçalho artesanal — `<h1>+<p>` numa `div`, ao lado (mesma linha, `justify-between`) de dois grupos de filtro (Período: Tudo/30 dias/7 dias; Tipo: Todos/Instalação/Manutenção/Rede) empilhados verticalmente (`flex flex-col items-end gap-2`) por disputarem espaço horizontal com o título.

**Diferença desta sub-onda em relação às anteriores**: o grid de KPIs (`grid-cols-2 sm:grid-cols-4`, linha 257) **já usa o padrão responsivo correto** de 4 itens (mesmo fix aplicado em Ranking na Onda 5b) — nenhuma correção de grid necessária aqui.

**Restrições permanentes (herdadas das ondas anteriores, sem exceção):**
- Design sóbrio: tokens reais do `index.css`, Inter, cor só pra status.
- Sem novas dependências de stack.
- `npm run build`, `npm run lint`, `npm run audit:ds`, `npx tsc --noEmit`, `npm test` limpos antes de qualquer commit.
- Nenhuma mudança de rota, permissão, dado ou lógica de negócio — só reorganização de UI. Todos os `useMemo` de cálculo (`kpis`, `byTeam`, `slaData`, `tipoData`, `agingData`, `ranking`, `totals`, `drill*`), `Section`/`Empty`/`OSListModal` ficam intocados.

---

## 2. Decisões de escopo (resolvidas com o usuário)

1. **Filtros saem do cabeçalho**: `PageHeader` fica só com `title`+`description` (sem `actions` — não há botão de ação nesta tela). Os dois grupos de filtro (Período, Tipo) viram uma linha própria logo abaixo.
2. **Filtros ficam lado a lado (horizontal)**: já que a linha própria tem a largura toda disponível (diferente de antes, quando competiam por espaço com o título), os dois grupos ficam lado a lado — mesmo padrão de linha de filtros/opções já usado em Ordens/Fila/Qualidade — em vez de manter o empilhamento vertical que só existia por restrição de espaço.

---

## 3. Mudanças

### 3.1 `RelatoriosPage.tsx`

Substitui o bloco `<div className="flex items-start justify-between gap-4">...</div>` (linhas 197-245, que hoje contém título+descrição de um lado e os dois grupos de filtro empilhados do outro) por:

- `<PageHeader title="Relatórios Operacionais" description="Análise de desempenho · ERP" />`
- Logo abaixo, `<div className="flex items-center gap-3 flex-wrap">` contendo os dois grupos de filtro (Período primeiro, depois Tipo) lado a lado — mesmo JSX interno de cada grupo (botões, `onClick`, classes condicionais de estado ativo), só desaninhados do wrapper vertical `flex flex-col items-end gap-2` que existia antes.

Resto do arquivo (KPIs, "Produção Consolidada", os 4 `Section` de gráfico, modal de drill-down) **inalterado**.

---

## 4. Fora do escopo desta implementação

- Qualquer redesign dos gráficos, KPIs, ranking de produtividade ou modal de drill-down.
- Qualquer mudança de rota, permissão ou lógica de dados/negócio.

---

## 5. Testes

- Suíte completa (`npm test`) deve continuar 100% verde — nenhuma mudança de comportamento esperada (só JSX/props; nenhum `useMemo`/cálculo muda).
- Verificação manual no navegador: cabeçalho com título+descrição no `PageHeader`, filtros de Período e Tipo numa linha própria abaixo, lado a lado, funcionando como antes (troca de período/tipo continua filtrando KPIs/gráficos/drill-down).

---

## 6. Arquivos afetados

- `src/features/erp/relatorios/RelatoriosPage.tsx` — adota `PageHeader`, filtros viram linha própria horizontal.
