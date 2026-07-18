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
  _diasAteViolacao:   number | null  // dias restantes até SLA crítico (0 = já crítico)
  _vtPrazoHoras:      number | null
  _vtHorasRestantes:  number | null
  _vtViolado:         boolean
  _vtCumpridaNoPrazo: boolean | null  // VT executada dentro do prazo? null = não-VT ou não executada
  _vtPriorityScore:   number          // 0+ : prioridade da fila VT (tipo × urgência × situação)
}

// ─── Date Filter (uiStore) ────────────────────────────────────────────────────

export type DatePreset = 'hoje' | 'ontem' | 'semanal' | 'mensal' | 'anual' | 'amanha' | 'custom'
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
  value:  number | string
  sub:    string
  accent: AccentColor
  trend?: { delta: number; pct: number; higherIsBetter: boolean } | null
  meta?:  number
}

export interface QuickInsight {
  level: 'red' | 'orange' | 'yellow' | 'green'
  text:  string
}

// Buckets relativos ao SLA de cada OS (aging ÷ limite) — uma manutenção com 2d
// (limite 1d) já estourou; uma instalação com 2d (limite 2d) está no limite.
export interface AgingDist {
  ok:        number   // < 50% do SLA consumido
  limite:    number   // 50–100% do SLA
  estourado: number   // > 1× até 2× o SLA
  critico:   number   // > 2× o SLA (mesma régua do _slaCritico)
}

export interface ClusterAtivo {
  bairro: string
  cidade: string
  total:  number
}

export interface PulsoScoreItem {
  id:     string
  label:  string
  value:  number
  weight: number
}

export interface PulsoMetaMes {
  concluidas:        number
  meta:              number
  pct:               number | null
  diasUteisRestantes: number
  diasUteisTotal:    number
  projecaoFinal:     number | null
  status:            'acima' | 'abaixo' | 'neutro'
}

export interface PulsoRitmoIntradiario {
  manha:         number
  tarde:         number
  semPeriodo:    number
  tardeIniciada: boolean
  fracTarde:     number   // fração do turno da tarde já decorrida (0–1)
  esperadoTarde: number   // conclusões esperadas na tarde até agora, no ritmo da manhã
  alerta:        boolean
}

