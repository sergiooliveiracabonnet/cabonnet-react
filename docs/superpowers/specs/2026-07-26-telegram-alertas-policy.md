# Política de mensagens — Alertas | Cabonnet

## Escopo

- Preservar os grupos restritos: cada fornecedor/equipe recebe somente suas OS.
- Preservar no grupo `Alertas | Cabonnet` a visão completa e detalhada de todas as OS.
- Não implementar confirmação de ciência, responsável ou comando `/assumir`.

## Comportamento

- Mensagens mantêm capitalização natural; apenas títulos definidos pelos templates usam caixa alta.
- Mudanças de status são consolidadas quando houver mais de três eventos no mesmo ciclo.
- Alertas VT novos são enviados imediatamente entre 07:00 e 22:59.
- VT violado reincide após 1 hora e, depois, a cada 3 horas; não há reincidência noturna.
- O grupo Alertas recebe um único consolidado global por estágio; grupos restritos recebem seus lotes filtrados.
- Quando uma VT alertada deixa a fila ativa, é enviada uma normalização.
- Alertas oferecem botões contextuais para consultar OS e abrir os principais painéis.
- `/menu` oferece navegação curta; `/help` continua como referência completa.

## Verificação

- Testes unitários cobrem capitalização, janela/reincidência e consolidação/roteamento.
- Suite Python e testes Telegram existentes devem permanecer verdes.
