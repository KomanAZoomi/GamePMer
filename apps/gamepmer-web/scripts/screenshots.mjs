/**
 * 检查点视觉回归截图。
 *
 * 实施计划要求每个检查点都在 1280 / 1440 / 1920 三档出图交用户验收，
 * 所以截图是固定流程的一部分，而不是临时脚本。
 *
 * 用法（先另开一个终端跑 npm.cmd run dev）：
 *   node scripts/screenshots.mjs <输出目录> [检查点前缀]
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] ?? 'screenshots'
const PREFIX = process.argv[3] ?? 'shot'
const BASE = process.env.GP_BASE_URL ?? 'http://localhost:5173'

const VIEWPORTS = [
  { name: '1280', width: 1280, height: 800 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1920', width: 1920, height: 1080 },
]

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()

for (const viewport of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
  })
  await page.goto(`${BASE}/#/tasks`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/${PREFIX}-home-${viewport.name}.png` })
  console.log(`✓ ${PREFIX}-home-${viewport.name}.png`)

  // 项目详情与甘特
  await page.goto(`${BASE}/#/projects`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/${PREFIX}-gantt-${viewport.name}.png` })
  console.log(`✓ ${PREFIX}-gantt-${viewport.name}.png`)

  if (viewport.name === '1440') {
    // 选中一个已修订的阶段：基准条与当前条并存、偏移原因可见
    await page.getByRole('button', { name: /P-2D-018/ }).click()
    await page.waitForTimeout(150)
    await page.getByRole('button', { name: /完成稿.*Yuki/ }).click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/${PREFIX}-gantt-revised-stage-1440.png` })
    console.log(`✓ ${PREFIX}-gantt-revised-stage-1440.png`)

    await page.goto(`${BASE}/#/tasks`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(200)
  }

  if (viewport.name === '1440') {
    // 选中一条客户反馈待办：右侧应出现原始证据、AI 依据和「建议未执行」
    await page.getByRole('button', { name: /新增腰部挂件/ }).click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/${PREFIX}-feedback-selected-1440.png` })
    console.log(`✓ ${PREFIX}-feedback-selected-1440.png`)

    // 未实现模块：必须点得动并说明交付检查点
    await page.getByRole('button', { name: /候选收件箱/ }).click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/${PREFIX}-placeholder-1440.png` })
    console.log(`✓ ${PREFIX}-placeholder-1440.png`)
  }

  await page.close()
}

await browser.close()
console.log('截图完成：', OUT)
