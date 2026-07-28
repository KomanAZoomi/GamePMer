/** C10 文件与归档视觉验收截图。 */
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
  console.log(`\u2713 ${PREFIX}-files-${viewport.name}.png`)

  if (viewport.name === '1440') {
    await page.getByLabel('文件索引').getByText('机甲主角_最终版本_改过的_v3_ok.fbx').click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/${PREFIX}-unresolved-1440.png`, fullPage: true })
    console.log(`\u2713 ${PREFIX}-unresolved-1440.png`)

    await page.getByLabel('文件详情').getByLabel('关联到阶段').selectOption('MECH-01/3D_LOW')
    await page.getByLabel('文件详情').getByRole('button', { name: '确认关联' }).click()
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}/${PREFIX}-linked-1440.png`, fullPage: true })
    console.log(`\u2713 ${PREFIX}-linked-1440.png`)

    await page.getByRole('button', { name: '恢复示例数据' }).click()
    await page.waitForTimeout(200)
    await page.getByLabel('文件索引').getByText('MECH-02', { exact: true }).click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/${PREFIX}-needs-review-1440.png`, fullPage: true })
    console.log(`\u2713 ${PREFIX}-needs-review-1440.png`)
  }

  await page.close()
}

await browser.close()
console.log('截图完成：', OUT)
