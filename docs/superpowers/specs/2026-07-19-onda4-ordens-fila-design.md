# Redesign Enterprise — Onda 4: Ordens & Fila (Design)

**Data:** 2026-07-19
**Status:** Aprovado pelo usuário
**Escopo deste documento:** design da Onda 4 do redesign enterprise — reorganização de cabeçalho e adoção do componente `PageHeader` (criado na Onda 1, ainda não usado por nenhuma tela real) nas telas `OrdensPage.tsx` e `FilaPage.tsx`, mais extração de código duplicado de captura de imagem. Continuação de `2026-07-15-redesign-enterprise-onda1-fundacao-design.md` §3 (mapa de ondas) e `2026-07-17-redesign-enterprise-onda2-dashboard-design.md` (mesmo padrão de "reorganização, não reskin").

---

## 1. Contexto

`OrdensPage.tsx` (lista de OS, filtros, tabela paginada) e `FilaPage.tsx` (fila unificada de urgência VT+SLA, ex-"VT"/"Fila Geral" fundidas — ver `[[project_menu_vt]]`) já seguem a linguagem sóbria estabelecida na Onda 1 nos seus componentes internos (`StatCard` com `tone`, `Badge` por status, `DataTable`, bordas neutras, `tabular-nums`). O achado desta onda, como na Onda 2, não é um reskin — é reorganização de cabeçalho e eliminação de inconsistências pontuais:

1. **Nenhuma das duas usa `PageHeader`** (`src/components/ui/PageHeader.tsx`), o componente canônico de título+descrição+ações criado na Onda 1. Cada tela tem um cabeçalho artesanal diferente: Ordens mistura título + 3 toggles de visualização + 4 botões de ação numa única linha flex; Fila usa `<h1>+<p>` com descrição, mas sem ações no cabeçalho (ações ficam na barra de filtros).
2. **~180 linhas de código quase idênticas** entre as duas telas para gerar a imagem PNG copiável (clone off-screen da tabela + composição de cabeçalho em canvas via `html-to-image`).
3. **Grid de KPIs da Fila não é responsivo** (`grid-cols-5` fixo), diferente do padrão já usado em Ordens/Dashboard (`grid-cols-2 md:grid-cols-3 lg:grid-cols-N`), violando a regra de breakpoints da Onda 1 (mobile 375px / tablet 768px / desktop 1440px).

**Cores de tipo (Instalação=cyan, Manutenção=orange, Serviço=purple) usadas nos pills "Resumo por Tipo" de Ordens não são um problema** — é uma convenção já estabelecida e reutilizada em `RelatoriosPage.tsx`, `QualidadePage.tsx`, `CidadesComponents.tsx`; mantida sem alteração.

**Restrições permanentes (herdadas da Onda 1/2, sem exceção):**
- Design sóbrio: tokens reais do `index.css`, Inter, cor apenas para status (taxonomias de tipo já estabelecidas são exceção documentada, não nova).
- Sem novas dependências de stack.
- `npm run build`, `npm run lint`, `npx tsc --noEmit`, `npm test` limpos antes de qualquer commit.
- Nenhuma mudança de rota, permissão, dado ou lógica de negócio — só reorganização de UI + dedup de código.

---

## 2. Decisões de escopo (resolvidas com o usuário)

1. **Escopo:** reorganização de cabeçalho (adoção do `PageHeader`) + dedup do código de captura de imagem + fix do grid não-responsivo da Fila. Não é redesign funcional/de layout mais amplo.
2. **Dedup do código de captura de imagem:** extrair para `src/lib/captureTableImage.ts`, já que as duas telas serão tocadas mesmo assim.
3. **Cabeçalho de Ordens:** ações (Copiar Imagem/CSV/PDF/Telegram) vão pro `PageHeader`; toggles de visualização (KPIs/Por Cliente/Densidade) saem do cabeçalho e viram uma linha própria de opções de visualização logo abaixo.
4. **Descrição de Ordens:** só título, sem descrição — "Ordens de Serviço" já é autoexplicativo, não inventar copy nova sem necessidade.
5. **Grid de KPIs da Fila:** padronizar pra responsivo (`grid-cols-2 md:grid-cols-3 lg:grid-cols-5`), mantendo os mesmos 5 KPIs.
6. **Ações da Fila:** movem da barra de filtros pro `PageHeader`, pra consistência total entre as duas telas (ações sempre no cabeçalho, filtros sempre numa barra separada).

---

## 3. Mudanças

### 3.1 `src/lib/captureTableImage.ts` (novo)

Função pura `captureTableAsImage(opts): Promise<Blob>` extraída do código hoje duplicado em `OrdensPage.handleCopyImage` (ramo tabela flat/cliente, linhas 211-303) e `FilaPage.handleCopyImage` (linhas 209-311) — ambos fazem exatamente: clone off-screen da tabela sem `overflow`/`maxHeight`, captura via `html-to-image` `toBlob`, composição de canvas com cabeçalho (barra de cor de destaque + título + subtítulo + timestamp + contagem de itens).

```ts
interface CaptureTableImageOptions {
  tableEl:     HTMLElement
  title:       string   // ex: "CABONNET · Ordens de Serviço"
  subtitle:    string   // ex: "Todas as Equipes" ou "Fornecedor: WES"
  accentColor: string   // hex — cor da barra lateral + subtítulo
  itemCount:   number   // ex: os.filtered.length
}

export async function captureTableAsImage(opts: CaptureTableImageOptions): Promise<Blob>
```

