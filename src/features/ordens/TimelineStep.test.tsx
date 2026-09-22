import { CheckCircle } from '@phosphor-icons/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TimelineStep } from './TimelineStep'

describe('TimelineStep', () => {
  it('mostra o horário registrado no lugar da data-alvo quando ambos existem', () => {
    render(
      <TimelineStep
        icon={CheckCircle} color="cyan" label="Reagendamento 1"
        date="20/11/2026" registradoEm="20/11/2026 08:04"
        equipe="F08" done
      />,
    )
    expect(screen.getByText('Reagendamento 1')).toBeInTheDocument()
    expect(screen.getByText('20/11/2026 08:04')).toBeInTheDocument()
    expect(screen.getByText(/agendado p\/ 20\/11\/2026/)).toBeInTheDocument()
    expect(screen.getByText('F08')).toBeInTheDocument()
  })

  it('mostra pills de fatos rápidos sempre visíveis, sem precisar expandir', () => {
    render(
      <TimelineStep
        icon={CheckCircle} color="green" label="Fim da Execução"
        date="21/09/2026" done
        details={{ nomeTecnico: 'João Silva', duracao: '45min' }}
      />,
    )
    expect(screen.getByText('João Silva')).toBeInTheDocument()
    expect(screen.getByText('45min')).toBeInTheDocument()
  })

  it('esconde histórico/materiais atrás de "Ver detalhes" e alterna ao clicar', () => {
    render(
      <TimelineStep
        icon={CheckCircle} color="green" label="Fim da Execução"
        date="21/09/2026" done
        details={{ materiais: [{ quantidade: 2, nome: 'Cabo drop' }] }}
      />,
    )
    expect(screen.queryByText('Cabo drop')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /ver detalhes/i }))
    expect(screen.getByText('Cabo drop')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /ocultar detalhes/i }))
    expect(screen.queryByText('Cabo drop')).not.toBeInTheDocument()
  })

  it('destaca reagendada com badge e mostra a troca de equipe', () => {
    render(
      <TimelineStep
        icon={CheckCircle} color="cyan" label="Início da Execução"
        date="21/09/2026" equipe="F11" done
        details={{ equipeAgendada: 'F08', reagendada: true }}
      />,
    )
    expect(screen.getByText('reagendada')).toBeInTheDocument()
    expect(screen.getByText('F08')).toBeInTheDocument()
    // "F11" aparece duas vezes de propósito: no subtítulo (quem executou) e no
    // comparativo "agendada -> executante" dentro do bloco de troca de equipe.
    expect(screen.getAllByText('F11')).toHaveLength(2)
  })

  it('não mostra "Ver detalhes" quando não há conteúdo extra além das pills', () => {
    render(
      <TimelineStep
        icon={CheckCircle} color="green" label="Abertura da OS"
        date="21/09/2026" done
      />,
    )
    expect(screen.queryByRole('button', { name: /ver detalhes/i })).not.toBeInTheDocument()
  })
})
