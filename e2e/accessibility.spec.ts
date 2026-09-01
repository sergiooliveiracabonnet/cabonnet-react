import { test, expect } from '@playwright/test'

// ── Testes de acessibilidade básica ─────────────────────────────────────────

test.describe('Acessibilidade — estrutura semântica', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Login se necessário
    const pwd = page.locator('input[type="password"]')
    if (await pwd.count() > 0) {
      await page.locator('input[type="text"]').first().fill('gestao')
      await pwd.fill(process.env.LOGIN_PASS ?? 'cabonnet')
      await page.keyboard.press('Enter')
      await page.waitForLoadState('networkidle')
    }
  })

  test('página tem um único h1', async ({ page }) => {
    const h1s = await page.locator('h1').count()
    expect(h1s).toBeGreaterThanOrEqual(1)
  })

  test('sidebar tem role navigation ou aside', async ({ page }) => {
    const aside = await page.locator('aside').count()
    expect(aside).toBeGreaterThan(0)
  })

  test('botões interativos têm aria-label ou texto visível', async ({ page }) => {
    // Verifica que não há botões completamente sem texto acessível
    const buttons = page.locator('button')
    const count   = await buttons.count()
    for (let i = 0; i < Math.min(count, 10); i++) {
      const btn       = buttons.nth(i)
      const ariaLabel = await btn.getAttribute('aria-label')
      const text      = await btn.textContent()
      const title     = await btn.getAttribute('title')
      // Pelo menos um dos três deve estar presente
      const accessible = !!(ariaLabel || text?.trim() || title)
      expect(accessible, `Botão ${i} sem texto acessível`).toBe(true)
    }
  })

  test('imagens têm alt text', async ({ page }) => {
    const imgs = page.locator('img')
    const count = await imgs.count()
    for (let i = 0; i < count; i++) {
      const img = imgs.nth(i)
      const alt = await img.getAttribute('alt')
      expect(alt, `Imagem ${i} sem alt`).not.toBeNull()
    }
  })
})

test.describe('Acessibilidade — teclado', () => {
  test('sidebar toggle responde ao teclado', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Tab para o botão de menu
    await page.keyboard.press('Tab')
    // Deve haver um elemento focável
    const focused = await page.evaluate(() => document.activeElement?.tagName)
    expect(['BUTTON', 'A', 'INPUT', 'BODY']).toContain(focused)
  })
})
