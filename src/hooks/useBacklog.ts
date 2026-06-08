import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export interface BacklogRow {
  nomecliente:     string
  numos:           string
  codigocliente:   string
  codigocontrato:  string
  servico:         string
  tiposervico:     string
  nomedacidade:    string
  bairro:          string
  periodo:         string
  descsituacao:    string
  nomedaequipe:    string
  equipeexecutou:  string
  datacadastro:    string
  dataagendamento: string
  dataexecucao:    string
  horas_resolucao: number
  revisita_inst:   number
  revisita_manut:  number
  revisita_serv:   number
  tempo_maior_24h: number
  tempo_maior_4h:  number
  tempo_maior_3h:  number
}

export interface BacklogKpis {
  total:         number
  rev_inst:      number
  rev_manut:     number
  rev_serv:      number
  violacoes_24h: number
  violacoes_4h:  number
  violacoes_3h:  number
}

export interface BacklogEquipe {
  equipe: string
  total:  number
  ri:     number
  rm:     number
  rs:     number
}

export interface BacklogCidade {
  cidade: string
  total:  number
  ri:     number
  rm:     number
  rs:     number
}

export interface BacklogTipo {
  tipo:  string
  total: number
  v24h:  number
}

export interface BacklogData {
  rows:       BacklogRow[]
  kpis:       BacklogKpis
  por_equipe: BacklogEquipe[]
  por_cidade: BacklogCidade[]
  por_tipo:   BacklogTipo[]
  n:          number
  periodo:    string
  fim:        string
}

const BACKLOG_SCHEMA_VERSION = 6   // incrementar quando o schema do backend mudar

export function useBacklog(inicio: string, fim: string) {
  return useQuery<BacklogData>({
    queryKey:      ['backlog', BACKLOG_SCHEMA_VERSION, inicio, fim],
    queryFn:       () => api.get<BacklogData>(`/backlog?inicio=${inicio}&fim=${fim}`),
    staleTime:     5 * 60_000,
    gcTime:        10 * 60_000,
    retry:         1,
    enabled:       !!inicio && !!fim,
    placeholderData: (prev) => prev,   // mantém dados do período anterior enquanto carrega
  })
}
