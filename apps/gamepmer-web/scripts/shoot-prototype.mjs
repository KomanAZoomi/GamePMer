/**
 * 给静态原型 HTML 截图。
 *
 * 实施计划规定：没有原型的页面必须先补原型交用户确认，再写代码（C3a）。
 * 原型是独立 HTML，不经过 dev server，所以单独一个脚本。
 *
 * 用法：node scripts/shoot-prototype.mjs <html 路径> <输出 png 路径> [宽度]
 */
import { chromium } from '@playwright/test'
import { pathToFileURL } from 'node:url'

const file = process.argv[2]
const out = process.argv[3]
const width = Number(process.argv[4] ?? 1920)

if (!file || !out) {
  console.error('用法：node scripts/shoot-prototype.mjs <html> <png> [宽度]')
  process.exit(1)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width, height: 1080 } })
await page.goto(pathToFileURL(file).href, { waitUntil: 'load' })
await page.waitForTimeout(400)
await page.screenshot({ path: out, fullPage: true })
await browser.close()
console.log('✓', out)
