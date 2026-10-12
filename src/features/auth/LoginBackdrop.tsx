// Cenario da tela de login: um rack de provedor e quatro fibras que saem dele
// atravessando a tela. E decoracao, nao informacao: aria-hidden, sem pointer.
//
// So tokens do tema. As cores vem de currentColor (text-primary, text-chart-N),
// entao o cenario troca de tema sozinho; o esmaecimento das fibras e dos arcos
// vem de mascaras neutras, porque um gradiente SVG nao herda o currentColor de
// quem o usa. Nenhuma cor de status aqui: os LEDs do rack sao azuis, o verde e
// o amarelo pertencem ao SLA.
//
// Um unico movimento: pacotes de luz correndo pelas fibras, a partir do rack.
// Sem `prefers-reduced-motion: no-preference` eles nem aparecem.

const FIBRAS = [
  { d: 'M 1255 278 C 1080 210 860 180 620 240 S 280 320 0 290', cor: 'text-chart-1', largura: 1.1, atraso: 0,   duracao: 11 },
  { d: 'M 1255 312 C 1060 300 840 310 600 370 S 260 430 0 400',  cor: 'text-chart-3', largura: 0.9, atraso: 3.2, duracao: 13 },
  { d: 'M 1255 388 C 1050 420 820 390 580 450 S 220 530 0 510',  cor: 'text-chart-2', largura: 0.85, atraso: 6.1, duracao: 12 },
  { d: 'M 1255 456 C 1020 500 780 480 520 540 S 180 620 0 600',  cor: 'text-chart-1', largura: 0.8, atraso: 8.4, duracao: 14 },
] as const

const CSS = `
  .lb-pacote { opacity: 0; }
  @media (prefers-reduced-motion: no-preference) {
    .lb-pacote { opacity: 1; animation: lb-corre var(--lb-dur) linear var(--lb-atraso) infinite; }
    .lb-arco   { animation: lb-respira 10s ease-in-out infinite; }
  }
  @keyframes lb-corre   { from { stroke-dashoffset: 0 } to { stroke-dashoffset: -1000 } }
  @keyframes lb-respira { 0%, 100% { stroke-opacity: .5 } 50% { stroke-opacity: 1 } }
`

export function LoginBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{CSS}</style>

      <div className="absolute inset-0"
           style={{ background: 'radial-gradient(ellipse 38% 60% at 86% 48%, rgb(var(--c-primary) / 0.16) 0%, transparent 70%)' }} />

      <svg className="absolute inset-0 h-full w-full text-primary [.light_&]:opacity-70"
           xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          {/* Mascara das fibras: nasce no rack (direita) e some na esquerda */}
          <linearGradient id="lb-gx" gradientUnits="userSpaceOnUse" x1="1440" y1="0" x2="0" y2="0">
            <stop offset="0"    stopColor="#fff" stopOpacity="0" />
            <stop offset="0.14" stopColor="#fff" stopOpacity="0.95" />
            <stop offset="0.55" stopColor="#fff" stopOpacity="0.5" />
            <stop offset="1"    stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="lb-mx" maskUnits="userSpaceOnUse" x="0" y="0" width="1440" height="900">
            <rect width="1440" height="900" fill="url(#lb-gx)" />
          </mask>

          {/* Mascara dos arcos: esmaece no topo e na base */}
          <linearGradient id="lb-gy" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="900">
            <stop offset="0"    stopColor="#fff" stopOpacity="0" />
            <stop offset="0.25" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="0.75" stopColor="#fff" stopOpacity="0.7" />
            <stop offset="1"    stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="lb-my" maskUnits="userSpaceOnUse" x="0" y="0" width="1440" height="900">
            <rect width="1440" height="900" fill="url(#lb-gy)" />
          </mask>
        </defs>

        {/* Marcas de canto */}
        <g fill="none" stroke="currentColor" strokeWidth="1" strokeOpacity="0.35">
          <path d="M 0 52 L 0 0 L 52 0" />
          <path d="M 1388 0 L 1440 0 L 1440 52" />
          <path d="M 0 848 L 0 900 L 52 900" />
          <path d="M 1388 900 L 1440 900 L 1440 848" />
        </g>

        {/* Arcos concentricos centrados no rack */}
        <g mask="url(#lb-my)" fill="none" stroke="currentColor">
          <path className="lb-arco" d="M 1040 0 A 740 740 0 1 1 1040 900" strokeWidth="0.9" strokeOpacity="0.42" />
          <path className="lb-arco" d="M 1297 0 A 560 560 0 1 1 1297 900" strokeWidth="0.75" strokeOpacity="0.3" />
          <path className="lb-arco" d="M 1620 60 A 390 390 0 0 0 1620 840" strokeWidth="0.6" strokeOpacity="0.22" />
        </g>

        {/* Fibras */}
        <g mask="url(#lb-mx)" fill="none" strokeLinecap="round">
          {FIBRAS.map(f => (
            <g key={f.d} className={f.cor}>
              <path d={f.d} stroke="currentColor" strokeWidth={f.largura} />
              <path d={f.d} pathLength={1000} stroke="currentColor" strokeWidth={f.largura * 2.4}
                    strokeDasharray="14 986" className="lb-pacote"
                    style={{ ['--lb-dur' as string]: `${f.duracao}s`, ['--lb-atraso' as string]: `${f.atraso}s` }} />
            </g>
          ))}
        </g>

        {/* Rack: chassi, orelhas, sete unidades de 1U */}
        <g transform="translate(1255, 248)" fill="none" stroke="currentColor" strokeOpacity="0.8">
          <rect x="0" y="0" width="96" height="252" rx="4" strokeWidth="1.1" />
          {[8, 232].flatMap(y => [-8, 96].map(x => (
            <rect key={`${x}-${y}`} x={x} y={y} width="8" height="12" rx="1.5" strokeWidth="0.7" />
          )))}
          {[0, 1, 2, 3, 4, 5, 6].map(i => (
            <g key={i} transform={`translate(6, ${8 + i * 34})`}>
              <rect x="0" y="0" width="84" height="26" rx="2.5" strokeWidth="0.75" />
              <rect x="4"  y="6" width="10" height="14" rx="1" strokeWidth="0.5" fill="currentColor" fillOpacity="0.1" />
              <rect x="18" y="6" width="10" height="14" rx="1" strokeWidth="0.5" fill="currentColor" fillOpacity="0.1" />
              <rect x="34" y="9" width="5" height="4" rx="0.5" strokeWidth="0.4" fill="currentColor" fillOpacity="0.14" />
              <rect x="41" y="9" width="5" height="4" rx="0.5" strokeWidth="0.4" fill="currentColor" fillOpacity="0.14" />
              <circle cx="75" cy="13" r="2.2" stroke="none" fill="currentColor" fillOpacity="0.8" />
              <circle cx="69" cy="13" r="1.4" stroke="none" fill="currentColor" fillOpacity="0.4" />
            </g>
          ))}
          <rect x="6" y="246" width="84" height="4" rx="1" strokeWidth="0.5" fill="currentColor" fillOpacity="0.1" />
        </g>
      </svg>

      {/* Respiro atras do formulario: as fibras passam por tras do titulo e
          do card, e linha fina sob texto pequeno cansa a leitura. */}
      <div className="absolute inset-0"
           style={{ background: 'radial-gradient(ellipse 34% 62% at 50% 50%, rgb(var(--c-bg) / 0.82) 0%, rgb(var(--c-bg) / 0.5) 55%, transparent 100%)' }} />
    </div>
  )
}
