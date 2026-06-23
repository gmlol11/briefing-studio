import { expect, test } from '@playwright/test'
import { gotoStep, openBriefByTitle } from './helpers'

const STEP_TITLES = [
  'Структура документа',
  'Исходный бриф и summary',
  'Структурирование',
  'Уточнения',
  'Финальный бриф',
]

/** B + E: review-степпер, контент шагов, fresh/outdated статус (на demo-seed). */
test.describe('freeform review stepper', () => {
  test('степпер из 5 шагов и контент каждого шага', async ({ page }) => {
    await openBriefByTitle(page, /Freeform.*готовый/)
    await expect(page).toHaveURL(/\/review$/)

    await expect(page.locator('.review-state-summary')).toBeVisible()
    await expect(page.locator('.review-stepper')).toBeVisible()
    await expect(page.locator('.review-step')).toHaveCount(5)
    for (const title of STEP_TITLES) {
      await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible()
    }
    // generated + не менялся → актуален
    await expect(page.locator('.review-state-summary')).toContainText('Документ актуален')

    await gotoStep(page, /Структура документа/)
    await expect(page.locator('.template-editor')).toBeVisible()

    await gotoStep(page, /Исходный бриф и summary/)
    await expect(page.getByRole('heading', { name: 'Ключевые факты' })).toBeVisible()

    await gotoStep(page, /Структурирование/)
    await expect(page.locator('.review-card').first()).toBeVisible()
    await expect(page.locator('.status-badge').first()).toBeVisible()
    await expect(page.locator('.source-badge').first()).toBeVisible()

    await gotoStep(page, /Уточнения/)
    await expect(page.locator('.clarification-card').first()).toBeVisible()

    await gotoStep(page, /Финальный бриф/)
    await expect(page.locator('.doc--md')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Download DOCX' })).toBeVisible()
  })

  test('смена структуры делает документ устаревшим (без LLM)', async ({ page }) => {
    await openBriefByTitle(page, /Freeform.*готовый/)
    await gotoStep(page, /Структура документа/)

    // снять первый чекбокс в дереве шаблона и сохранить структуру
    await page.locator('.template-editor input[type="checkbox"]').first().uncheck()
    await page.getByRole('button', { name: 'Сохранить структуру' }).click()

    // бриф перечитывается → сводка показывает «Документ устарел»
    await expect(page.locator('.review-state-summary')).toContainText('Документ устарел')
  })
})
