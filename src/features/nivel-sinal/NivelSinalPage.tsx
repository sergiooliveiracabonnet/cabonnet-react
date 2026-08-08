const FRAME_TITLE = 'Console óptico — nível de sinal das ONUs'

export default function NivelSinalPage() {
  return (
    <section
      aria-label="Nível de sinal das ONUs"
      className="h-[calc(100vh-9.5rem)] min-h-[36rem] overflow-hidden rounded-xl border border-white/[0.08] bg-card shadow-lg"
    >
      <iframe
        title={FRAME_TITLE}
        src="/nivel-de-sinal.html"
        sandbox="allow-scripts allow-forms allow-downloads"
        className="h-full w-full border-0 bg-white"
      />
    </section>
  )
}
