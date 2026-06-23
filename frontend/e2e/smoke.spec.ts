import { expect, test } from '@playwright/test'

/**
 * Trivial smoke: основные страницы рендерятся. Не зависит от backend-данных —
 * проверяет статичные заголовки/ссылки (устойчиво к пустому/неподнятому списку).
 */
test.describe('smoke: основные страницы рендерятся', () => {
  test('главная /', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Создать по шагам' })).toBeVisible()
    await expect(
      page.getByRole('link', { name: /AI-бриф из свободного ввода/ }),
    ).toBeVisible()
  })

  test('список брифов /briefs', async ({ page }) => {
    await page.goto('/briefs')
    await expect(page.getByRole('heading', { level: 1, name: 'Брифы' })).toBeVisible()
  })

  test('список брендов /brands', async ({ page }) => {
    await page.goto('/brands')
    await expect(page.getByRole('heading', { level: 1, name: 'Бренды' })).toBeVisible()
  })
})
