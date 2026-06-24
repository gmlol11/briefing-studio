import fs from 'node:fs/promises'

import { expect, test } from '@playwright/test'
import { expectDownload, gotoStep, openBriefByTitle } from './helpers'

/** C: экспорт md/json/docx на сгенерированном freeform-брифе (шаг 5). */
test('freeform экспорт: markdown / json / docx скачиваются', async ({ page }) => {
  await openBriefByTitle(page, /Freeform.*готовый/)
  await gotoStep(page, /Финальный бриф/)
  await expect(page.locator('.doc--md')).toBeVisible()

  await expectDownload(
    page,
    () => page.getByRole('button', { name: 'Download Markdown' }).click(),
    /\.md$/,
  )
  await expectDownload(
    page,
    () => page.getByRole('button', { name: 'Download JSON' }).click(),
    /\.json$/,
  )

  const docx = await expectDownload(
    page,
    () => page.getByRole('button', { name: 'Download DOCX' }).click(),
    /\.docx$/,
  )
  // не разбираем содержимое (это backend-тест), но проверим что файл — непустой zip/docx
  const path = await docx.path()
  const buf = await fs.readFile(path)
  expect(buf.length).toBeGreaterThan(0)
  expect(buf.subarray(0, 2).toString('latin1')).toBe('PK')
})
