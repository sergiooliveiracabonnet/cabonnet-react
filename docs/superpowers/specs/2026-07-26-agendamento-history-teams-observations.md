# Historico de equipes e motivos de reagendamento

## Problema

A linha do tempo da OS reutiliza a equipe atualmente designada no primeiro
agendamento. Com isso, a ultima equipe pode aparecer como responsavel por
passagens anteriores. O historico local tambem nao guarda a observacao presente
quando ocorre a troca de equipe ou data.

## Comportamento esperado

- Registrar a primeira equipe/data observada para cada OS, uma unica vez.
- Criar um novo registro imutavel quando equipe ou data de agendamento mudar.
- Guardar equipe executante, observacao e observacao critica em cada registro.
- Montar a linha do tempo pela ordem dos registros persistidos, sem substituir
  equipes anteriores pela equipe atual.
- Exibir em cada reagendamento a observacao capturada naquele registro; quando
  ela nao existir, usar a ocorrencia de reagendamento retornada por `/detalhes`.
- Migrar automaticamente bancos SQLite existentes sem apagar dados.

## Compatibilidade

Registros anteriores a esta alteracao continuam disponiveis, mas equipes e
observacoes que nunca foram capturadas no banco nao podem ser reconstruidas com
certeza. A preservacao completa vale a partir da implantacao desta versao.

## Validacao

- Testes de persistencia para carga inicial, troca de equipe e ausencia de
  duplicacao.
- Testes da sequencia visual para equipes distintas e observacoes por evento.
- Teste do parser das ocorrencias retornadas pelo endpoint de detalhes.
