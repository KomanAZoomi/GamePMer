/**
 * README 界面截图。
 *
 * 输出到固定路径 `docs/screenshots/`，重跑就地覆盖——README 里的链接因此不会失效，
 * 而截图永远对应当前 HEAD。这一点是刻意的：仓库里曾经只剩 7 月那批白色原型截图，
 * 而界面早就换成暗色默认了，看图的人得到的是错的印象。
 *
 * 十个导航模块 × 暗色/亮色，各一张 1440×900。不截 1280 和 1920：
 * 那两档是溢出门禁的事（e2e/layout-overflow.spec.ts 逐元素量），
 * 这里只负责「让人看清这个工作台长什么样」。
 *
 * 用法（先起构建产物，不要用 dev server——dev 的模块瀑布会让 networkidle 不稳）：
 *   npm.cmd run build
 *   npx.cmd vite preview --port 5180 --strictPort
 *   npm.cmd run shots
 */
import { chromium } from '@playwright/test'
import { mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.argv[2] ?? '../../docs/screenshots'
const BASE = process.env.GP_BASE_URL ?? 'http://127.0.0.1:5180'

/** 顺序与左侧导航一致，编号让文件在目录里按导航顺序排列 */
const ROUTES = [
  ['tasks', '任务管理'],
  ['projects', '项目总览'],
  ['inbox', '候选收件箱'],
  ['schedule', '排期管理'],
  ['feedback', '反馈中心'],
  ['quotation', '报价与变更'],
  ['closeout', '结项中心'],
  ['files', '文件与归档'],
  ['analytics', '智能分析'],
  ['settings', '设置中心'],
]

const THEMES = ['dark', 'light']

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()

for (const theme of THEMES) {
  // 每套主题用全新上下文：localStorage 为空时仓储会自动灌种子数据，
  // 于是两套主题拍到的是同一份初始状态，可以直接并排比。
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  await page.goto(`${BASE}/#/tasks`, { waitUntil: 'networkidle' })
  // 偏好是裸字符串存的，写完必须刷新才走防闪烁脚本
  await page.evaluate((value) => {
    localStorage.setItem('gamepmer.appearance.theme', value)
  }, theme)
  await page.reload({ waitUntil: 'networkidle' })

  // 暗色是 :root 默认值，切换失败会安静地退回暗色——不校验就会拍出两套一样的图
  const resolved = await page.locator('html').getAttribute('data-theme-resolved')
  if (resolved !== theme) {
    throw new Error(`主题切换失败：期望 ${theme}，实际 ${resolved}`)
  }

  for (const [index, [route, name]] of ROUTES.entries()) {
    await page.goto(`${BASE}/#/${route}`, { waitUntil: 'networkidle' })
    // 换页入场动画 240ms，加导航过渡，等它落定再拍
    await page.waitForTimeout(500)

    const file = `${String(index + 1).padStart(2, '0')}-${route}-${theme}.png`
    await page.screenshot({ path: join(OUT, file) })
    console.log(`✓ ${file}  ${name}`)
  }

  await context.close()
}

await browser.close()

const files = readdirSync(OUT).filter((f) => f.endsWith('.png'))
const bytes = files.reduce((total, f) => total + statSync(join(OUT, f)).size, 0)
console.log(`\n共 ${files.length} 张，合计 ${(bytes / 1024 / 1024).toFixed(1)} MB → ${OUT}`)
