// ─── Raw OS Row (saída do Grafana/CSV, enriquecida por enrichRows) ────────────

export type Fornecedor = 'WES' | 'Instacable' | 'THM' | 'REDE' | 'MANUTENCAO' | 'INSTALACAO' | 'INTERNO' | 'OUTRO'
export type TipoEquipe = 'REDE' | 'INSTALACAO' | 'MANUTENCAO' | 'OUTRO'
export type Categoria  = 'REDE' | 'VT_MANUTENCAO' | 'INSTALACAO' | 'SERVICO'
export type SituacaoEfetiva = 'Pendente' | 'Atendimento' | 'Reagendamento' | 'Concluída' | 'Cancelada' | string

export interface OSRow {
  // Campos brutos do banco
  numos:           string
  nomecliente:     string
  nomedacidade:    string
  nomedaequipe:    string
  tiposervico:     string
  servico:         string
  descsituacao:    string
  datacadastro:    string
  dataagendamento: string
  dataexecucao:    string
  databaixa:       string
  bairro:          string
  logradouro:      string
  complemento:     string
  numero:          string
  empresa:         string
  obs:             string
  periodo:         string
  // Colunas extras vindas do CSV (valor sempre string bruta)
  [key: string]:   unknown

  // Campos enriquecidos por enrichRows (_prefixed)
  _agingAbertura:     number | null
  _agingAgendamento:  number | null
  _agingHoras:        number | null
  _aging:             number | null
  _slaLimite:         number
  _slaTipoLabel:      string
  _diasAteAgendamento: number | null
  _slaExcedido:       boolean
  _slaSemAgend:       boolean
  _slaCritico:        boolean
  _slaCriticoHoras:   boolean
  _diasAcimaSLA:      number
  _fornecedor:        Fornecedor
  _tipo:              TipoEquipe
  _categoria:         Categoria
  _situacaoEfetiva:   SituacaoEfetiva
  _executadaHoje:     boolean
  _riskScore:         number   // 0–100: score de risco de SLA (computado em enrichRows)
}

// ─── Date Filter (uiStore) ────────────────────────────────────────────────────

export type DatePreset = 'hoje' | 'ontem' | 'semanal' | 'quinzenal' | 'mensal' | 'anual' | 'amanha' | 'futuro' | 'custom'
export type DateCampo  = 'datacadastro' | 'dataagendamento' | 'dataexecucao'

export interface DateFilter {
  preset: DatePreset
  from:   Date | null
  to:     Date | null
  campo:  DateCampo
}

// ─── SLA Limits (alertStore) ──────────────────────────────────────────────────

export interface SlaLimits {
  INSTALACAO: number
  MANUTENCAO: number
  SERVICO:    number
  VT24H:      number
  VT48H:      number
  VT08H:      number
}

// ─── Dashboard Builder ────────────────────────────────────────────────────────

export type AccentColor = 'red' | 'orange' | 'yellow' | 'cyan' | 'primary' | 'purple' | 'green'

export interface KPI {
  id:     string
  title:  string
  value:  number
  sub:    string
  accent: AccentColor
  trend?: { delta: number; pct: number; higherIsBetter: boolean } | null
  meta?:  number
}

export interface QuickInsight {
  level: 'red' | 'orange' | 'yellow' | 'green'
  text:  string
}

export interface AgingDist {
  '≤1d':  number
  '2-3d': number
  '4-7d': number
  '8+d':  number
}

export interface ClusterAtivo {
  bairro: string
  cidade: string
  total:  number
}

export interface Pulso {
  score:             number
  scoreLabel:        string
  narrativa:         string
  quickInsights:     QuickInsight[]
  agingMed:          number
  agingDist:         AgingDist
  slaFila:           number
  semAgendamento:    number
  mttr:              number
  topCidadesCriticas: { cidade: string; count: number }[]
  clustersAtivos:    ClusterAtivo[]
}

export interface FornecedorCard {
  key:       Fornecedor
  label:     string
  cor:       string
  total:     number
  concluidas: number
  taxa:      number
}

export interface DashboardData {
  kpis:        KPI[]
  fornecedores: FornecedorCard[]
  pulso:       Pulso
}

// ─── SLA Builder ─────────────────────────────────────────────────────────────

export interface SlaPulso {
  narrativa:  string
  ok:         number
  atencao:    number
  fora:       number
  criticas:   number
  score:      number
  scoreLabel: string
}

export interface SlaHipotese {
  text:  string
  level: 'red' | 'orange' | 'yellow' | 'green'
}

export interface SlaResumoItem {
  label: string
  value: number | string
  icon?: string
}

export interface SlaRankingItem {
  equipe:  string
  total:   number
  fora:    number
  taxa:    number
  score:   number
}

export interface SlaAgingEq {
  labels: string[]
  values: number[]
}

export interface SlaCluster {
  equipe: string
  bairro: string
  count:  number
}

export interface SlaSemaforo {
  equipe:   string
  total:    number
  fora:     number
  criticas: number
  taxa:     number
}

export interface SlaData {
  pulso:    SlaPulso
  hipoteses: SlaHipotese[]
  resumo:   SlaResumoItem[]
  ranking:  SlaRankingItem[]
  agingEq:  SlaAgingEq
  semaforo: SlaSemaforo[]
  clusters: SlaCluster[]
}

