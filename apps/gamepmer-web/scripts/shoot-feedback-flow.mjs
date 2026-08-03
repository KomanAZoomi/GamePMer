/**
 * 反馈中心内置阶段推进的视觉验收。
 *
 * 走 PM 实际那条路，全程不离开反馈中心：
 * 判为范围内 → 生成排期草案 → 确认重排 → 已交 PM → 已提交客户（等二次反馈）
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] ?? 'screenshots'
const BASE = process.env.GP_BASE_URL ?? 'http://127.0.0.1:5180'
const PREFIX = 'c13'

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

await page.goto(`${BASE}/#/feedback`, { waitUntil: 'networkidle' })
const detail = page.getByLabel('反馈项详情')
const flow = page.getByLabel('推进这条反馈所在阶段')

await detail.getByRole('button', { name: '判为范围内' }).click()
await page.getByRole('button', { name: '生成排期草案' }).click()
await page.getByLabel('排期修订草案').getByRole('button', { name: '确认重排' }).click()
await page.waitForTimeout(250)
await page.screenshot({ path: `${OUT}/${PREFIX}-01-in-rework.png`, fullPage: true })
console.log(`✓ ${PREFIX}-01-in-rework.png`)

await flow.getByRole('button', { name: '已交 PM' }).click()
await page.waitForTimeout(200)
await flow.getByRole('button', { name: '已提交客户' }).click()
await page.waitForTimeout(250)
await page.screenshot({ path: `${OUT}/${PREFIX}-02-awaiting-client.png`, fullPage: true })
console.log(`✓ ${PREFIX}-02-awaiting-client.png`)

await browser.close()
