import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')

describe('configuração P0 do shell', () => {
  it('encaminha stats e SSE nos dois servidores de desenvolvimento', () => {
    const nodeServer = read('../../servidor.js')
    const viteConfig = read('../../vite.config.js')

    expect(nodeServer).toContain("'/stats'")
    expect(nodeServer).toContain("'/events'")
    expect(viteConfig).toContain("'/stats':")
    expect(viteConfig).toContain("'/events':")
  })

  it('usa somente a fonte Inter local permitida pela CSP', () => {
    const html = read('../../index.html')
    const css = read('../index.css')

    expect(html).not.toContain('fonts.googleapis.com')
    expect(html).not.toContain('fonts.gstatic.com')
    expect(css).toContain('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')
    expect(css).not.toContain('fonts.googleapis.com')
  })

  it('permite somente os endpoints necessarios do Cloudflare Web Analytics', () => {
    const html = read('../../index.html')

    expect(html).toContain("script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com")
    expect(html).toContain('connect-src \'self\' ws: wss: https://nominatim.openstreetmap.org https://cloudflareinsights.com')
  })

  it('não devolve o SPA para chunks removidos e reconhece hashes do Vite', () => {
    const nodeServer = read('../../servidor.js')

    expect(nodeServer).toContain("if (ext) { res.writeHead(404, { 'Cache-Control': 'no-store' })")
    expect(nodeServer).toContain('/\\.[A-Za-z0-9_-]{8,}\\.\\w+$/')
  })

  it('mantém recuo lateral apenas no desktop e drawer fora da tela no mobile', () => {
    const layout = read('../components/layout/AppLayout.tsx')
    const sidebar = read('../components/layout/Sidebar.tsx')

    expect(layout).toContain("'md:pl-[248px]'")
    expect(layout).toContain("'md:pl-[64px]'")
    expect(layout).toContain('md:hidden')
    expect(sidebar).toContain('-translate-x-full')
    expect(sidebar).toContain('md:translate-x-0')
  })

  it('mantém o seletor de campo fora do recorte da barra fixa', () => {
    const dateFilter = read('../components/ui/DateFilterBar.tsx')

    expect(dateFilter).toContain('fixed right-[104px] top-[104px]')
    expect(dateFilter).not.toContain('absolute right-0 top-12')
  })
})
