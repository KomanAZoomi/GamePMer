/**
 * 反馈判定第三条路「无需修改」的视觉验收。
 *
 * 验收时指出：反馈判完只有范围内/范围外，没有「通过」。
 * 这里要看见三件事：
 *   1. 分流按钮是三个，不是两个
 *   2. 判为无需修改后当场了结，且能重新判定
 *   3. 阶段上的反馈全部了结时，指向真正的下一步——客户验收
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] ?? 'screenshots'
const BASE = process.env.GP_BASE_URL ?? 'http://127.0.0.1:5180'
const PREFIX = 'c12'

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()

for (const viewport of [
  { name: '1280', width: 1280, height: 900 },
  { name: '1440', width: 1440, height: 950 },
  { name: '1920', width: 1920, height: 1080 },
]) {
  const page = await browser.newPage({ viewport })
  await page.goto(`${BASE}/#/feedback`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/${PREFIX}-feedback-${viewport.name}.png`, fullPage: true })
  console.log(`✓ ${PREFIX}-feedback-${viewport.name}.png`)

  if (viewport.name === '1440') {
    const detail = page.getByLabel('反馈项详情')

    await detail.getByRole('button', { name: /无需修改/ }).click()
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}/${PREFIX}-no-change-closed.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-no-change-closed.png`)

    // 把这个阶段上剩下的待分流反馈也判掉，看全部了结后的收口指引
    const list = page.getByLabel('资产级反馈项')
    for (const title of ['新增腰部挂件', '胸甲纹理走向调整']) {
      const row = list.getByText(title)
      if ((await row.count()) === 0) continue
      await row.first().click()
      await page.waitForTimeout(150)
      const button = detail.getByRole('button', { name: /无需修改/ })
      if ((await button.count()) === 0) continue
      await button.click()
      await page.waitForTimeout(150)
    }

    await page.screenshot({ path: `${OUT}/${PREFIX}-stage-settled.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-stage-settled.png`)
  }

  await page.close()
}

await browser.close()
