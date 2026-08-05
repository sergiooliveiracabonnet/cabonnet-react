import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useUIStore } from '../store/uiStore'

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
  observacao?:      string
  motivocancelamento?: string
  motivoreagendamento?: string
  executante?:      string
  recorrencia:     number
  is_revisita:     boolean
  /** @deprecated compatibilidade do contrato antigo; usar `recorrencia` */
  revisita_inst:   number
  revisita_manut:  number
  revisita_serv:   number
  tempo_maior_24h: number
  tempo_maior_4h:  number
  tempo_maior_3h:  number
}

export interface BacklogKpis {
  total:         number
  revisitas:     number
  visitas_unicas: number
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
  source?:    string
  cached?:    boolean
}

const BACKLOG_SCHEMA_VERSION = 8   // fonte oficial iManager/Power BI + campo recorrencia

// O toggle "Rede" do header vale para estas telas também. Ele é lido aqui, e
// não em cada página, para que todo consumidor de backlog respeite o mesmo
// estado — e vai como parâmetro porque os agregados (kpis, por_equipe,
// por_cidade) são calculados no backend e precisam excluir Rede junto.
export function useBacklog(inicio: string, fim: string) {
  const hideRede = useUIStore(s => s.hideRede)
  return useQuery<BacklogData>({
    queryKey:      ['backlog', BACKLOG_SCHEMA_VERSION, inicio, fim, hideRede],
    queryFn:       () => api.get<BacklogData>(
      `/backlog?inicio=${inicio}&fim=${fim}${hideRede ? '&hide_rede=1' : ''}`,
    ),
    staleTime:     5 * 60_000,
    gcTime:        10 * 60_000,
    retry:         1,
    enabled:       !!inicio && !!fim,
    placeholderData: (prev) => prev,   // mantém dados do período anterior enquanto carrega
  })
}
