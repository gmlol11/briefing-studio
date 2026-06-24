import { expect, type Download, type Page } from '@playwright/test'

/** Открыть demo-бриф из списка по фрагменту title (`[DEMO] …`).
 *  Ищем по роли link — список рендерит каждый бриф как ссылку с заголовком. */
export async function openBriefByTitle(page: Page, titleRe: RegExp): Promise<void> {
  await page.goto('/briefs')
  await page.getByRole('link', { name: titleRe }).first().click()
}

/** Перейти на шаг review-степпера по фрагменту его названия (шаги — это кнопки). */
export async function gotoStep(page: Page, titleRe: RegExp): Promise<void> {
  await page.getByRole('button', { name: titleRe }).click()
}

/** Кликнуть и дождаться download; проверить расширение имени файла. Возвращает Download. */
export async function expectDownload(
  page: Page,
  trigger: () => Promise<void>,
  extRe: RegExp,
): Promise<Download> {
  const downloadPromise = page.waitForEvent('download')
  await trigger()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(extRe)
  return download
}
