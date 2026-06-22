import { describe, it, expect } from 'vitest'
import { fmtDate, situacaoVariant, FORN_LABEL, shortEquipe, fmtHorasMin } from './osFormat'

describe('fmtDate', () => {
  it('retorna null para valor nulo', () => {
    expect(fmtDate(null)).toBeNull()
    expect(fmtDate('')).toBeNull()
  })

  it('formata DD/MM/YYYY sem hora', () => {
    expect(fmtDate('25/04/2025')).toBe('25/04/2025')
  })

  it('formata DD/MM/YYYY com hora', () => {
    expect(fmtDate('25/04/2025 14:30')).toBe('25/04/2025 14:30')
  })

  it('converte YYYY-MM-DD para DD/MM/YYYY', () => {
    expect(fmtDate('2025-04-25')).toBe('25/04/2025')
  })

  it('converte YYYY-MM-DD HH:MM para DD/MM/YYYY HH:MM', () => {
    expect(fmtDate('2025-04-25 09:15')).toBe('25/04/2025 09:15')
  })

  it('ignora segundos e mantém só HH:MM', () => {
    expect(fmtDate('25/04/2025 08:30:00')).toBe('25/04/2025 08:30')
  })
})

describe('situacaoVariant', () => {
  it('Concluída → green', () => {
    expect(situacaoVariant('Concluída')).toBe('green')
    expect(situacaoVariant('Concluída/Sem Execução')).toBe('green')
  })

  it('Atendimento → cyan', () => {
    expect(situacaoVariant('Atendimento')).toBe('cyan')
  })

  it('Cancelada → red', () => {
    expect(situacaoVariant('Cancelada')).toBe('red')
  })

  it('Pendente → yellow', () => {
    expect(situacaoVariant('Pendente')).toBe('yellow')
  })

  it('string vazia → secondary', () => {
    expect(situacaoVariant('')).toBe('secondary')
  })
})

describe('FORN_LABEL', () => {
  it('tem entrada para todos os fornecedores conhecidos', () => {
    const expected = ['WES', 'Instacable', 'REDE', 'MANUTENCAO', 'INSTALACAO', 'INTERNO', 'OUTRO'] as const
    expected.forEach(k => {
      expect(FORN_LABEL[k]).toBeDefined()
    })
  })
})

describe('shortEquipe', () => {
  it('retorna "—" para null, undefined ou string vazia', () => {
    expect(shortEquipe(null)).toBe('—')
    expect(shortEquipe(undefined)).toBe('—')
    expect(shortEquipe('')).toBe('—')
  })

  it('abrevia MANUTENÇÃO extraindo código alfanumérico', () => {
    expect(shortEquipe('03- VAL - MANUTENCAO M02')).toBe('M02')
    expect(shortEquipe('MANUTENCAO M04')).toBe('M04')
  })

  it('retorna "MANUT" quando não há código numérico', () => {
    expect(shortEquipe('MANUTENCAO')).toBe('MANUT')
  })

  it('abrevia INSTALAÇÃO com código F (usa EQUIPE_NAMES quando disponível)', () => {
    // F01 tem líder cadastrado → retorna com nome do técnico
    expect(shortEquipe('03- VAL - INSTALACAO F01')).toBe('INST F01 - FELIPE')
    // F48 tem líder cadastrado → retorna com nome do técnico
    expect(shortEquipe('INSTALACAO F48')).toBe('INST F48 - MATHEUS')
  })

  it('retorna "INST" quando não há código F', () => {
    expect(shortEquipe('INSTALACAO')).toBe('INST')
  })

  it('reconhece REDE com resto do nome', () => {
    expect(shortEquipe('03- VAL - REDE 01')).toBe('REDE 01')
  })

  it('retorna "REDE" quando não há sufixo', () => {
    expect(shortEquipe('REDE')).toBe('REDE')
  })

  it('COPE retorna "COPE"', () => {
    expect(shortEquipe('COPE INTERNO')).toBe('COPE')
  })

  it('trunca nomes desconhecidos em 15 caracteres', () => {
    const result = shortEquipe('EQUIPE DESCONHECIDA XYZ')
    expect(result.length).toBeLessThanOrEqual(15)
  })

  it('fmtDate lida com ISO timestamp com Z', () => {
    const result = fmtDate('2025-04-25T09:15:00Z')
    expect(result).toBe('25/04/2025 09:15')
  })

  it('fmtDate lida com ISO timestamp com offset de timezone', () => {
    const result = fmtDate('2025-04-25T09:15:00-03:00')
    expect(result).toBe('25/04/2025 09:15')
  })
})

describe('fmtHorasMin', () => {
  it('formata horas e minutos', () => {
    expect(fmtHorasMin(1.5)).toBe('1h 30min')
  })

  it('formata só horas quando minutos são zero', () => {
    expect(fmtHorasMin(2)).toBe('2h')
  })

  it('formata só minutos quando menos de 1 hora', () => {
    expect(fmtHorasMin(0.75)).toBe('45min')
  })

  it('usa valor absoluto (ignora sinal negativo)', () => {
    expect(fmtHorasMin(-1.5)).toBe('1h 30min')
  })
})