export interface Pulso {
  score:             number
  scoreLabel:        string
  scoreBreakdown:    PulsoScoreItem[]
  narrativa:         string
  quickInsights:     QuickInsight[]
  agingMed:          number
  agingDist:         AgingDist
  slaFila:           number
  slaAtingimento:    number | null   // % das concluídas do período entregues dentro do SLA (fluxo); null sem concluídas
  semAgendamento:    number
  mttr:              number          // mediana (P50) em dias fracionários
  mttrP90:           number
  backlogDias:       number | null   // fila ativa ÷ média de saídas/dia (14d); null sem saídas
  topCidadesCriticas: { cidade: string; count: number }[]
  clustersAtivos:    ClusterAtivo[]
  criticasTotal:     number
  entradasHoje:      number
  saidasHoje:        number
  fluxoHoje:         number
  entradaMediaDia:   number
  metaMes:           PulsoMetaMes
  ritmoIntradiario:  PulsoRitmoIntradiario
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

// Tipos alinhados com o retorno real de buildSla (verificados via EMPTY_DERIVED)
export interface SlaHipotese {
  pergunta: string
  resposta: string
  sub:      string | null
}

export interface SlaResumoItem {
  status: string
  total:  number
  pct:    number
}

export interface SlaRankingItem {
  nome:     string
  tipo:     string
  sla:      number
  total:    number
  criticas: number
  agingMed: number
}

export interface SlaAgingEq {
  labels: string[]
  values: number[]
}

export interface SlaCluster {
  bairro: string
  cidade: string
  total:  number
}

export interface SlaSemaforo {
  nome:     string
  tipo:     string
  sla:      number
  total:    number
  criticas: number
  agingMed: number
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

export interface PicoDiaAnomalia {
  date:   string
  count:  number
  zScore: number
}

// Decomposição de uma anomalia (bairro ou equipe) nas OS que a compõem — dá pra
// IA (e pro usuário, direto na tela) o que de fato caracteriza o padrão, em vez
// de só a contagem/Z-score que não permite concluir nada sozinho.
export interface DistItem {
  nome:  string
  count: number
  pct:   number
}

// codigocliente sozinho não é pesquisável em lugar nenhum da UI (ver GlobalSearch,
// que busca por numos/nomecliente/bairro/cidade/equipe) — por isso carrega o nome
// e as OS onde o cliente aparece, que são o que dá pra colar na busca do header.
export interface ClienteRecorrente {
  codigocliente: string
  nomecliente:   string
  count:         number
  numos:         string[]
}

export interface Composicao {
  tiposervicoTop:       DistItem[]
  fornecedorTop:        DistItem[]
  clientesRecorrentes:  ClienteRecorrente[]
  outrasDimensoes:      DistItem[]           // equipes envolvidas (bairro) ou bairros atendidos (equipe)
  outrasDimensoesLabel: 'equipe' | 'bairro'
}

export interface BairroAnomalia {
  bairro:     string
  total:      number
  slaExc:     number
  rate:       number
  ratePct:    number
  zScore:     number
  composicao: Composicao
}

export interface EquipeAnomalia {
  nome:       string
  agingMed:   number
  count:      number
  zScore:     number
  composicao: Composicao
}

export interface AnomaliasData {
  total:           number
  picosDia:        PicoDiaAnomalia[]
  bairrosAnomalia: BairroAnomalia[]
  equipesAnomalia: EquipeAnomalia[]
}

// ─── Cidades Builder ──────────────────────────────────────────────────────────

// Saúde operacional de uma cidade — fila ao vivo + capacidade dos últimos 14 dias.
// Responde "qual cidade está subdimensionada?" (backlogDias) e "qual está
// acumulando fila?" (deltaShare: % da fila vs % das execuções).
export interface CidadeSaude {
  cidade:      string
  fila:        number          // ativas ao vivo (pend + atend, sem COPE/reagend/REDE)
  atend:       number
  pend:        number
  criticas:    number          // _slaCritico (> 2× SLA)
  slaPct:      number          // % da fila dentro do prazo (estourouSLA)
  agingMed:    number
  semEq:       number
  saidasDia:   number          // média de execuções/dia útil (14d, sem domingos)
  backlogDias: number | null   // fila ÷ saidasDia; null sem execuções
  shareFila:   number          // % da fila total do Vale nesta cidade
  shareExec:   number          // % das execuções (14d) nesta cidade
  deltaShare:  number          // shareFila − shareExec; positivo = acumulando fila
}

export interface CidadesData {
  saude: CidadeSaude[]
  kpis:  KPI[]
}

// ─── Campo Builder ────────────────────────────────────────────────────────────

export interface CampoHero {
  label:    string
  value:    number | string
  sub:      string
  accent:   AccentColor
}

export interface CampoSemaforo {
  nome:       string
  fila:       number
  concl:      number
  taxa:       number
  slaExc:     number
  status:     'ok' | 'atencao' | 'critico'
  diasAteSLA: number | null
  ritmoHoje:  { atual: number; projetado: number | null; baseline: number; status: string } | null
}

// Tipos alinhados com retorno real de buildCampo
export interface CampoProjecaoItem {
  equipe: string
  fila:   number
  ritmo:  number
  dias:   number | string
}

export interface CampoAgingDist {
  labels:      string[]
  values:      number[]
  hasCritical: boolean
}

export interface CampoHeroReal {
  status:       string
  title:        string
  msg:          string
  criticoCount: number
  atencaoCount: number
  totalEquipes: number
}

export interface CampoData {
  kpis:       KPI[]
  semaforo:   CampoSemaforo[]
  risco:      { count: number; pct: number; desc: string }
  concluidas: CampoSemaforo[]
  fila:       CampoSemaforo[]
  ritmo:      ChartSeries
  tecnicos:   never[]
  projecao:   CampoProjecaoItem[] | null
  agingDist:  CampoAgingDist
  hero:       CampoHeroReal
}

// ─── Revisitas Builder ────────────────────────────────────────────────────────

export interface RevisitaTaxa {
  inst:  number
  manut: number
  serv:  number
  geral: number
}

// Tipos alinhados com retorno real de buildRevisitas
export interface RevisitaHipotese {
  pergunta: string
  resposta: string
  sub:      string | null
}

export interface RevisitasData {
  taxa:          RevisitaTaxa
  narrativa:     string
  hipoteses:     RevisitaHipotese[]
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

// Tipos alinhados com o retorno real de buildAuditoria
export interface AuditoriaData {
  score:    { value: number; label: string; ts: string }
  summary:  { label: string; value: number; ok: boolean; sub?: string }[]
  problems: { title: string; severity: string; desc: string; rows: { numos: string; status: string; cidade: string }[] }[]
  tips:     { text: string }[]
}

// ─── Ordens Builder ───────────────────────────────────────────────────────────

// Tipos alinhados com o retorno real de buildOrdens (inclui periodos, sem statuses)
export interface OrdensOptions {
  tipos:    string[]
  cidades:  string[]
  equipes:  string[]
  bairros:  string[]
  periodos: string[]
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
