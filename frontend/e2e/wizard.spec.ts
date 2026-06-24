import { expect, test } from '@playwright/test'
import { expectDownload, openBriefByTitle } from './helpers'

/** A + D: wizard-flow routing и DOCX-паритет (на demo-seed, без LLM). */
test.describe('wizard flow', () => {
  test('wizard-бриф открывается в редакторе, не в review', async ({ page }) => {
    await openBriefByTitle(page, /промо-ролик/)
    await expect(page).toHaveURL(/\/brief\/\d+$/) // не /review
    await expect(
      page.getByRole('heading', { name: 'AI-проверка и генерация' }),
    ).toBeVisible()
    await expect(page.locator('.review-stepper')).toHaveCount(0)
  })

  test('wizard generated-бриф: экспорт-зона + Download DOCX скачивает .docx', async ({
    page,
  }) => {
    await openBriefByTitle(page, /Wizard.*готовый/)
    await expect(page).toHaveURL(/\/brief\/\d+$/)
    const docxBtn = page.getByRole('button', { name: 'Download DOCX' })
    await expect(docxBtn).toBeVisible()
    await expectDownload(page, () => docxBtn.click(), /\.docx$/)
  })
})
