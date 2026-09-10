# DS Fase 6a — a paleta de acento, medida

## Contexto

Segunda etapa do replantio do design system de 2026-09-01 sobre a fundação das Fases 1 a 5. A Fase 5 migrou superfícies, borda, texto e sombras, e removeu o bloco `Cabonnet Control Surface` que anulava a camada semântica desde agosto. Esta fase cuida dos acentos.

A Fase 6 original — acentos mais a auditoria dos 564 usos de `primary` — foi dividida em duas ao se descobrir que ela continha **duas** auditorias, não uma. Ver "Por que 6a e 6b".

## Por que 6a e 6b

`orange` hoje é cor de status, não de marca. Os 124 usos são "Sem conexão com a Anthropic", a categoria MANUTENCAO, alertas — e em 30 arquivos aparecem lado a lado com `green` e `red`.

O design system não tem um laranja de status: sua paleta é orange (marca), blue, green, yellow, red, e o aviso lá é amarelo. Virar `primary` para `#FF5A1F` sem mexer em `orange` poria dois laranjas confundíveis na mesma tela — um avermelhado de marca e um âmbar de status, botão primário ao lado de badge de aviso.

A Fase 6 portanto contém duas reclassificações: 564 usos de `primary` e 124 de `orange`. Juntá-las com a troca de paleta daria um PR de ~200 ocorrências reescritas em ~50 arquivos mais a paleta inteira.

- **6a (esta):** os valores de acento, os tokens novos e o teste. Mecânica, sem reclassificação.
- **6b:** as duas auditorias e a virada de `primary` para laranja. É onde mora o risco.

## Escopo

**Entra:** valores de acento nos dois temas; `--c-blue` nasce; `--chart-1..6` nascem; `--kpi-ink-*` nascem; o teste de contraste passa a cobrir acento; remoção de dois tokens semânticos mortos.

**Fica de fora:** a virada de `--c-primary`, as duas auditorias, os componentes, o shell.

`--c-primary` **não muda de valor nesta fase.** Continua azul até a 6b. É isso que torna a 6a mecânica: nenhuma ocorrência no JSX muda de significado.

## O problema medido

Acento não é usado só como texto. Hoje são 198 `text-primary`, 153 `bg-primary`, 138 `border-primary` e 71 `ring-primary`. A barra de 4.5:1 da WCAG vale para texto; borda e preenchimento têm regras próprias. Cobrar 4.5:1 de tudo escureceria a paleta inteira e mataria o laranja de marca — o mesmo erro que a Fase 5 quase cometeu com a borda.

Medindo cada acento contra **todas** as superfícies, as duas paletas candidatas reprovam:

| Tema | Reprovam hoje | Reprovariam com os valores do DS |
|---|---|---|
| Claro | green 2.88, cyan 3.22, red 4.23, yellow 4.31 | orange **2.73**, green 1.93, yellow 1.35, red 3.95, purple 4.21 |
| Escuro | primary 4.43 | blue 4.37 |

O padrão é o mesmo nas duas: a falha está no tema claro, onde acento vívido sobre quase-branco não alcança 4.5:1. Não é regressão do design system — é uma lacuna que ele também tem, porque seus comentários mediam cada cor contra um fundo só.

## A regra: um token por acento por tema, servindo aos dois papéis

Cada valor precisa passar **como texto sobre a pior superfície** e **aceitar tinta como preenchimento**. Um único valor por tema consegue as duas coisas:

| Acento | Claro | como texto | tinta branca | Escuro | como texto |
|---|---|---|---|---|---|
| orange | `#CB3500` | 4.54:1 | 5.19:1 | `#FF5A1F` | 5.22:1 |
| blue | `#1F61EC` | 4.62:1 | 5.28:1 | `#5084F0` | 4.58:1 |
| green | `#0B7B6D` | 4.52:1 | 5.16:1 | `#11C7B0` | 7.62:1 |
| yellow | `#826A06` | 4.58:1 | 5.23:1 | `#F5C915` | 10.28:1 |
| red | `#DD0000` | 4.51:1 | 5.15:1 | `#FF6B6B` | 5.87:1 |
| purple | `#7245FF` | 4.58:1 | 5.24:1 | `#9A7AFF` | 5.12:1 |
| cyan | `#0A7888` | 4.53:1 | 5.18:1 | `#22D3EE` | 9.02:1 |
| teal | `#197A6D` | 4.54:1 | 5.19:1 | `#2DD4BF` | 8.75:1 |

**De onde vêm.** Os valores escuros são os do design system, com uma correção: o azul sobe de `#4A80F0` para `#5084F0`, mais 2% de luminosidade, porque `#4A80F0` dá 4.37:1 sobre a superfície ativa e reprova. Os valores claros são derivados escurecendo o valor do design system, preservando matiz e saturação, até passar 4.5:1.

Escurecer o claro é o que o projeto **já faz**: hoje `--c-orange` aponta para `--p-orange-700` no claro e `--p-orange-400` no escuro. O que muda é passar a fazer isso medido em vez de por intuição.

