# Design: Custo de revisita por fornecedor

**Data:** 2026-07-31
**Status:** Aguardando decisão — ver "A decisão central" abaixo

## Contexto

O PR #15 corrigiu o custo por OS (erro de unidade) e passou a persistir o custo mensal **com vigência** no servidor. Isso destrava a segunda inovação levantada na avaliação do menu Fornecedor: **custo evitável por revisita** — quanto cada operadora gerou de retrabalho, em reais reais, não estimados.

## Achado técnico: o número já existe, e já é sabido que é chute

`src/lib/builders/revisitas.ts:6-11` já calcula um `custoEstimado`, mas sobre constantes explicitamente marcadas como não medidas:

```ts
// Estimativas não calibradas — nenhum destes valores foi medido para esta operação.
// Servem só para dar uma ordem de grandeza até existir custo real por visita técnica
// e uma classificação real de causa (ver ai.revisitasCausa) medindo evitabilidade de fato.
const CUSTO_REVISITA_ESTIMADO  = 180   // R$ fixo, chutado, igual para todo fornecedor
const EVIT_INST_RATE_ESTIMADO  = 0.70  // 70% das revisitas pós-instalação seriam evitáveis
const EVIT_MANUT_RATE_ESTIMADO = 0.50  // 50% das revisitas pós-manutenção seriam evitáveis
```

`custoEstimado = totalRevisitas * 180` — um valor fixo, igual para WES, Instacable e THM, sem relação com o que cada uma custa de fato. O próprio prompt da IA que narra isso (`cabonnet/ai.py:271-273`) instrui o modelo a **nunca chamar esse número de "custo real"**, só de estimativa aproximada — o sistema já sabe que esse número é fraco.

Com a vigência de custo do PR #15, dá para trocar o `180` fixo pelo custo por OS **real e vigente** de cada operadora. É a mesma correção de unidade do PR #15, aplicada a um segundo lugar que tinha o mesmo problema.

### Onde os dados já vivem

