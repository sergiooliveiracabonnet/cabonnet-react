# Plano P2 — Painéis analíticos acionáveis e consistentes

## 1. Contratos em vermelho

- testar o novo cabeçalho compartilhado: título `h2`, contexto e indicação de ação;
- testar Fluxo de OS como heading de nível 2;
- testar Meta do Mês como heading de nível 2;
- testar clique e callback de Ritmo por Equipe;
- testar clique e callback de Fornecedores.

## 2. Primitivo de cabeçalho

- implementar `DashboardPanelHeader` sobre `SectionLabel`;
- manter layout compacto, responsivo e sem altura artificial;
- usar `ArrowUpRight` e `Abrir OS` apenas quando há drill-down.

## 3. Painéis acionáveis

- aplicar o cabeçalho em Aging, Cidades e Composição;
- converter linhas de Ritmo e Fornecedores em botões quando recebem callback;
- acrescentar nomes acessíveis explícitos aos alvos clicáveis.

## 4. Integração do dashboard

- filtrar OS do período por equipe com comparação normalizada;
- filtrar OS do período por fornecedor usando `FORN_LABEL`;
- abrir os resultados no modal já existente;
- padronizar os títulos de Fluxo, Meta e Qualidade sem alterar cálculos.

## 5. Validação

- executar os testes focados até o verde;
- executar suíte completa, lint e build;
- validar mobile 375 × 812 e desktop 1.280 × 900 no localhost:3000;
- confirmar modal de equipe e fornecedor, sem overflow, sem erros e dentro dos limites de altura;
- remover artefatos temporários de QA.

