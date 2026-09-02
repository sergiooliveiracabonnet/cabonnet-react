/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Superfícies ──
        bg:               'rgb(var(--bg) / <alpha-value>)',
        'surface-1':      'rgb(var(--surface-1) / <alpha-value>)',
        'surface-2':      'rgb(var(--surface-2) / <alpha-value>)',
        'surface-3':      'rgb(var(--surface-3) / <alpha-value>)',
        'surface-hover':  'rgb(var(--surface-hover) / <alpha-value>)',
        'surface-active': 'rgb(var(--surface-active) / <alpha-value>)',

        // ── Aliases de compatibilidade (removidos na Fase 4) ──
        card:           'rgb(var(--surface-2) / <alpha-value>)',
        'card-high':    'rgb(var(--surface-hover) / <alpha-value>)',
        'card-highest': 'rgb(var(--surface-active) / <alpha-value>)',
        elevated:       'rgb(var(--surface-3) / <alpha-value>)',
        surface:        'rgb(var(--surface-hover) / <alpha-value>)',

        // ── Bordas ──
        border:   'rgb(var(--border) / <alpha-value>)',
        subtle:   'rgb(var(--border-subtle) / <alpha-value>)',
        'border-hover': 'rgb(var(--border-hover) / <alpha-value>)',

        // ── Texto ──
        text:      'rgb(var(--text) / <alpha-value>)',
        secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
        muted:     'rgb(var(--text-muted) / <alpha-value>)',
        disabled:  'rgb(var(--text-disabled) / <alpha-value>)',

        // ── Acentos ──
        orange: 'rgb(var(--orange) / <alpha-value>)',
        blue:   'rgb(var(--blue) / <alpha-value>)',
        green:  'rgb(var(--green) / <alpha-value>)',
        yellow: 'rgb(var(--yellow) / <alpha-value>)',
        red:    'rgb(var(--red) / <alpha-value>)',

        // Cor de marca. Os usos que carregavam sentido de "informação/dado"
        // foram reclassificados para `blue` antes desta troca.
        primary:         'rgb(var(--orange) / <alpha-value>)',
        'primary-light': 'rgb(var(--orange) / <alpha-value>)',
        'primary-dark':  'rgb(var(--orange) / <alpha-value>)',

        // Aliases das cores aposentadas — resolvidos nas Fases 2-4
        cyan:   'rgb(var(--blue) / <alpha-value>)',
        teal:   'rgb(var(--green) / <alpha-value>)',
        purple: 'rgb(var(--chart-6) / <alpha-value>)',

        // ── Séries de gráfico ──
        'chart-1': 'rgb(var(--chart-1) / <alpha-value>)',
        'chart-2': 'rgb(var(--chart-2) / <alpha-value>)',
        'chart-3': 'rgb(var(--chart-3) / <alpha-value>)',
        'chart-4': 'rgb(var(--chart-4) / <alpha-value>)',
        'chart-5': 'rgb(var(--chart-5) / <alpha-value>)',
        'chart-6': 'rgb(var(--chart-6) / <alpha-value>)',

        // ── Tinta do KPI preenchido ──
        'kpi-ink-orange': 'rgb(var(--kpi-ink-orange) / <alpha-value>)',
        'kpi-ink-blue':   'rgb(var(--kpi-ink-blue) / <alpha-value>)',
        'kpi-ink-green':  'rgb(var(--kpi-ink-green) / <alpha-value>)',
        'kpi-ink-yellow': 'rgb(var(--kpi-ink-yellow) / <alpha-value>)',
      },

      fontFamily: {
        sans:     ['"Inter Variable"', '"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        headline: ['"Inter Variable"', '"Inter"', 'system-ui', 'sans-serif'],
        mono:     ['"Inter Variable"', '"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
      },

      fontSize: {
        caption: ['11px', { lineHeight: '1.35' }],
        label:   ['12px', { lineHeight: '1.4'  }],
        body:    ['14px', { lineHeight: '1.5'  }],
        title:   ['16px', { lineHeight: '1.4'  }],
        heading: ['20px', { lineHeight: '1.3',  letterSpacing: '-0.01em'  }],
        display: ['28px', { lineHeight: '1',    letterSpacing: '-0.025em' }],
      },

      borderRadius: {
        sm:      '6px',
        DEFAULT: '8px',
        md:      '8px',
        lg:      '12px',
        xl:      '16px',
        '2xl':   '24px',
        pill:    '9999px',
      },

      // Sombras sensíveis ao tema — o valor vive em --shadow-*, redefinido em .dark.
      // xs, 2xl, accent e accent-lg continuam declarados porque ainda há 21 usos
      // vivos no código (shadow-2xl 15, shadow-accent 5, shadow-xs 1); o Tailwind
      // descarta classe desconhecida em silêncio, sem erro de build nem de tipo.
      // Migrados na Task 19.
      boxShadow: {
        xs:      'var(--shadow-sm)',
        sm:      'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-md)',
        md:      'var(--shadow-md)',
        lg:      'var(--shadow-lg)',
        xl:      'var(--shadow-lg)',
        '2xl':   'var(--shadow-lg)',
        accent:      '0 0 20px rgb(var(--orange) / .08)',
        'accent-lg': '0 0 28px rgb(var(--orange) / .12)',
        none:    '0 0 #0000',
      },

      zIndex: {
        base: '1', sticky: '95', dropdown: '100', sidebar: '200',
        header: '300', drawer: '600', modal: '700', overlay: '800',
        toast: '9000', top: '9999',
      },

      animation: {
        'fade-in':    'fadeIn .22s cubic-bezier(.4,0,.2,1)',
        'slide-down': 'slideDown .22s cubic-bezier(.4,0,.2,1)',
        'scale-in':   'scaleIn .22s cubic-bezier(.34,1.56,.64,1)',
        'page-enter': 'pageEnter .40s cubic-bezier(.4,0,.2,1) both',
        'card-enter': 'cardEnter .36s cubic-bezier(.34,1.56,.64,1) both',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' }, to: { opacity: '1' } },
        slideDown: { from: { opacity: '0', transform: 'translateY(-8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn:   { from: { opacity: '0', transform: 'scale(.92)' },       to: { opacity: '1', transform: 'scale(1)' } },
        pageEnter: { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        cardEnter: { from: { opacity: '0', transform: 'scale(.93) translateY(12px)' }, to: { opacity: '1', transform: 'scale(1) translateY(0)' } },
      },

      transitionTimingFunction: {
        ease:   'cubic-bezier(.4,0,.2,1)',
        spring: 'cubic-bezier(.34,1.56,.64,1)',
      },
      transitionDuration: { fast: '120ms', normal: '220ms', slow: '360ms' },
    },
  },
  safelist: [
    'breathe', 'app-content', 'surface-panel', 'metric-panel',
    'page-header', 'page-header-icon', 'map-tooltip',
    { pattern: /^badge-(orange|blue|green|yellow|red)$/ },
    { pattern: /^animate-(fade-in|slide-down|scale-in|page-enter|card-enter)$/ },
  ],
  plugins: [],
}
