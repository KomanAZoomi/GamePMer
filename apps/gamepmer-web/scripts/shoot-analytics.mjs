/** C11 智能分析视觉验收截图。 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] ?? 'screenshots'
const BASE = process.env.GP_BASE_URL ?? 'http://127.0.0.1:5180'
const PREFIX = 'c11'

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()

const tab = (page, label) =>
  page.locator('.gp-analytics .gp-chip-row').getByRole('button', { name: label })

for (const viewport of [
  { name: '1280', width: 1280, height: 900 },
  { name: '1440', width: 1440, height: 950 },
  { name: '1920', width: 1920, height: 1080 },
]) {
  const page = await browser.newPage({ viewport })
  await page.goto(`${BASE}/#/analytics`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/${PREFIX}-analytics-${viewport.name}.png`, fullPage: true })
  console.log(`✓ ${PREFIX}-analytics-${viewport.name}.png`)

  if (viewport.name === '1440') {
    for (const [label, slug] of [
      ['延期归因', 'attribution'],
      ['产能与负载', 'capacity'],
      ['报价与变更', 'quote'],
    ]) {
      await tab(page, label).click()
      await page.waitForTimeout(250)
      await page.screenshot({ path: `${OUT}/${PREFIX}-${slug}-1440.png`, fullPage: true })
      console.log(`✓ ${PREFIX}-${slug}-1440.png`)
    }
  }

  await page.close()
}

await browser.close()
console.log('截图完成：', OUT)
