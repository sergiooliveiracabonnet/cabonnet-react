// `members` está zerado de propósito: o cadastro guarda só código + líder, que
// é como a operação identifica a frente ("INST F01 - FELIPE"). Nada no app lê
// esse campo — manter uma lista de auxiliares aqui só criava dado para
// envelhecer sem ninguém perceber.
export interface Team { code: string; leader: string; tipo: 'INSTALACAO' | 'MANUTENCAO' | 'REDE'; members: string[] }
export const TEAMS: Team[] = [
  { code: 'INST F01',  leader: 'FELIPE',    tipo: 'INSTALACAO', members: [] },
  { code: 'INST F04',  leader: 'THIAGO',    tipo: 'INSTALACAO', members: [] },
  { code: 'INST F05',  leader: 'JADIEL',    tipo: 'INSTALACAO', members: [] },
  { code: 'INST F07',  leader: 'JHONATA',   tipo: 'INSTALACAO', members: [] },
  { code: 'INST F08',  leader: 'ELCIO',     tipo: 'INSTALACAO', members: [] },
  { code: 'INST F11',  leader: 'ADANS',     tipo: 'INSTALACAO', members: [] },
  { code: 'INST F12',  leader: 'CLAUDIO',   tipo: 'INSTALACAO', members: [] },
  { code: 'INST F13',  leader: 'KAIQUE',    tipo: 'INSTALACAO', members: [] },
  { code: 'INST F14',  leader: 'JOÃO',      tipo: 'INSTALACAO', members: [] },
  { code: 'INST F20',  leader: 'LUCAS',     tipo: 'INSTALACAO', members: [] },
  { code: 'INST F23',  leader: 'ANDERSON',  tipo: 'INSTALACAO', members: [] },
  { code: 'INST F36',  leader: 'MAYKON',    tipo: 'INSTALACAO', members: [] },
  { code: 'INST F44',  leader: 'WILLIAM',   tipo: 'INSTALACAO', members: [] },
  { code: 'INST F45',  leader: 'DIMAS',     tipo: 'INSTALACAO', members: [] },
  { code: 'INST F46',  leader: 'VANDERLEI', tipo: 'INSTALACAO', members: [] },
  { code: 'INST F47',  leader: 'JEAN',      tipo: 'INSTALACAO', members: [] },
  { code: 'INST F48',  leader: 'MATHEUS',   tipo: 'INSTALACAO', members: [] },
  { code: 'INST F49',  leader: 'BRUNO',     tipo: 'INSTALACAO', members: [] },
  { code: 'INST F50',  leader: 'HIGOR',     tipo: 'INSTALACAO', members: [] },
  { code: 'MANUT F02', leader: 'CLÁUDIO',   tipo: 'MANUTENCAO', members: [] },
  { code: 'MANUT F04', leader: 'THAÍS',     tipo: 'MANUTENCAO', members: [] },
  { code: 'MANUT F77', leader: 'SERGIO',    tipo: 'MANUTENCAO', members: [] },
  { code: 'REDE F01',  leader: 'LUCIANO',   tipo: 'REDE',       members: [] },
  { code: 'REDE F04',  leader: 'SIDNEI',    tipo: 'REDE',       members: [] },
  { code: 'REDE F06',  leader: 'JULIO',     tipo: 'REDE',       members: [] },
  { code: 'REDE F07',  leader: 'CARLOS',    tipo: 'REDE',       members: [] },
  { code: 'REDE F08',  leader: 'LEONARDO',  tipo: 'REDE',       members: [] },
  { code: 'REDE F09',  leader: 'JEFFERSON', tipo: 'REDE',       members: [] },
  { code: 'REDE F10',  leader: 'VINÍCIUS',  tipo: 'REDE',       members: [] },
]
