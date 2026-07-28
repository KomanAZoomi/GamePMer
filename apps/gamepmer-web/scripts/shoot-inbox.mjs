/**
 * C7 候选收件箱视觉验收截图。
 *
 * 三档宽度各出一张全景，1440 下再跑一遍主路径：
 * 阻断 → 补全 → 解禁 → 确认 → 追回正式记录，以及零审批导入。
 *
 * 用法（先另开终端跑 npm.cmd run dev -- --host 127.0.0.1 --port 5180 --strictPort）：
 *   node scripts/shoot-inbox.mjs <输出目录>
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] ?? 'screenshots'
const BASE = process.env.GP_BASE_URL ?? 'http://127.0.0.1:5180'
const PREFIX = 'c7'

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()

for (const viewport of [
  { name: '1280', width: 1280, height: 900 },
  { name: '1440', width: 1440, height: 950 },
  { name: '1920', width: 1920, height: 1080 },
]) {
  const page = await browser.newPage({ viewport })
  await page.goto(`${BASE}/#/inbox`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/${PREFIX}-inbox-${viewport.name}.png`, fullPage: true })
  console.log(`✓ ${PREFIX}-inbox-${viewport.name}.png`)

  if (viewport.name === '1440') {
    // 阻断态：缺关联资产
    await page.getByRole('button', { name: /需补全/ }).click()
    await page.getByText('高模散热口位置需要下移').click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/${PREFIX}-inbox-blocked-1440.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-inbox-blocked-1440.png`)

    // 低置信度：OCR 把 0 认成 O
    await page.getByText(/贴图材质偏灰/).click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/${PREFIX}-inbox-lowconf-1440.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-inbox-lowconf-1440.png`)

    // 补全字段 → 解禁
    await page.getByText('高模散热口位置需要下移').click()
    await page.getByRole('button', { name: '未识别' }).first().click()
    await page.getByLabel('关联资产').selectOption('MECH-02')
    await page.getByRole('button', { name: '保存' }).click()
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}/${PREFIX}-inbox-filled-1440.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-inbox-filled-1440.png`)

    // 确认 → 生成反馈批次
    await page.getByRole('button', { name: /确认并创建反馈批次/ }).click()
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}/${PREFIX}-inbox-confirmed-1440.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-inbox-confirmed-1440.png`)

    // 追回正式记录：反馈中心里多了一个批次
    await page.goto(`${BASE}/#/feedback`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}/${PREFIX}-feedback-from-inbox-1440.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-feedback-from-inbox-1440.png`)

    // 零审批导入
    await page.goto(`${BASE}/#/inbox`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /导入候选/ }).click()
    await page.getByLabel('原文').fill('【P-3D-031】PROP-02 贴图需要重做，金属部分再亮一点。')
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/${PREFIX}-inbox-import-1440.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-inbox-import-1440.png`)

    await page.getByRole('button', { name: '识别并生成候选' }).click()
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}/${PREFIX}-inbox-imported-1440.png`, fullPage: true })
    console.log(`✓ ${PREFIX}-inbox-imported-1440.png`)
  }

  await page.close()
}

await browser.close()
console.log('截图完成：', OUT)