// ─── Gráficos Builder ─────────────────────────────────────────────────────────

export interface ChartSeries {
  labels: string[]
  values: number[]
}

export interface CohortData {
  labels:       string[]
  total:        number[]
  concluidas:   number[]
  mesmoMes:     number[]
  taxaResolucao: number[]
  mttr:         number[]
}

export interface EvolucaoData {
  labels:     string[]
  abertas:    number[]
  concluidas: number[]
}

export interface MensalData {
  labels:      string[]
  abertas:     number[]
  concluidas:  number[]
  slaExcedido: number[]
}

export interface ComparativoData {
  labels:      string[]
  pendente:    number[]
  atendimento: number[]
  concluida:   number[]
}

export interface GraficosData {
  status:      ChartSeries
  tipo:        ChartSeries
  cidade:      ChartSeries
  equipes:     ChartSeries
  aging:       ChartSeries
  eficiencia:  ChartSeries
  cohort:      CohortData
  evolucao:    EvolucaoData
  mensal:      MensalData
  comparativo: ComparativoData
  taxaDia:     ChartSeries
  burndown:    { labels: string[]; realizado: number[]; meta: number[] }
}

// ─── Anomalias Builder ────────────────────────────────────────────────────────

export interface AnomaliaItem {
  label: string
  value: number
  delta: number
}

export interface AnomaliasData {
  total:           number
  picosDia:        AnomaliaItem[]
  bairrosAnomalia: AnomaliaItem[]
  equipesAnomalia: AnomaliaItem[]
}

// ─── Cidades Builder ──────────────────────────────────────────────────────────

export interface CidadeRankingItem {
  cidade:   string
  total:    number
  concluidas: number
  taxa:     number
  criticas: number
}

export interface CidadesData {
  ranking:      CidadeRankingItem[]
  pendencias:   { cidade: string; count: number }[]
  fila:         { cidade: string; count: number }[]
  heatmap:      { cidade: string; lat: number; lng: number; weight: number }[]
  execucoes:    { cidade: string; count: number }[]
  consolidado:  CidadeRankingItem[]
  kpis:         KPI[]
  todasCidades: string[]
}

// ─── Campo Builder ────────────────────────────────────────────────────────────

export interface CampoHero {
  label:    string
  value:    number | string
  sub:      string
  accent:   AccentColor
}

export interface CampoData {
  kpis:       KPI[]
  semaforo:   SlaSemaforo[]
  risco:      { count: number; pct: number; desc: string }
  concluidas: OSRow[]
  fila:       OSRow[]
  ritmo:      ChartSeries
  tecnicos:   { nome: string; total: number; taxa: number }[]
  projecao:   { meta: number; realizado: number; pct: number } | null
  agingDist:  AgingDist | null
  hero:       CampoHero | null
}

// ─── Revisitas Builder ────────────────────────────────────────────────────────

export interface RevisitaTaxa {
  inst:  number
  manut: number
  serv:  number
  geral: number
}

export interface RevisitasData {
  taxa:          RevisitaTaxa
  narrativa:     string
  hipoteses:     SlaHipotese[]
  causas:        string[]
  causaRaiz:     string[]
  cronicos:      OSRow[]
  chart:         ChartSeries
  totalRevisitas: number
  revInst:       number
  revManut:      number
  revServ:       number
  porEquipe:     { equipe: string; total: number; taxa: number }[]
  porCidade:     { cidade: string; total: number; taxa: number }[]
  evitaveis:     { count: number; pct: number }
  tempoMedio:    number
  custoEstimado: number
  diasDist:      { '1-7': number; '8-14': number; '15-20': number; '21-30': number }
  base:          { total: number; inst: number; manut: number; serv: number }
  tendencia:     { delta: number; prevTaxa: number }
  intervalo:     ChartSeries
  tabela:        { numos: string; cliente: string; equipe: string; dias: number }[]
}

// ─── Auditoria Builder ────────────────────────────────────────────────────────

export interface AuditoriaData {
  score:    { value: number; label: string; ts: string }
  summary:  { label: string; value: number | string }[]
  problems: { level: 'red' | 'orange' | 'yellow'; text: string }[]
  tips:     string[]
}

// ─── Ordens Builder ───────────────────────────────────────────────────────────

export interface OrdensOptions {
  statuses: string[]
  tipos:    string[]
  cidades:  string[]
  equipes:  string[]
  bairros:  string[]
}

export interface OrdensData {
  ordens:  OSRow[]
  options: OrdensOptions
}

// ─── OSDataContext value ──────────────────────────────────────────────────────

export interface OSContextDerived {
  dashboard:  DashboardData
  sla:        SlaData
  graficos:   GraficosData
  auditoria:  AuditoriaData
  anomalias:  AnomaliasData
  cidades:    CidadesData
  campo:      CampoData
  revisitas:  RevisitasData
  ordens:     OrdensData
}

export interface OSContextValue {
  rows:          OSRow[]
  allRows:       OSRow[]
  isLoading:     boolean
  error:         Error | null
  dataUpdatedAt: number
  builderErrors: string[]
  derived:       OSContextDerived
}
