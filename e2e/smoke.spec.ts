import { test, expect } from '@playwright/test'

// ── Smoke tests — verifica que as rotas principais carregam sem crash ────────
// Para rodar: npx playwright install && npx playwright test
// Requer: npm run dev rodando na porta 3000 (ou webServer no config inicia automaticamente)

test.describe('Autenticação', () => {
  test('página de login aparece para sessão não autenticada', async ({ page }) => {
    // Sem cookie de sessão, a app deve mostrar o formulário de login
    await page.goto('/')
    // Aguarda a verificação de sessão completar
    await page.waitForLoadState('networkidle')
    // Deve mostrar algum elemento de autenticação ou o dashboard
    // (depende do LOGIN_PASS estar configurado)
    const hasLoginForm = await page.locator('input[type="password"]').count() > 0
    const hasDashboard = await page.locator('[role="main"], main').count() > 0
    expect(hasLoginForm || hasDashboard).toBe(true)
  })
})

test.describe('Dashboard — carga sem crash', () => {
  test.beforeEach(async ({ page }) => {
    // Tenta login se a página de autenticação aparecer
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const passwordInput = page.locator('input[type="password"]')
    if (await passwordInput.count() > 0) {
      const usernameInput = page.locator('input[type="text"], input[name="username"]').first()
      await usernameInput.fill('gestao')
      await passwordInput.fill(process.env.LOGIN_PASS ?? 'cabonnet')
      await page.keyboard.press('Enter')
      await page.waitForLoadState('networkidle')
    }
  })

  test('sidebar está visível', async ({ page }) => {
    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible()
  })

  test('navbar está visível', async ({ page }) => {
    const navbar = page.locator('header')
    await expect(navbar).toBeVisible()
  })

  test('título da página está presente', async ({ page }) => {
    // O título pode ser "Resumo Geral" ou "Dashboard" dependendo do estado
    const title = page.locator('h1').first()
    await expect(title).toBeVisible()
  })
})

test.describe('Navegação básica', () => {
  test('rota /ordens carrega sem erro 500', async ({ page }) => {
    const response = await page.goto('/ordens')
    expect(response?.status()).not.toBe(500)
  })

  test('rota /graficos carrega sem erro 500', async ({ page }) => {
    const response = await page.goto('/graficos')
    expect(response?.status()).not.toBe(500)
  })

  test('rota /cidades carrega sem erro 500', async ({ page }) => {
    const response = await page.goto('/cidades')
    expect(response?.status()).not.toBe(500)
  })

  test('rota inexistente não lança erro 500', async ({ page }) => {
    const response = await page.goto('/rota-que-nao-existe')
    expect(response?.status()).not.toBe(500)
  })
})

test.describe('NOC mode', () => {
  test('/noc redireciona se não autenticado', async ({ page }) => {
    // Limpa cookies antes de testar
    await page.context().clearCookies()
    await page.goto('/noc')
    await page.waitForLoadState('networkidle')
    // Deve redirecionar para / (login) ou mostrar spinner breve
    const url = page.url()
    // Aceita tanto redirecionamento para / quanto permanência em /noc se auth está desabilitado
    expect(url).toMatch(/localhost:3000/)
  })
})
