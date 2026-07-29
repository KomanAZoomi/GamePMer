/** 洞察处置视觉验收截图。 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] ?? 'screenshots'
const BASE = process.env.GP_BASE_URL ?? 'http://127.0.0.1:5180'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()

for (const vp of [
  { name: '1280', width: 1280, height: 900 },
  { name: '1440', width: 1440, height: 950 },
  { name: '1920', width: 1920, height: 1080 },
]) {
  const page = await browser.newPage({ viewport: vp })
  await page.goto(`${BASE}/#/analytics`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/insight-default-${vp.name}.png`, fullPage: true })
  console.log(`✓ insight-default-${vp.name}.png`)

  if (vp.name === '1440') {
    const finding = page.getByLabel('AI 洞察').locator('.gp-insight', { hasText: '结论' }).first()
    await finding.getByRole('button', { name: '暂不采纳', exact: true }).click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/insight-reason-empty-1440.png`, fullPage: true })
    console.log('✓ insight-reason-empty-1440.png')

    await finding.getByLabel('暂不采纳的理由').fill('本季度报价已经报出去了，改模板要等下一批')
    await finding.getByRole('button', { name: '记下不采纳' }).click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/insight-deferred-1440.png`, fullPage: true })
    console.log('✓ insight-deferred-1440.png')
  }
  await page.close()
}
await browser.close()
console.log('截图完成：', OUT)
