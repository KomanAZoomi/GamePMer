/** C10 文件与归档视觉验收截图（项目级路径登记簿版）。 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] ?? 'screenshots'
const BASE = process.env.GP_BASE_URL ?? 'http://127.0.0.1:5180'
const PREFIX = 'c10'

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()

for (const viewport of [
  { name: '1280', width: 1280, height: 900 },
  { name: '1440', width: 1440, height: 950 },
  { name: '1920', width: 1920, height: 1080 },
]) {
  const page = await browser.newPage({ viewport })
  await page.goto(`${BASE}/#/files`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/${PREFIX}-files-${viewport.name}.png`, fullPage: true })
  console.log(`✓ ${PREFIX}-files-${viewport.name}.png`)

  if (viewport.name === '1440') {
    // 登记态：填了一半，校验没过
    const row = page.getByLabel('盘位路径').locator('tr').filter({ hasText: '最终包' })
    await row.getByRole('button', { name: '登记路径' }).click()
    await row.getByLabel('最终包 路径').fill('Final/NST')
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/${PREFIX}-invalid-1440.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-invalid-1440.png`)

    await row.getByRole('button', { name: /按约定填入/ }).click()
    await row.getByLabel('最终包 备注').fill('总监整理，含源文件与 LOD 清单')
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/${PREFIX}-editing-1440.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-editing-1440.png`)

    await row.getByRole('button', { name: '保存' }).click()
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}/${PREFIX}-saved-1440.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-saved-1440.png`)

    // 只登记了一半的批次
    await page.getByRole('button', { name: '恢复示例数据' }).click()
    await page.waitForTimeout(200)
    await page.getByLabel('批次', { exact: true }).getByText('NPC 服装套装').click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/${PREFIX}-partial-1440.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-partial-1440.png`)

    // 还没建项、只在报价里出现的批次
    await page.getByLabel('批次', { exact: true }).getByText('尚未建项（报价中）').first().click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/${PREFIX}-not-created-1440.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-not-created-1440.png`)
  }

  await page.close()
}

await browser.close()
console.log('截图完成：', OUT)