Comportamento idêntico ao atual em ambas as chamadas (mesmos valores de `SCALE`, `HDR_H`, cores de fundo/texto por tema claro/escuro, mesma lógica de `getTrueWidth`/`stripOverflow`). Cada página mantém, ao redor da chamada:
- `OrdensPage`: `accentColor: '#3b82f6'`, `title: 'CABONNET · Ordens de Serviço'`, `subtitle: 'Todas as Equipes'`, `itemCount: os.filtered.length` — sem `logAudit` (comportamento atual preservado).
- `FilaPage`: `accentColor: '#ef4444'`, `title: 'CABONNET · Fila de Prioridade'`, `subtitle: fornecedor ? `Fornecedor: ${fornecedor}` : 'Todos os Fornecedores'`, `itemCount: fila.length` — com `logAudit('Imagem copiada (fila de prioridade)', ...)` preservado.

O ramo de `OrdensPage` com `os.equipe` selecionado (que usa `captureOSPorPeriodo`, canvas puro sem clone de DOM) **não é tocado** — não faz parte da duplicação, é um caminho visual diferente.

### 3.2 `OrdensPage.tsx`

- Substitui o bloco atual (linhas 329-404: `<h2>` + toggle KPIs + toggle Por Cliente + toggle Densidade + botões de ação, tudo numa linha) por:
  ```tsx
  <PageHeader
    title="Ordens de Serviço"
    actions={
      <>
        <Button variant="outline" size="sm" ...>Copiar Imagem</Button>
        <Button variant="outline" size="sm" ...>CSV (...)</Button>
        <Button variant="outline" size="sm" ...>PDF</Button>
        <Button variant="outline" size="sm" ...>Telegram</Button>
      </>
    }
  />
  ```
- Logo abaixo, nova linha "opções de visualização" com os 3 toggles hoje existentes (KPIs/Por Cliente/Densidade), mesmo JSX/estilo de hoje, só realocado.
- `handleCopyImage` (ramo flat/cliente) chama `captureTableAsImage` em vez do bloco inline.
- Resto da tela (KPI cards, Resumo por Tipo, barra de filtros, banner de filtros ativos, tabela, paginação, drawer, modal Telegram) **inalterado**.

### 3.3 `FilaPage.tsx`

- Substitui o bloco atual (linhas 413-416: `<h1>` + `<p>`) por:
  ```tsx
  <PageHeader
    title="Fila de Prioridade"
    description="Toda OS ativa numa fila só — VT (prazo em horas) e as demais (SLA em dias), ordenadas pela mesma gravidade real"
    actions={
      <>
        <button ...>Copiar Imagem</button>
        <button ...>Notificar violadas (...)</button>
      </>
    }
  />
  ```
- Grid de KPIs (linha 418: `<div className="grid grid-cols-5 gap-4">`) muda para `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4` — mesmos 5 `StatCard`, sem adição/remoção.
- Barra de filtros (linha 438: `<div className="flex flex-wrap items-center gap-3">`) perde os dois botões de ação e o `ml-auto` associado — fica só com os 2 `FilterSelect` + `SearchBox`.
- `handleCopyImage` chama `captureTableAsImage`, mantendo `logAudit` e os toggles de estado (`copiedImage`) como estão hoje.
- Resto da tela (painéis de carga/tendência, tabela, colunas, drawer, notificação individual/em lote) **inalterado**.

---

## 4. Fora do escopo desta implementação

- Redesign funcional/de layout mais amplo das duas telas (fluxo, colunas da tabela, filtros).
- Qualquer mudança de rota, permissão ou lógica de dados/negócio.
- Auditoria de outras telas em busca de duplicação semelhante (fora do par Ordens/Fila desta onda).
- Padronizar se `OrdensPage` também deveria logar auditoria ao copiar imagem (assimetria hoje existente entre as duas telas, preservada sem alteração).

---

## 5. Testes

- **Sem teste dedicado para `captureTableImage.ts`**: `jsdom` não suporta `CanvasRenderingContext2D` (documentado no próprio `captureOSTable.test.ts:4-7`, que testa só a lógica pura de agrupamento/ordenação daquele arquivo, não as funções de canvas). `captureTableAsImage` não tem lógica de negócio pura equivalente pra extrair e testar — é só medição de DOM + composição de canvas. Um teste que só verifica "a função existe"/assinatura seria tautológico (não verifica comportamento real) — decidido não escrever esse teste, seguindo o mesmo precedente já estabelecido em `captureOSTable.ts`. Cobertura fica com type-check (assinatura/uso corretos nos dois call sites) + regressão da suíte completa + verificação manual.
- Suíte completa (`npm test`) deve continuar 100% verde após a extração — nenhuma mudança de comportamento esperada.
- Verificação manual no navegador: cabeçalho de Ordens (ações + toggles na posição nova), cabeçalho da Fila (ações no header, filtros sem os botões), grid de KPIs da Fila responsivo em 3 larguras (375px/768px/1440px), botão "Copiar Imagem" gerando a mesma imagem de antes em ambas as telas.

---

## 6. Arquivos afetados

- `src/lib/captureTableImage.ts` (novo) — função `captureTableAsImage`. Sem teste dedicado (ver §5).
- `src/features/ordens/OrdensPage.tsx` — adota `PageHeader`, realoca toggles, usa o novo helper.
- `src/features/erp/fila/FilaPage.tsx` — adota `PageHeader`, move ações pro header, grid responsivo, usa o novo helper.
