import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { InvestigationTab } from './InvestigationTab'

vi.mock('../../../hooks/useRevisitJourneys', () => ({
  useRevisitJourneys: () => ({
    isLoading: false, isError: false,
    data: {
      n: 1, linked: 1, unlinked: 0, periodo: '2026-07-01', fim: '2026-08-01', source: 'test',
      journeys: [{
        origin_os: '9000001', revisit_os: '9000002', recurrence: 1,
        link_basis: 'contract', link_confidence: 'high', days_between: 3, same_team: false,
        origin: { equipeexecutou: 'F01' },
        revisit: { nomecliente: 'CLIENTE TESTE', nomedacidade: 'Taubaté', equipeexecutou: 'F08' },
      }],
    },
  }),
}))
vi.mock('./RevisitInvestigationDrawer', () => ({ RevisitInvestigationDrawer: () => null }))
vi.mock('../qualidade/RevisitaMotivosSection', () => ({ RevisitaMotivosSection: () => <div>Causas registradas</div> }))

it('mostra a jornada oficial e a troca de equipe', () => {
  render(<InvestigationTab inicio="2026-07-01" fim="2026-08-01" />)
  expect(screen.getByRole('row', { name: /9000001.*9000002.*CLIENTE TESTE.*F01.*F08/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Investigar' })).toBeInTheDocument()
})
