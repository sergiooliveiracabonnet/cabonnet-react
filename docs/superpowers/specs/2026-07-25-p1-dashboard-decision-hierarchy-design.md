# P1 — Hierarquia decisória do dashboard

Data: 2026-07-25

## Problema

O dashboard atual tem dados úteis, mas a ordem visual favorece apresentação em vez de decisão. O score e a entrada vazia de IA ocupam a maior parte da primeira dobra; riscos e ações chegam tarde.

Linha de base medida em Chromium com dados reais:

- Desktop 1440 × 1000: `Alertas & Risco` começa em y=542; documento tem 2.322 px.
- Mobile 375 × 812: `Alertas & Risco` começa em y=986; documento tem 5.109 px.
- A primeira dobra contém somente 2 ações no desktop e 1 no mobile.
- O score pode comunicar “Bom” enquanto há SLA em atenção e OS críticas, criando conflito semântico.
- A caixa vazia “Análise Operacional” exige contexto antes de entregar valor e empurra exceções para baixo.
- Risco é repetido em pills, cards, projeção e alertas, mas sem uma fila visual única de prioridades.

## Objetivo

Fazer a primeira dobra responder, nesta ordem:

1. O que exige ação agora?
2. A operação está melhorando ou piorando?
3. Qual é o tamanho e o fluxo da fila?
4. Onde clicar para agir?

## Fora de escopo

- Alterar builders, regras de SLA ou filtros de cidades.
- Criar novos endpoints ou novos cálculos de negócio.
- Remover drill-downs, IA, gráficos ou painéis existentes.
- Trocar a identidade visual inteira ou a fonte Inter local do P0.
- Corrigir as vulnerabilidades npm registradas em `.memory/security-backlog.md`.

## Arquitetura de informação

### Desktop

```text
┌──────────────────────────────────────────────────────────────────────┐
│ alerta de cluster/anomalia, apenas quando existir                   │
├───────────────────────────────────────┬──────────────────────────────┤
│ PULSO OPERACIONAL                     │ PRIORIDADES AGORA            │
│ score compacto + narrativa nativa     │ críticas              abrir │
│ entradas · saídas · saldo · projeção  │ sem equipe            abrir │
│ IA como ação secundária recolhida     │ roteirização          abrir │
│                                       │ pendentes             abrir │
│                                       │ reagendadas           abrir │
│                                       │ projeção 24/48h        abrir │
├───────────────────────────────────────┴──────────────────────────────┤
│ tendência e principais fatores                                      │
├──────────────────────────────────────────────────────────────────────┤
│ CAPACIDADE & ENTREGA — cinco KPIs                                    │
└──────────────────────────────────────────────────────────────────────┘
```

### Mobile

```text
┌─────────────────────────────┐
│ PRIORIDADES AGORA           │  ← primeiro bloco acionável
│ linhas compactas clicáveis  │
├─────────────────────────────┤
│ PULSO OPERACIONAL           │
│ score + narrativa           │
│ métricas em grade 2 × 2     │
│ IA recolhida                │
├─────────────────────────────┤
│ tendência                   │
├─────────────────────────────┤
│ CAPACIDADE & ENTREGA        │
└─────────────────────────────┘
```

## Componentes

### `DashboardCommandCenter`

- Novo componente apresentacional que recebe os KPIs já calculados.
- Exibe `Prioridades agora` e `PulsoHero` lado a lado no desktop.
- Usa ordem CSS para colocar prioridades antes do pulso abaixo de 1024 px.
- Cada prioridade é um botão semântico com valor, contexto e indicação textual `Abrir`.
- Integra a projeção 24/48h como ação do mesmo painel, eliminando uma faixa redundante posterior.
- Não recalcula regras de negócio e não acessa contexto global.

### `PulsoHero`

- Gauge reduzido de 100 para 84 px e tratado como contexto, não como protagonista isolado.
- Narrativa nativa sempre visível antes de qualquer solicitação de IA.
- Entrada de contexto de IA recolhida por padrão atrás do botão `Enriquecer com IA`.
- Quatro métricas de fluxo compactas, sem repetir sparklines já existentes em `Fluxo de OS`.
- Mantém popover de composição do score, resultados de IA e tendência.

### `DashboardPage`

- Continua como container responsável por dados, filtros e modais.
- Remove a seção duplicada `Alertas & Risco` e o `ProjecaoRiscoPanel` separado.
- Mantém os cinco KPIs de desempenho sob o novo título `Capacidade & Entrega`.
- Mantém todos os painéis analíticos posteriores.

## Sistema visual

- Base: dark OLED existente, Inter Variable local e tokens atuais.
- Sem jornada horizontal, fontes decorativas, gradientes chamativos ou cards com escala no hover.
- Cor sempre acompanhada por ícone/texto de estado.
- Valores: 24–30 px; rótulos: escala modular já existente; corpo mobile mínimo de 16 px.
- Bordas semânticas discretas e superfícies com contraste suficiente.
- Animações apenas por transform/opacity, respeitando `prefers-reduced-motion` já existente.

## Acessibilidade e interação

- `Prioridades agora`, `Pulso operacional` e `Capacidade & Entrega` são headings `h2`.
- Linhas acionáveis são `button`, têm foco visível e alvo mínimo de 44 px no mobile.
- Painel do score mantém nome acessível e `aria-describedby` quando há breakdown.
- IA recolhida usa `aria-expanded` e rótulo inequívoco.
- Não depender apenas de vermelho/verde para significado.

## Critérios de aceitação

- `Prioridades agora` aparece antes de `Pulso operacional` no DOM mobile e na primeira dobra.
- Desktop: heading de prioridades em y ≤ 220 e documento ≤ 2.150 px com os dados da linha de base.
- Mobile: heading de prioridades em y ≤ 220 e documento ≤ 4.600 px.
- Pelo menos três ações de prioridade aparecem na primeira dobra mobile.
- A narrativa nativa é visível sem clicar em IA; textarea não existe no DOM até expansão.
- Não existe heading `Alertas & Risco` no estado final carregado.
- Projeção 24/48h continua acionável quando houver dados.
- Drill-down de cada KPI mantém os mesmos filtros e modal.
- Sem overflow horizontal, erros de console ou falhas de rede em 375, 768, 1280 e 1440 px.
- Testes, lint e build aprovados.

