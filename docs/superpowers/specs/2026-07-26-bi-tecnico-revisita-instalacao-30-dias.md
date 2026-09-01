# BI-Tecnico: revisita de instalacao em 30 dias

Uma instalacao executada e marcada como revisitada quando existe um chamado
tecnico do mesmo contrato, cliente e cidade, aberto depois da execucao e no
maximo 30 dias depois.

## Criterios

- A coorte do periodo e composta pelas instalacoes executadas no intervalo.
- O chamado pode estar aberto, em atendimento ou concluido.
- A data do retorno e a abertura do chamado (`d_datacadastro`).
- A janela e movel e inclusiva: maior que a execucao e menor ou igual a 30 dias.
- Virada de mes nao interfere; chamado anterior e chamado no 31o dia nao contam.
- OS de rede nao caracteriza revisita tecnica de instalacao.
- A taxa e instalacoes revisitadas divididas por instalacoes executadas.

Testes protegem a expressao SQL, o vinculo contratual e os denominadores geral
e por cidade usados pela interface.
