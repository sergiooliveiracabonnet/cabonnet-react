# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Supervisor de operação (primário).** Fica com o sistema aberto a jornada inteira, em desktop. É quem decide realocar equipe, cobrar fornecedor e destravar OS. O trabalho dele no momento em que olha a tela é **decidir e agir agora** — encontrar o que está fora do lugar e intervir.

**Sala de operação / painel de parede.** O modo NOC (`/noc`, única rota fora do `AppLayout`, sem autenticação) roda em tela grande, lido de longe, sem interação.

Outros papéis com acesso, definidos no backend por permissão de módulo: `gestor`, `supervisor`, `operador`, `viewer`, `fornecedor`. A conta de fornecedor é deny-by-default e enxerga apenas o recorte dela.

Uso em celular e tablet **não** é cenário de trabalho. Confirmado com o usuário em 2026-09-09.

## Product Purpose

Painel de operação de um provedor de internet (ISP). Mostra ordens de serviço em tempo quase real, desempenho de equipe, SLA, fila, monitoramento Juniper/PPPoE e fechamento de nota por fornecedor. Sucesso é o supervisor enxergar a exceção antes que ela vire prejuízo — equipe parada, SLA estourando, fila crescendo, VT em risco.

## Positioning

O dado não nasce aqui: vem do ERP da operadora via Grafana (datasource PostgreSQL). O que este produto faz e o painel do Grafana não faz é **transformar consulta em ação** — deriva SLA, aging, ritmo e projeção a partir do CSV cru, e leva a exceção ao grupo de Telegram certo, recortada pela região responsável.

## Operating Context

- **Duas regiões (clusters).** Vale do Paraíba (SJC, Caçapava, Taubaté, Tremembé, Pindamonhangaba) e Adamantina (Adamantina, Osvaldo Cruz, Lucélia, Mariápolis, Inúbia Paulista, Flórida Paulista, Pacaembu). OS de outras cidades são ignoradas. Contas podem ser amarradas a uma região.
- **Operadoras de campo por frente de trabalho.** INSTACABLE, WES, THM no Vale; ADA em Adamantina. A frente (`F01`, `F 01`…) identifica a equipe, e o prefixo (`- VAL -`, `- ADA -`) identifica a região.
- **O Telegram é a outra metade do produto.** Seis monitores contínuos e oito relatórios agendados disparam para grupos por região e por operadora. O bot responde comandos de consulta. Muita decisão acontece lá, não na tela.
- **Ritmo do dia.** Marcos fixos: briefing 7h, KPI 8h, executadas 10/13/16/19h, pulso 12h, ritmo 14h, equipes paradas 15h, pendentes 17h, fechamento 18h.
- Produção roda em Docker Compose em `/opt/cabonnet`, servidor unificado Node + Python na porta 3000.

## Capabilities and Constraints

- 14 áreas: dashboard, ordens, ERP (ordens/equipes/dispatch/alertas/rede), gráficos, cidades, campo, fornecedor, Juniper, fechamento, mapa, NOC.
- Todo dado derivado é calculado num único provider (`OSDataContext`) e consumido via `useOSDerived()`.
- Tailwind fica na **3.4** por decisão explícita. shadcn/ui e Tailwind v4 estão fora de escopo.
- Ícones vêm **exclusivamente** do Phosphor. Emoji só fora da UI (Telegram, PDF).
- Backend em `snake_case`, frontend em `camelCase`, conversão nos interceptors.
- Todo timestamp é UTC; conversão para local só na exibição.

## Brand Commitments

Nome: **Cabonnet**. Não há manual de marca no repositório.

A direção visual está **em aberto**. A decisão de 2026-09-01 pelo laranja `#FF5A1F` foi reaberta pelo usuário em 2026-09-09 e não é mais vinculante — ela nunca chegou ao `main` de qualquer forma.

Precedente que futuras propostas precisam respeitar: em 2026-07-22 um restyle navy+teal foi aprovado no papel, implementado, e **rejeitado pelo usuário ao ver rodando** ("ficou horrível"), sendo revertido em dois commits. Direção decorativa não se presume aprovada por analogia.

## Evidence on Hand

- Dados reais de produção via Grafana; nenhum dado sintético no repositório.
- Trabalho de design system anterior: spec e plano de 19 tasks de 2026-09-01, mais 34 commits na branch `feature/design-system-2026-09`. **Essa branch não tem ancestral comum com o `main`** — históricos não relacionados. O conteúdo é material de consulta, não algo que se mergeia.
- Não existem: pesquisa com usuário, teste de usabilidade, métrica de uso, manual de marca. Não inventar nenhum deles.

## Product Principles

1. **A exceção é o conteúdo.** O que está dentro do esperado pode recuar; o que está fora tem que saltar. O supervisor não vem ler o painel, vem achar o problema.
2. **Duas distâncias de leitura.** Mesa e parede. O que serve a 60cm não serve a 4 metros, e as duas são cenário de trabalho real.
3. **A região recorta tudo.** Todo número, alerta e comando pertence a um cluster. Confundir região é o erro mais caro do sistema.
4. **A tela e o Telegram contam a mesma história.** Se um alerta existe num, precisa existir no outro com o mesmo nome e a mesma severidade.
5. **Nada de restyle sem ver rodando.** O precedente de julho custou dois reverts. Direção nova se decide olhando a tela real, não a descrição dela.

## Accessibility & Inclusion

Nenhum requisito formal estabelecido. Duas necessidades vêm do contexto de uso, não de norma: contraste suficiente para leitura a 4 metros no painel de parede, e o fato de status **nunca** poder ser comunicado só por cor — o sistema opera em torno de vermelho/amarelo/verde, e daltonismo deuteranópico é o mais comum entre homens, que são a maioria da equipe de campo.
