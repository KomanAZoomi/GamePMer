import { expect, test } from '@playwright/test'

const section = (page: import('@playwright/test').Page) =>
  page.getByLabel('设置分组').getByRole('button', { name: /^数据与运维/ })

test('载入完整验收场景后，项目、反馈和归档页面看到同一业务线', async ({ page }) => {
  await page.goto('/#/settings')
  await section(page).click()
  await page.getByRole('button', { name: '载入完整验收场景' }).click()
  await page.getByRole('button', { name: '确认载入完整验收场景' }).click()

  const nav = page.getByLabel('全局导航')
  await nav.getByRole('button', { name: '项目总览' }).click()
  await expect(page.getByText('SKF_A_3D_B52', { exact: true }).first()).toBeVisible()

  await nav.getByRole('button', { name: '反馈中心' }).click()
  await expect(page.getByText('F-018', { exact: true })).toBeVisible()

  await nav.getByRole('button', { name: '结项中心' }).click()
  await page.getByRole('button', { name: /已归档/ }).click()
  await expect(page.getByText('SKF_A_3D_B52', { exact: true }).first()).toBeVisible()
})

test('导出产生 JSON 下载，确认后可导入备份', async ({ page }) => {
  await page.goto('/#/settings')
  await section(page).click()
  await page.getByRole('button', { name: '载入完整验收场景' }).click()
  await page.getByRole('button', { name: '确认载入完整验收场景' }).click()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出当前数据' }).click()
  expect((await download).suggestedFilename()).toMatch(/^gamepmer-demo-backup-\d{4}-\d{2}-\d{2}\.json$/)

  const backup = await page.evaluate(() => window.localStorage.getItem('gamepmer.web-demo.v8'))
  await page.getByLabel('导入 GamePMer JSON 备份').setInputFiles({
    name: 'import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'gamepmer-demo-backup', schemaVersion: 8, exportedAt: '2026-08-04T10:00:00+08:00', state: JSON.parse(backup ?? '{}') })),
  })
  await expect(page.getByRole('dialog', { name: '确认导入数据' })).toBeVisible()
  await page.getByRole('button', { name: '确认导入并替换数据' }).click()
  await expect(page.getByRole('dialog', { name: '确认导入数据' })).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('已载入备份')
})
