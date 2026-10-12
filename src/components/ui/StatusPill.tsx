import type { ReactNode } from 'react'
import { CheckCircle, Warning, WarningOctagon } from '@phosphor-icons/react'
import type { NivelStatus } from '../../lib/statusNivel'

// Status nunca vai so na cor: em deuteranopia o --c-green e o --c-red caem na
// mesma luminosidade (1.05:1). Cada nivel carrega uma forma propria — circulo,
// triangulo, octogono de "pare" — que se le sem distinguir matiz.

const NIVEIS = {
  ok:      { Icon: CheckCircle,    rotulo: 'dentro da meta', cls: 'text-green bg-green/10'   },
  atencao: { Icon: Warning,        rotulo: 'atenção',        cls: 'text-yellow bg-yellow/10' },
  critico: { Icon: WarningOctagon, rotulo: 'crítico',        cls: 'text-red bg-red/10'       },
} as const

interface StatusIconProps {
  nivel: NivelStatus
  size?: number | string
  className?: string
  /** Quando o texto ao lado ja diz o que a forma diz, o leitor de tela nao precisa repetir. */
  semRotulo?: boolean
}

export function StatusIcon({ nivel, size = '1em', className = '', semRotulo = false }: StatusIconProps) {
  const { Icon, rotulo } = NIVEIS[nivel]
  return (
    <>
      <Icon size={size} weight="fill" aria-hidden="true" className={`flex-shrink-0 ${className}`} />
      {!semRotulo && <span className="sr-only">{rotulo}: </span>}
    </>
  )
}

interface StatusValueProps {
  nivel: NivelStatus
  children: ReactNode
  /** Cor do nivel "ok". Em tabela densa o normal recua para o texto comum e so a excecao ganha cor e forma. */
  okClass?: string
  className?: string
}

/** Valor inline: a forma aparece so em atencao e critico, e a ausencia dela ja diz "ok". */
export function StatusValue({ nivel, children, okClass = 'text-green', className = '' }: StatusValueProps) {
  const cor = nivel === 'ok' ? okClass : NIVEIS[nivel].cls.split(' ')[0]
  return (
    <span data-nivel={nivel} className={`inline-flex items-center gap-1 ${cor} ${className}`}>
      {nivel !== 'ok' && <StatusIcon nivel={nivel} size="0.9em" />}
      {children}
    </span>
  )
}

interface StatusPillProps {
  nivel: NivelStatus
  children: ReactNode
  className?: string
}

export function StatusPill({ nivel, children, className = '' }: StatusPillProps) {
  return (
    <span data-nivel={nivel}
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-caption font-bold tabular-nums
                      ${NIVEIS[nivel].cls} ${className}`}>
      <StatusIcon nivel={nivel} />
      {children}
    </span>
  )
}
