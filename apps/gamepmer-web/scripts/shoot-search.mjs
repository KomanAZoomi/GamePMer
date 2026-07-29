/** 顶栏全局搜索视觉验收截图。 */
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
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByRole('combobox').fill('MECH')
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${OUT}/search-hits-${vp.name}.png` })
  console.log(`✓ search-hits-${vp.name}.png`)

  if (vp.name === '1440') {
    for (const [q, slug] of [
      ['NST_A_3D_B24', 'code'],
      ['NAS-ART', 'path'],
      ['M', 'tooshort'],
      ['zzzz不存在的东西', 'nomatch'],
    ]) {
      await page.getByRole('combobox').fill(q)
      await page.waitForTimeout(200)
      await page.screenshot({ path: `${OUT}/search-${slug}-1440.png` })
      console.log(`✓ search-${slug}-1440.png`)
    }
  }
  await page.close()
}
await browser.close()
console.log('截图完成：', OUT)
