/**
 * 排版整改前后对照。
 *
 * 只拍两页样板：反馈中心和项目总览。改前跑一次存 before/，
 * 改后跑一次存 after/，同一视口同一路径，方便逐张对着看。
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] ?? 'screenshots'
const BASE = process.env.GP_BASE_URL ?? 'http://127.0.0.1:5180'

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()

for (const viewport of [
  { name: '1280', width: 1280, height: 1000 },
  { name: '1440', width: 1440, height: 1000 },
]) {
  for (const [route, label] of [
    ['feedback', '反馈中心'],
    ['projects', '项目总览'],
  ]) {
    const page = await browser.newPage({ viewport })
    await page.goto(`${BASE}/#/${route}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/${route}-${viewport.name}.png`, fullPage: true })
    console.log(`✓ ${label} ${viewport.name}`)
    await page.close()
  }
}

await browser.close()
