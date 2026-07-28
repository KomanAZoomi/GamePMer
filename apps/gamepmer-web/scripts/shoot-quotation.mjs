/**
 * C8 报价与变更视觉验收截图。
 *
 * 三档宽度各一张全景，1440 下再跑一遍主路径：
 * 待复核 → 组长兼 BD 一次复核 → 待开工 → 发出变更开工邮件 → 资产解冻。
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] ?? 'screenshots'
const BASE = process.env.GP_BASE_URL ?? 'http://127.0.0.1:5180'
const PREFIX = 'c8'

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()

for (const viewport of [
  { name: '1280', width: 1280, height: 900 },
  { name: '1440', width: 1440, height: 950 },
  { name: '1920', width: 1920, height: 1080 },
]) {
  const page = await browser.newPage({ viewport })
  await page.goto(`${BASE}/#/quotation`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/${PREFIX}-quotation-${viewport.name}.png`, fullPage: true })
  console.log(`✓ ${PREFIX}-quotation-${viewport.name}.png`)

  if (viewport.name === '1440') {
    await page.getByRole('button', { name: /以组长兼BD身份复核通过/ }).click()
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}/${PREFIX}-approved-1440.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-approved-1440.png`)

    await page.goto(`${BASE}/#/projects`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}/${PREFIX}-gantt-still-frozen-1440.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-gantt-still-frozen-1440.png`)

    await page.goto(`${BASE}/#/quotation`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /我已发出变更开工邮件/ }).click()
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}/${PREFIX}-kickoff-1440.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-kickoff-1440.png`)

    await page.goto(`${BASE}/#/projects`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}/${PREFIX}-gantt-unfrozen-1440.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-gantt-unfrozen-1440.png`)

    await page.goto(`${BASE}/#/quotation`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: '恢复示例数据' }).click()
    await page.waitForTimeout(200)
    await page.getByRole('button', { name: /待开工/ }).click()
    await page.getByLabel('报价案件').getByText(/Q-029/).click()
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}/${PREFIX}-kickoff-blocked-1440.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-kickoff-blocked-1440.png`)

    // 总监报价录入：从「总监报价中」把案件推下去
    await page.getByRole('button', { name: '恢复示例数据' }).click()
    await page.waitForTimeout(200)
    await page.getByLabel('报价案件').getByText(/Q-030/).click()
    await page.getByRole('button', { name: '录入总监报价' }).click()
    await page.getByRole('button', { name: '按 2D 模板生成' }).click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/${PREFIX}-entry-blocked-1440.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-entry-blocked-1440.png`)

    const drawer = page.getByLabel('录入报价')
    for (let row = 1; row <= 3; row += 1) {
      await drawer.getByLabel(`第 ${row} 行 人天`).fill(String(2 + row))
      await drawer.getByLabel(`第 ${row} 行 开始日`).fill('2026-08-17')
      await drawer.getByLabel(`第 ${row} 行 结束日`).fill('2026-08-21')
    }
    await drawer.getByLabel('工期影响').fill('6')
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/${PREFIX}-entry-ready-1440.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-entry-ready-1440.png`)

    await drawer.getByRole('button', { name: '提交给组长/BD 复核' }).click()
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}/${PREFIX}-entry-submitted-1440.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-entry-submitted-1440.png`)
  }

  await page.close()
}

await browser.close()
console.log('截图完成：', OUT)
