/**
 * 反馈中心「在等谁」三栏看板的视觉验收。
 *
 * 三档宽度各一张，另外走一遍循环：判范围 → 确认排期 → 反馈已发给团队，
 * 看卡片是否真的从「等我」挪到「等团队」。
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] ?? 'screenshots'
const BASE = process.env.GP_BASE_URL ?? 'http://127.0.0.1:5180'
const PREFIX = 'c14'

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()

for (const viewport of [
  { name: '1280', width: 1280, height: 1000 },
  { name: '1440', width: 1440, height: 1000 },
  { name: '1920', width: 1920, height: 1080 },
]) {
  const page = await browser.newPage({ viewport })
  await page.goto(`${BASE}/#/feedback`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/${PREFIX}-board-${viewport.name}.png`, fullPage: true })
  console.log(`✓ ${PREFIX}-board-${viewport.name}.png`)
  await page.close()
}

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
await page.goto(`${BASE}/#/feedback`, { waitUntil: 'networkidle' })

// 把高模上三条反馈判完，走到「返修通知待发出」
await page.getByLabel('在等谁看板').getByRole('button', { name: '去判范围' }).first().click()
for (const title of ['新增腰部挂件', '胸甲纹理走向调整']) {
  await page.getByLabel('资产级反馈项').getByText(title).first().click()
  await page.getByLabel('反馈项详情').getByRole('button', { name: /无需修改/ }).click()
}
await page.getByLabel('资产级反馈项').getByText('缩小肩甲比例').first().click()
await page.getByLabel('反馈项详情').getByRole('button', { name: '判为范围内' }).click()
await page.getByRole('button', { name: '生成排期草案' }).click()
await page.getByLabel('排期修订草案').getByRole('button', { name: '确认重排' }).click()
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/${PREFIX}-wait-me-send.png`, fullPage: true })
console.log(`✓ ${PREFIX}-wait-me-send.png`)

await page.getByLabel('在等谁看板').getByRole('button', { name: '反馈已发给团队' }).click()
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/${PREFIX}-wait-team.png`, fullPage: true })
console.log(`✓ ${PREFIX}-wait-team.png`)

await browser.close()
