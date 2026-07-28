/** C12 设置中心视觉验收截图。 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] ?? 'screenshots'
const BASE = process.env.GP_BASE_URL ?? 'http://127.0.0.1:5180'
const PREFIX = 'c12'

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()

const section = (page, label) =>
  page.getByLabel('设置分组').getByRole('button', { name: new RegExp(`^${label}`) })

for (const viewport of [
  { name: '1280', width: 1280, height: 900 },
  { name: '1440', width: 1440, height: 950 },
  { name: '1920', width: 1920, height: 1080 },
]) {
  const page = await browser.newPage({ viewport })
  await page.goto(`${BASE}/#/settings`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/${PREFIX}-settings-${viewport.name}.png`, fullPage: true })
  console.log(`✓ ${PREFIX}-settings-${viewport.name}.png`)

  if (viewport.name === '1440') {
    await page.getByRole('button', { name: '替换 Key' }).click()
    await page.getByLabel('API Key').fill('sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789')
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/${PREFIX}-key-1440.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-key-1440.png`)

    for (const [label, slug] of [
      ['连接器', 'connectors'],
      ['成员与角色', 'org'],
      ['业务规则', 'rules'],
      ['数据与运维', 'ops'],
    ]) {
      await section(page, label).click()
      await page.waitForTimeout(200)
      await page.screenshot({ path: `${OUT}/${PREFIX}-${slug}-1440.png`, fullPage: true })
      console.log(`✓ ${PREFIX}-${slug}-1440.png`)
    }
  }

  await page.close()
}

await browser.close()
console.log('截图完成：', OUT)
