# Design: Custo de revisita por fornecedor

**Data:** 2026-07-31
**Status:** Implementado e mergeado (PR #16, commit `2b7954f` em `main`). Opção A decidida, `buildRevisitas` com 38 testes de regressão, `porFornecedor` + card "Custo Revisita" na `FornecedorPage`. Achado #1 (nomenclatura MANUTENCAO) verificado e **resolvido** — não era um bug real. Achado #2 (equipe de Rede) confirmado e **permanece sem correção**, por decisão de escopo.

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

### Decisão: Opção A

Confirmada pelo dono do produto em 2026-07-31. O card mostra "Custo de revisita" (não "evitável"), sem multiplicador de taxa — consistente com o princípio já registrado em `RankingTecnicosPage.tsx:13`: *"nenhum score novo, nenhum peso inventado"*.

A Opção B (overlay com a taxa estimada, rotulado sem ambiguidade) fica descartada para esta entrega. Se o produto quiser essa leitura qualitativa no futuro, é uma adição incremental, não uma mudança na métrica principal.

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

## Correção de domínio (2026-07-31)

A caracterização original deste documento — "MANUTENCAO é um tipo de OS tratado como pseudo-fornecedor" — estava **incompleta**. Segundo o dono do produto:

- WES, Instacable e THM são equipes que fazem instalação, manutenção **e** serviço com o mesmo código de frente — não trocam de fornecedor entre um tipo de OS e outro. Confirmado por teste (`transform.test.ts`, "mesma equipe permanece no mesmo fornecedor independente do tipo de serviço").
- A equipe de Rede faz serviços de rede, instalação e manutenção quando necessário.
- **MANUT 02, MANUT 04 e MANUT 77 são uma equipe de qualidade real e distinta** — fazem qualquer tipo de OS e ainda auditam a execução de THM, WES e Instacable. Não é um "tipo de OS" mal rotulado como fornecedor; é um fornecedor de verdade, só que com um nome que colide com a palavra usada para classificar o *tipo* de serviço em outras partes do sistema.

Isso não elimina a ambiguidade estrutural — ela só muda de natureza. Ver os dois achados abaixo.

## Achados durante os testes

Escrever os testes de regressão (pedido explícito do usuário, antes de qualquer mudança em `buildRevisitas`) expôs dois riscos concretos. Um se confirmou como falso alarme; o outro é real e permanece sem correção.

### 1. `getFornecedor` exige a substring ASCII "MANUTENC", sem acento — VERIFICADO, NÃO É BUG

`transform.test.ts`, bloco `getFornecedor`: `getFornecedor('MANUT 02')` → `'OUTRO'`. `getFornecedor('EQUIPE MANUTENÇÃO 02')` → `'OUTRO'` (cedilha/til não normalizam para ASCII em `.toUpperCase()`). Isso levantou a hipótese de que as equipes de qualidade (MANUT 02/04/77) pudessem estar invisíveis em todos os painéis de Fornecedor, já em produção desde o PR #15.

**O usuário confirmou o nome real em 2026-07-31: `"03- VAL - MANUTENCAO F02"`** (mesmo padrão para F04/F77) — por extenso, sem acento. `getFornecedor('03- VAL - MANUTENCAO F02')` → `'MANUTENCAO'`, confirmado em teste. **O risco não se concretiza: nada estava quebrado.** O código "F02" embutido no nome também não interfere — `/MANUTENC/` é testado antes da extração de código de frente, então a comparação com `WES_CODES`/`INST_CODES`/`THM_CODES` nunca chega a rodar para essas linhas.

O regex continua frágil para nomes hipotéticos futuros fora desse padrão (mantido como teste de guarda-corpo), mas isso deixou de ser uma ação pendente.

### 2. O detector de revisita é cego para a equipe de Rede — CONFIRMADO, SEM CORREÇÃO

`getEquipeTipo` testa `/\bREDE\b/` no **nome da equipe** antes de olhar `tiposervico` — então qualquer OS da equipe de Rede recebe `_tipo = 'REDE'`, mesmo quando é uma instalação ou manutenção de verdade (confirmado em teste: `getEquipeTipo('03-VAL - REDE FIBRA', 'MANUTENCAO')` retorna `'REDE'`, não `'MANUTENCAO'`).

`buildRevisitas` só bucketiza `_tipo` em `'INSTALACAO' | 'MANUTENCAO' | 'OUTRO'` no loop que monta os pares — `'REDE'` não cai em nenhum dos três e é descartado silenciosamente. Resultado: a equipe de Rede faz instalação e manutenção "quando é preciso", exatamente como o usuário descreveu, mas **nenhuma revisita dela jamais aparece** em taxa, `porEquipe`, `custoEstimado` ou, com esta entrega, `porFornecedor`/custo de revisita.

Travado em teste: `revisitas.test.ts`, "DOCUMENTA o achado: revisita da equipe de Rede não é detectada, porque `_tipo` trava em REDE".

**Consequência, já implementada:** o card de "Custo de revisita" da Rede não aparece — ver "Card ausente, não card mentindo" no PR #16. Não porque a Rede não tem retrabalho, mas porque o sistema não consegue enxergá-lo hoje. Um card mostrando R$0 seria pior que nenhum card: afirmaria implicitamente "Rede não tem revisita", o que não é verdade.

## Fora de escopo

- **Corrigir o achado #2.** Exige decisão de produto (a Rede ganha pareamento próprio de revisita? `_tipo` e `_fornecedor` precisam ser desacoplados de vez?), não é ajuste mecânico. Fica para uma entrega própria.
- Classificação de causa raiz por IA (`ai.revisitasCausa`) como fonte de evitabilidade por OS. Já existe, mas é sob demanda, limitada a 25 pares por clique, sem persistência e sem um booleano de evitabilidade — é ferramenta qualitativa de investigação, não fonte de dado para agregação estatística confiável.
- Calibrar as taxas de evitabilidade com dado real (ex.: usar o resultado acumulado da classificação por IA para medir, com o tempo, se 70%/50% batem com a realidade). Interessante, mas depende de volume de uso da ferramenta de causa raiz que ainda não existe — e ficou ainda menos prioritário depois da decisão pela Opção A, que não usa taxa nenhuma.

## Risco coberto: `buildRevisitas` tinha zero testes, agora tem 38

`buildRevisitas` nunca teve teste (`grep` por ela em `src/**/*.test.{ts,tsx}` não retornava nada). `src/lib/builders/revisitas.test.ts` cobre a função inteira: os três tipos de par, isolamento por cliente-mês, `porEquipe`/`porCidade`/`porFornecedor`, clientes crônicos, `evitaveis`/`custoEstimado` na fórmula legada, distribuição por dias, tendência, narrativa, e o cenário de domínio WES/Instacable/THM/Rede fazendo os três tipos de OS. Os dois achados também viraram teste, não só comentário — incluindo o teste com o nome real confirmado das equipes de qualidade, em `transform.test.ts`.

## Perguntas abertas — todas resolvidas

1. ~~Opção A ou B?~~ — **Opção A.**
2. ~~O achado #1 é real?~~ — **Não.** Nome real confirmado (`"03- VAL - MANUTENCAO F02"`), casa corretamente com `getFornecedor`. Nenhuma correção necessária.
3. ~~O achado #2 bloqueia o card de Rede?~~ — **Sim, e foi tratado com o caminho (a):** o card não aparece para Rede. Implementado de forma genérica — não é um `if (fornKey === 'REDE')` hardcoded, é a regra "card só existe quando há revisita detectada e custo configurado" se aplicando ao caso em que a Rede nunca tem revisita detectada.
4. ~~O card entra em todos os painéis ou só nos com custo configurado?~~ — **Só nos que têm as duas condições:** revisita detectada e custo configurado. Mesma resposta da pergunta 3, mesmo mecanismo.
