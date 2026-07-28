/**
 * C9 结项中心视觉验收截图。
 *
 * 三档全景 + 1440 下的主路径：阻断态 → 登记 IT 回执 → 可出账 → 通知草稿 → 归档。
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] ?? 'screenshots'
const BASE = process.env.GP_BASE_URL ?? 'http://127.0.0.1:5180'
const PREFIX = 'c9'

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()

for (const viewport of [
  { name: '1280', width: 1280, height: 900 },
  { name: '1440', width: 1440, height: 950 },
  { name: '1920', width: 1920, height: 1080 },
]) {
  const page = await browser.newPage({ viewport })
  await page.goto(`${BASE}/#/closeout`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/${PREFIX}-closeout-${viewport.name}.png`, fullPage: true })
  console.log(`\u2713 ${PREFIX}-closeout-${viewport.name}.png`)

  if (viewport.name === '1440') {
    await page.locator('.gp-gate-track').getByText('通知 BD 出账').click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/${PREFIX}-gate-blocked-1440.png`, fullPage: true })
    console.log(`\u2713 ${PREFIX}-gate-blocked-1440.png`)

    await page.getByLabel('结项项目').getByText(/P-3D-024/).click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/${PREFIX}-precheck-1440.png`, fullPage: true })
    console.log(`\u2713 ${PREFIX}-precheck-1440.png`)

    await page.getByLabel('结项项目').getByText(/P-3D-011/).click()
    const main = page.getByLabel('结项门禁')
    await main.getByLabel('证据类型').selectOption('screenshot')
    await main.getByLabel('邮件主题或路径').fill('wechat_20260727.png')
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/${PREFIX}-evidence-rejected-1440.png`, fullPage: true })
    console.log(`\u2713 ${PREFIX}-evidence-rejected-1440.png`)

    await main.getByLabel('证据类型').selectOption('email')
    await main.getByLabel('邮件主题或路径').fill('RE: P-3D-011 备份完成，已归档')
    await page.waitForTimeout(150)
    await main.getByRole('button', { name: /完成「IT 剪切备份」/ }).click()
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}/${PREFIX}-ready-to-bill-1440.png`, fullPage: true })
    console.log(`\u2713 ${PREFIX}-ready-to-bill-1440.png`)

    const next = page.getByLabel('结项门禁')
    await next.getByLabel('邮件主题或路径').fill('【可出账】P-3D-011 · Aurora Interactive')
    await next.getByRole('button', { name: /完成「通知 BD 出账」/ }).click()
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}/${PREFIX}-billing-draft-1440.png`, fullPage: true })
    console.log(`\u2713 ${PREFIX}-billing-draft-1440.png`)

    await page.getByRole('button', { name: '收到出账回执，归档项目' }).click()
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}/${PREFIX}-archived-1440.png`, fullPage: true })
    console.log(`\u2713 ${PREFIX}-archived-1440.png`)
  }

  await page.close()
}

await browser.close()
console.log('截图完成：', OUT)
