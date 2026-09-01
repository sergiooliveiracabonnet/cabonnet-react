import { CalendarCheck, CalendarBlank, ClipboardText, ShieldWarning, UserMinus } from '@phosphor-icons/react'
export const ORDENS_CARD_ICONS = {
  total: ClipboardText,
  criticas: ShieldWarning,
  semEquipe: UserMinus,
  agendHoje: CalendarCheck,
  agendAmanha: CalendarCheck,
  agendFuturo: CalendarBlank,
} as const
