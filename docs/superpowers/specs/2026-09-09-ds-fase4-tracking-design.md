# DS Fase 4 — o espaçamento entre letras entra na escala

**Data:** 2026-09-09
**Status:** aprovado, aguardando plano de implementação
**Eixo:** tipografia (fecha o que a Fase 2 deixou aberto)

---

## Onde estamos

O design system foi substituído em 2026-09-01 (laranja `#FF5A1F`, dois temas). Depois da migração vieram três fases de consolidação, cada uma pegando **um eixo**, tirando do ad-hoc, virando token, com teste que cobra e catraca que desce:

| Fase | Eixo | Resultado |
|---|---|---|
| 1 | Arquitetura de token | três camadas: `--p-*` primitivo → `--c-*` semântico → componente |
| 2 | Escala tipográfica | tamanho, peso e altura de linha viram degraus nomeados |
| 3 | Bordas | três pesos como token; a baseline vira catraca com teto por contador |

A Fase 4 fecha o buraco da Fase 2: **`letterSpacing` ficou de fora da escala.**

## O diagnóstico

Há 167 valores arbitrários de tracking no `src`, em 47 arquivos. Distribuídos assim:

```
79× tracking-[0.05em]     13× tracking-[0.07em]      5× tracking-[0.08em]
26× tracking-[0.06em]     10× tracking-[0.6px]       2× tracking-[0.03em]
16× tracking-[0.04em]      9× tracking-[0.09em]     + cauda
```

Seis valores dominantes. Medido o contexto de cada um, **todos aparecem no mesmo papel**:

```
text-caption + uppercase + font-bold + text-muted
```

Ou seja: o rótulo micro em caixa alta — cabeçalho de seção, cabeçalho de coluna de tabela, legenda de KPI. Um papel, seis espaçamentos.

A prova de que é deriva e não decisão está nos próprios primitivos de UI:

| Componente canônico | tracking |
|---|---|
| `components/ui/SectionLabel.tsx` | `0.09em` |
| `components/ui/SectionTitle.tsx` | `0.06em` |
| `components/ui/StatCard.tsx` | `0.04em` |

Três primitivos, mesmo papel, três valores. Se fosse desenho, estariam iguais. Os valores também estão **espalhados** por 2 a 13 arquivos cada — nenhuma concentração que indicasse intenção.

## A decisão: um papel, um token

```js
// tailwind.config.js
letterSpacing: {
  label: 'var(--ls-label)',
}
```

```css
/* index.css — camada semântica, junto dos --c-* */
--ls-label: 0.05em;
```

**Por que `0.05em`:** é a pluralidade absoluta (79 dos 167) e é tipograficamente correto para caixa alta em tamanho `caption` — caixa alta pequena precisa de respiro, e 0.05em é o meio da faixa em uso (0.04–0.09).

**Por que um token e não uma escala.** A proposta inicial era colapsar em 3 ou 4 tokens. O dado desmentiu: existe um papel, não uma família. Uma escala de tracking aqui seria inventar distinção que o produto não faz.

### Alternativa considerada e rejeitada

**Dois tokens** — `tracking-label` (0.05em) e `tracking-wide` (0.09em), preservando a aparência atual do `SectionLabel`. Colapsaria 6 valores em 2 e quase nada mudaria na tela.

Rejeitada porque a diferença entre 0.05em e 0.09em nunca foi decidida. Preservá-la seria **institucionalizar o acidente** — transformar deriva em token é dar-lhe autoridade que ela não tem. O usuário confirmou que o `SectionLabel` mais estreito não incomoda.

### O que não entra

O lado **negativo** da escala fica como está. A Fase 2 já embutiu `letterSpacing` nos `fontSize` de `headline` (`-0.015em`) e `readout*` (`-0.025em` a `-0.035em`). Mexer ali reabriria decisão fechada.

Nada de `fontSize`, peso ou cor. Um eixo por fase.

## A migração

47 arquivos, 167 substituições.

