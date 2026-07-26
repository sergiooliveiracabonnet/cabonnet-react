import {
  CalendarCheck2,
  CalendarClock,
  CalendarRange,
  ClipboardList,
  ShieldAlert,
  UserRoundX,
} from 'lucide-react'

export const ORDENS_CARD_ICONS = {
  total: ClipboardList,
  criticas: ShieldAlert,
  semEquipe: UserRoundX,
  agendHoje: CalendarCheck2,
  agendAmanha: CalendarClock,
  agendFuturo: CalendarRange,
} as const
