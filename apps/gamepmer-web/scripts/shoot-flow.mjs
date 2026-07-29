/** BD 需求 → 报价 → 复核 → 客户 → 建项 全链路截图。 */
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

  // 1. BD 需求候选：只问客户与批次编号
  await page.goto(`${BASE}/#/inbox`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /需补全/ }).click()
  await page.getByLabel('候选记录').getByText('新角色 6 套时装需求').click()
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${OUT}/flow-1-demand-${vp.name}.png`, fullPage: true })

  // 2. 客户环节
  await page.goto(`${BASE}/#/quotation`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /以组长兼BD身份复核通过/ }).click()
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${OUT}/flow-2-to-client-${vp.name}.png`, fullPage: true })

  await page.getByRole('button', { name: 'BD 已把报价报给客户' }).click()
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${OUT}/flow-3-awaiting-${vp.name}.png`, fullPage: true })

  if (vp.name === '1440') {
    // 3. 客户确认后建项
    await page.goto(`${BASE}/#/quotation`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /客户环节/ }).click()
    await page.getByLabel('报价案件').getByText(/Q-029/).click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/flow-4-build-${vp.name}.png`, fullPage: true })

    await page.getByLabel('报价详情').getByRole('button', { name: /我已发出正式开工邮件/ }).click()
    await page.waitForTimeout(300)
    await page.goto(`${BASE}/#/projects`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/flow-5-project-${vp.name}.png`, fullPage: true })
  }
  await page.close()
  console.log('✓', vp.name)
}
await browser.close()
console.log('截图完成：', OUT)