1. **Os três primitivos primeiro** — `SectionLabel`, `SectionTitle`, `StatCard`. Concentram o maior alcance visual; migrá-los antes reduz o que sobra na varredura.
2. **Passada mecânica** — os seis valores viram `tracking-label` onde o contexto é `text-caption + uppercase`. São ~163 dos 167.
3. **Os quatro fora do papel**, tratados um a um:

| Caso | Ocorrências | Decisão |
|---|---|---|
| `text-caption tracking-[0.06em]` sem caixa alta | 2 | mesmo papel → `tracking-label` |
| `tracking-[-0.015em]` em `text-title` | 1 | **redundante** — `headline` já traz esse valor; remove |
| `font-headline text-title tracking-[0.08em]` | 1 | único deliberado (marca); fica, entra na baseline com justificativa escrita |

## O que muda na tela

Isto **não é refatoração invisível**:

- 79 usos ficam idênticos (já eram `0.05em`)
- ~88 estreitam ou alargam por frações de em
- o mais visível é o `SectionLabel`, de `0.09em` para `0.05em`, presente em várias telas

É o ganho pretendido — parar o ruído —, mas exige conferência visual nos dois temas depois de aplicado.

## O que segura

Contra o padrão das fases anteriores, **não se cria arquivo de teste novo.** A Fase 3 criou `bordaTokens.test.ts` para o eixo dela; tracking entra em `src/lib/typeScale.test.ts`, no bloco que já existe:

```
describe('a escala é fechada')
  ✓ nenhum tamanho de fonte avulso sobrou no JSX
  + nenhum tracking avulso sobrou no JSX          ← Fase 4
```

O motivo é conceitual: **isto não é eixo novo, é a metade que faltou da Fase 2.** Registrar em arquivo separado diria que são assuntos diferentes, e não são.

Três asserções:

1. **Nenhum `tracking-[` avulso no JSX** — mesma varredura que a Fase 2 faz para tamanho.
2. **O token está declarado** e resolve nos dois temas.
3. **A exceção deliberada é única** — se aparecer uma segunda `tracking-[`, o teste reprova e obriga a decidir se virou papel novo.

## Impacto na catraca

```
valoresArbitrarios: 454 → 288
```

166 dos 167 saem — o único tracking deliberado (marca) permanece.

A maior queda de qualquer fase até aqui. Roda-se `npm run audit:ds:catraca` ao final para baixar o teto ao real.

> **Nota:** o teto está hoje em 454 porque a PR #37 devolveu uma vaga (`min-w-[1180px]` → `min-w-max`). Antes dela era 455, com folga zero.

## Fase 5: a candidata

O plano original de 19 tasks (`2026-09-01-design-system-substituicao-completa.md`) foi **apagado do disco** no commit `533af26` e está recuperável só pelo histórico. Ele está **parcialmente obsoleto**: as Fases 1–3 mudaram a arquitetura por baixo dele. Exemplo concreto — a Task 19 manda `grep -rn -- "--c-" src` esperando saída vazia, mas `--c-*` é hoje a camada semântica legítima, com 236 ocorrências corretas.

O que dele continua válido é a **Task 19: "rota a rota, nos dois temas"** — percorrer as 15 rotas conferindo contraste, distinção de superfície, borda visível, KPI legível, série de gráfico distinguível, estado vazio e estado de carregamento. **Nunca foi feita.**

É a candidata natural a Fase 5, depois que a catraca tiver descido — e ela é também onde a mudança visual desta Fase 4 se verifica de fato.

Dívida restante depois da Fase 4, para dimensionar as próximas:

| Item | Quantidade |
|---|---|
| Valores arbitrários de dimensão | 178 |
| Hex fora de token (tolerados) | 99, em 23 arquivos |
| `white/` hardcoded | 13 |
| Classes decorativas antigas | 2 |
| Seletores `.light` possivelmente mortos | 4 |

## Verificação

- `npx tsc --noEmit`, `npm run lint`, `npm run audit:ds` limpos
- `npm test` — a suíte inteira, com as asserções novas em `typeScale.test.ts`
- `npm run build` — o token emitido e resolvendo nos dois temas
- Conferência visual do `SectionLabel` nas telas onde aparece, nos dois temas