- `buildRevisitas(rows, prevRows)` (`revisitas.ts:54`) já roda no mesmo filtro de data global (`OSDataContext.tsx:216`, mesmo `dateFilter` do `uiStore` que `FornecedorPage` usa) — os dois períodos já estão sincronizados, de graça.
- Cada `RevisitEvent` (`revisitas.ts:44`) tem `equipe`, mas **não tem fornecedor**. A linha de origem (`m`/`curr`, a OS da revisita) já carrega `_fornecedor` calculado por `enrichRows` — é só capturar o campo que já existe, não inventar cálculo novo.
- `buildFornecedor` (`extra.ts:14`, corrigido no PR #15) já expõe `kpis.custoPorOs`, o custo real e vigente no período.

## A decisão central: número real vs. número estimado

Isto **não é** um detalhe de implementação — é a mesma escolha de rigor que motivou o PR #15, e vale a pena decidir com a mesma clareza.

### Opção A — Custo de revisita (real, sem estimativa de evitabilidade)

```
custoRevisita[fornecedor] = totalRevisitas[fornecedor] × custoPorOs[fornecedor]
```

100% das revisitas do fornecedor, multiplicadas pelo custo real e vigente daquele fornecedor no período. Nenhum número inventado, nenhuma taxa chutada.

**O que significa:** "a WES gerou R$X em visitas de retorno neste período" — afirmação defensável, verificável, que qualquer pessoa pode reconstruir a partir de dois números que já existem.

**O que não significa:** não é o mesmo que "custo evitável" — nem toda revisita é culpa do fornecedor (cliente pode ter mexido no equipamento, queda de energia, etc.). É o piso do problema, não uma estimativa do que seria economizável.

### Opção B — Custo evitável (com a taxa estimada como multiplicador)

```
custoEvitavel[fornecedor] = custoRevisita[fornecedor] × taxaEvitabilidadeEstimada
```

Reaproveita `EVIT_INST_RATE_ESTIMADO`/`EVIT_MANUT_RATE_ESTIMADO`, que já existem e já são usadas no card agregado de Revisitas.

**O problema:** aplicar uma taxa não calibrada (70%/50%, "chute" segundo o próprio comentário do código) ao custo real e vigente de cada fornecedor produz um número que *parece* preciso — porque metade dele é real — mas continua sendo, na outra metade, uma suposição. É exatamente o padrão de risco do defeito original do PR #15: um número plausível demais para alguém desconfiar, indo direto para conversa de contrato.

### Recomendação

**Opção A como métrica principal.** Mostra "Custo de revisita" (não "evitável"), sem multiplicador de taxa. É consistente com o padrão já estabelecido nesta base de código — o comentário em `RankingTecnicosPage.tsx:13` já registra o princípio: *"nenhum score novo, nenhum peso inventado"*.

**Opção B como overlay opcional, rotulado sem ambiguidade.** Se o produto quiser manter a leitura "evitável" para efeito de conversa qualitativa (não contratual), ela pode aparecer como um segundo número, menor, com `title="Estimativa não calibrada — ver metodologia"`, exatamente como a IA já é instruída a tratá-lo hoje. Nunca como o número principal do card.

Isso é uma escolha de produto, não técnica — registro como pergunta aberta.

## Arquitetura

```
buildRevisitas(rows, prevRows)                    (MODIFICADO)
  │  RevisitEvent ganha campo `fornecedor: Fornecedor`
  │  capturado de r._fornecedor na própria linha da revisita
  ▼
  porFornecedor: { fornecedor, total, taxa }[]     (NOVO, mesmo padrão de porEquipe/porCidade)
  │
  ▼
FornecedorPage.tsx
  │  useOSDerived().derived.revisitas.porFornecedor
  │  cruza com buildFornecedor(...).paineis[i].kpis.custoPorOs (já real, do PR #15)
  ▼
  custoRevisita[fornKey] = porFornecedor[fornKey].total × custoPorOs[fornKey]
```

Nenhuma rota nova, nenhuma tabela nova. É recombinação de dois cálculos que já existem — o mesmo espírito do `RankingTecnicosPage`.

## Frontend

### 1. `src/lib/builders/revisitas.ts` (modificar)

```ts
interface RevisitEvent {
  tipo:        'inst' | 'manut' | 'serv'
  equipe:      string
  cidade:      string
  fornecedor:  Fornecedor    // NOVO — capturado de r._fornecedor na linha de origem
  dias:        number
  cliente:     string
  mes:         string
  data:        string
}
```

Populado no mesmo loop que já monta `revisitEvents` (linhas 104-129), sem nova iteração:

```ts
revisitEvents.push({
  tipo: 'inst', equipe: ..., cidade: ...,
  fornecedor: m._fornecedor,   // já existe na linha, nunca foi lido
  dias, cliente, mes, data: ...,
})
```

Agregação nova, mesmo padrão de `porEquipe`/`porCidade` (linhas 153-170):

```ts
const porFornecedor = [...fornecedorRevMap.entries()]
  .map(([fornecedor, total]) => ({ fornecedor, total }))
  .sort((a, b) => b.total - a.total)
```

`RevisitasData` em `src/lib/types.ts:447` ganha o campo `porFornecedor: { fornecedor: Fornecedor; total: number }[]`.

### 2. `src/features/fornecedor/FornecedorPage.tsx` (modificar)

Dentro de `FornecedorPanel`, novo KPI card ao lado dos já existentes (Total OS, Concluídas, Críticas, SLA, MTTR P50/P90, Taxa Conclusão, Custo/OS):

```
Custo de Revisita
R$ X.XXX
(N revisitas × R$Y/OS)
```

Consome `useOSDerived().derived.revisitas.porFornecedor`, filtrado pelo `fornKey` do painel, multiplicado por `kpis.custoPorOs` (já disponível no mesmo componente).

Se a Opção B for aprovada, um segundo valor menor abaixo, com o disclaimer.

### 3. Testes

`src/lib/builders/revisitas.test.ts` — **não existe ainda** (`buildRevisitas` hoje não tem cobertura própria). Criar, cobrindo pelo menos:
- `porFornecedor` agrega corretamente por `_fornecedor`, não por `equipe` bruta (duas equipes do mesmo fornecedor somam).
- Revisita de fornecedor sem nenhuma OS no período não aparece na lista (sem `total: 0` poluindo).
- Fornecedor com revisitas mas sem custo configurado — `custoRevisita` deve ser `null`, não `0` nem `NaN` (mesma regra de `custoPorOs` no PR #15: ausência de configuração não é custo zero).

## Fora de escopo

- **A ambiguidade REDE/MANUTENCAO como pseudo-fornecedores** (já registrada na avaliação original, item "Descartável"). `getFornecedor()` bucketiza qualquer equipe com "MANUTENC" no nome sob o fornecedor `MANUTENCAO`, mesmo que seja o time de manutenção da própria WES — significa que uma revisita feita pela equipe de manutenção da WES é atribuída ao painel "Manutenção", não ao painel "WES". Este comportamento **já existe** para o custo/OS de hoje; esta entrega herda a mesma ambiguidade, não a introduz nem a resolve. Corrigir isso é separar `_fornecedor` (quem) de `_tipo` (o quê) de verdade — mudança maior, fora desta spec.
- Classificação de causa raiz por IA (`ai.revisitasCausa`) como fonte de evitabilidade por OS. Já existe, mas é sob demanda, limitada a 25 pares por clique, sem persistência e sem um booleano de evitabilidade — é ferramenta qualitativa de investigação, não fonte de dado para agregação estatística confiável.
- Calibrar as taxas de evitabilidade com dado real (ex.: usar o resultado acumulado da classificação por IA para medir, com o tempo, se 70%/50% batem com a realidade). Interessante, mas depende de volume de uso da ferramenta de causa raiz que ainda não existe.

## Risco: `buildRevisitas` não tem nenhum teste hoje

`grep` por `buildRevisitas` em todo `src/**/*.test.{ts,tsx}` não retorna nada — nem direto, nem indireto via componente. É uma função de 241 linhas, com cruzamento cliente×mês, ordenação por data de execução e três tipos de par (inst→manut, manut→manut, serv→manut), rodando sem rede de segurança.

Isso não é motivo para não mexer — é motivo para não mexer **sem** escrever testes de regressão do comportamento atual antes de tocar na função, não só dos casos novos de `fornecedor`/`porFornecedor`. Sem isso, um erro de refatoração na lógica existente (por exemplo, na hora de plugar a captura de `_fornecedor` no loop) passa despercebido.

## Perguntas abertas

1. **Opção A ou B?** — bloqueia a implementação do card.
2. Se B: o disclaimer aparece sempre visível ou só no hover/tooltip? A mesma pergunta vale para o card agregado de Revisitas que já existe hoje e nunca foi resolvida.
3. O card de custo de revisita entra em todos os painéis de fornecedor, ou só nos que têm custo configurado (evitando `—` repetido para quem ainda não cadastrou)?
