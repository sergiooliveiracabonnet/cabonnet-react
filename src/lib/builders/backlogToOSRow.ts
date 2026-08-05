import type { BacklogRow } from '../../hooks/useBacklog'
import type { OSRow } from '../types'
import { enrichRows } from '../transform'

/**
 * Ponte entre a linha do BI (`/backlog`, `/api/revisit-journeys`) e o `OSRow`
 * que o `OSDrawer` consome.
 *
 * Passa pelo `enrichRows` de propósito em vez de montar os campos `_` na mão:
 * é ele quem calcula SLA, aging, fornecedor e situação efetiva no caminho
 * normal do app. Reaproveitá-lo garante que a gaveta aberta a partir do BI
 * mostre exatamente o que mostraria vinda da tela de Ordens.
 *
 * O que o BI não traz (endereço, databaixa, histórico do técnico) é
 * completado pelo `/detalhes`, que o próprio drawer busca pelo numos.
 */
export function backlogRowToOSRow(row: BacklogRow): OSRow {
  const raw = {
    numos:           String(row.numos ?? ''),
    nomecliente:     row.nomecliente ?? '',
    nomedacidade:    row.nomedacidade ?? '',
    nomedaequipe:    row.nomedaequipe ?? '',
    equipeexecutou:  row.equipeexecutou ?? '',
    tiposervico:     row.tiposervico ?? '',
    servico:         row.servico ?? '',
    descsituacao:    row.descsituacao ?? '',
    datacadastro:    row.datacadastro ?? '',
    dataagendamento: row.dataagendamento ?? '',
    dataexecucao:    row.dataexecucao ?? '',
    databaixa:       '',
    bairro:          row.bairro ?? '',
    codigocliente:   row.codigocliente ?? '',
    codigocontrato:  row.codigocontrato ?? '',
    periodo:         row.periodo ?? '',
    observacoes:     row.observacao ?? '',
    recorrencia:     row.recorrencia ?? 0,
  }
  // Único ponto onde a fronteira de tipos é cruzada: enrichRows espera OSRow
  // completo, mas internamente só lê os campos brutos e deriva o resto.
  return enrichRows([raw as unknown as OSRow])[0]
}
