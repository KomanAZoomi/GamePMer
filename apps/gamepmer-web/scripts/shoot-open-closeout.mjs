/**
 * 「看板说可以进结项，结项中心却是空的」的修复验收。
 *
 * 把一个还在做的项目全部标成已验收，看结项中心是否给出「开启结项」，
 * 开完之后五道门是不是一道都没预先勾上。
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] ?? 'screenshots'
const BASE = process.env.GP_BASE_URL ?? 'http://127.0.0.1:5180'
const PREFIX = 'c15'

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

// 种子只在内存里，任何一次写操作才会落盘。做一次判定再撤销，
// 状态回到原样但存储已经建立，后面才改得动
await page.goto(`${BASE}/#/feedback`, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
const detail = page.getByLabel('反馈项详情')
await detail.getByRole('button', { name: /无需修改/ }).click()
await detail.getByRole('button', { name: '重新判定' }).click()
await page.waitForTimeout(300)

// 直接改存储，模拟「这个项目的阶段都验收完了」
await page.evaluate(() => {
  const key = Object.keys(localStorage).find((entry) => entry.startsWith('gamepmer.web-demo'))
  const demo = JSON.parse(localStorage.getItem(key))
  const target = demo.projects.find(
    (project) => !demo.closeoutCases.some((entry) => entry.projectCode === project.code),
  )
  for (const asset of target.assets) for (const stage of asset.stages) stage.status = 'Approved'
  localStorage.setItem(key, JSON.stringify(demo))
})

// SPA 只在加载时读一次存储，改完必须真刷新，不能只换 hash
await page.goto(`${BASE}/#/closeout`, { waitUntil: 'networkidle' })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/${PREFIX}-ready.png`, fullPage: true })
console.log(`✓ ${PREFIX}-ready.png`)

await page.getByLabel('可开启结项').getByRole('button', { name: '开启结项' }).first().click()
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/${PREFIX}-opened.png`, fullPage: true })
console.log(`✓ ${PREFIX}-opened.png`)

await browser.close()