Isso conserta 4 reprovações que existem hoje no tema claro e 1 no escuro.

## A tinta do KPI inverte em relação ao design system

O design system declara `--kpi-ink-*` porque descobriu que "branco reprova em verde e amarelo". Com os valores acima a conclusão se inverte, e por um motivo coerente:

| Tema | Tinta | Razão |
|---|---|---|
| Claro | branco em todos | os acentos foram escurecidos para passar como texto |
| Escuro | `#171717` em todos | os acentos seguem vívidos |

Medido, com folga em todos os casos: 5.16:1 a 5.28:1 no claro, 5.04:1 a 11.31:1 no escuro. A alternativa reprova em todos os oito (1.59:1 a 3.56:1), o que torna a escolha inequívoca em vez de caso a caso.

A tinta é sempre o oposto da luminosidade do acento, e é uniforme por tema.

## `--chart-1..6` é escala separada, de propósito

O design system declara os tokens de gráfico como "escala categórica independente da semântica", e eles ficam com os valores vívidos nos dois temas:

| Token | Claro | Escuro |
|---|---|---|
| `--chart-1` | `#FF5A1F` | `#FF5A1F` |
| `--chart-2` | `#2864E8` | `#4A80F0` |
| `--chart-3` | `#12C4AE` | `#11C7B0` |
| `--chart-4` | `#FBCB12` | `#F5C915` |
| `--chart-5` | `#E03131` | `#FF6B6B` |
| `--chart-6` | `#7C4DFF` | `#9A7AFF` |

Eles **não** seguem os valores escurecidos dos acentos: uma série de gráfico é preenchimento ou traço, não texto, e escurecê-la custaria a distinção entre séries sem ganhar legibilidade de leitura. Por isso também não são cobrados em 4.5:1.

Nascem sem consumidor — a Fase 7 os usa. O mesmo vale para os `--kpi-ink-*`.

## Limpeza que cabe aqui

`--c-pink` e `--c-primary-light` têm **zero usos** no JSX. `--c-primary-dark` tem 1.

Nenhum teste pega isso: `todo primitivo declarado é usado por alguém` olha apenas primitivos consumidos pela camada semântica, não tokens semânticos consumidos pelo JSX. Os dois de zero uso saem, e entra a asserção correspondente.

`--c-primary-dark` fica, por ter consumidor.

## O teste

Estende o bloco de contraste do `designTokens.test.ts`, criado na Fase 5.

1. **Todo acento atinge 4.5:1 como texto sobre todas as superfícies**, nos dois temas. A lista de acentos é derivada dos nomes declarados, como a de superfícies — acento novo entra na varredura sozinho.
2. **Todo `--kpi-ink-*` atinge 4.5:1 sobre o acento correspondente.** O par é derivado do sufixo: `--kpi-ink-orange` é medido contra `--c-orange`.
3. **As seis cores de gráfico são distintas entre si** em cada tema. Pega o erro de copiar-colar que deixa duas séries com a mesma cor — defeito que não quebra nada e some na tela.
4. **Todo token semântico de acento é consumido por alguém no JSX.** Fecha o buraco que deixou `--c-pink` e `--c-primary-light` vivos sem uso.

Duas isenções explícitas, porque sem elas as asserções se contradizem:

- Os tokens de gráfico ficam fora da asserção 1 — não são texto.
- `--chart-1..6` e `--kpi-ink-*` ficam fora da asserção 4 — nascem nesta fase sem consumidor, para a Fase 7 usar. A isenção é nominal, por prefixo, e some quando a Fase 7 os consumir.

## Verificação

- `npx tsc --noEmit` e `npm run lint` limpos
- `npm test` — a suíte inteira, com as asserções novas
- `npm run audit:ds` — OK, sem pedir catraca; esta fase troca valor de token, não conta de valores arbitrários
- `npm run build` — os tokens novos emitidos e resolvendo nos dois temas
- Conferência visual nos dois temas

Sobre a conferência: no tema claro, verde, ciano, vermelho e amarelo **escurecem de forma perceptível**. É o preço de passar AA e é o objetivo declarado da fase. No escuro a mudança é pequena — só o azul, em 2%.

## Fora de escopo, registrado para a 6b

- A auditoria dos 564 usos de `primary`. O inventário classificado de 995 linhas de 2026-09-01 (`1c95e82`, na branch de arquivo) cobre 552 deles e tem 98% de aderência ao código atual: 69 de 69 arquivos ainda têm `primary`, e 66 têm contagem idêntica. Restam 12 ocorrências a classificar — `DateFilterBar` +2, `UsuariosPage` +1, `OcorrenciasSinal` +2, mais `slaEscala.ts` (3), `PonMedicoesModal` (3) e `PonsTratadas` (1).
- A auditoria dos 124 usos de `orange`, separando marca de status. Os que forem aviso vão para `yellow`; os que forem categoria ganham cor da escala de gráfico.
- A virada de `--c-primary` para o laranja de marca, que só faz sentido depois das duas.
