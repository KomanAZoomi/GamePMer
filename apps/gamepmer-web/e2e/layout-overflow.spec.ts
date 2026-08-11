import { expect, test } from '@playwright/test'

/**
 * 版面溢出门禁。
 *
 * 起因：阶段流平铺视图曾把内容撑出卡片边框，而当时的检查只看
 * `document.documentElement.scrollWidth`——`.gp-content` 自带 `overflow: auto`，
 * 把溢出吃掉了，页面级检查因此一片绿。真正要查的是**每一个元素**：
 * 内容有没有溢出自己却又不能滚，以及有没有越出最近的裁剪祖先。
 *
 * 1280 是设计说明定的最低有效宽度，所以三档宽度都要过。
 */

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
] as const

/** 1px 是子像素舍入的正常噪声，超过就是真溢出 */
const TOLERANCE = 2

async function findOverflow(page: import('@playwright/test').Page) {
  return page.evaluate((tolerance) => {
    const hits: Array<{ kind: string; el: string; px: number; of?: string }> = []

    const scrolls = (el: Element) => {
      const o = getComputedStyle(el).overflowX
      return o === 'auto' || o === 'scroll'
    }
    const label = (el: Element) => {
      const cls = el.className?.toString().trim().split(/\s+/).slice(0, 2).join('.')
      return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`
    }

    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) continue
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      if (style.position === 'fixed') continue

      // 内容横向溢出自己，而自己既不能滚也没裁剪 → 内容被顶出去了
      const selfOverflow = el.scrollWidth - el.clientWidth
      if (selfOverflow > tolerance && !scrolls(el) && style.overflowX !== 'hidden') {
        hits.push({ kind: '内容溢出且不可滚', el: label(el), px: selfOverflow })
      }

      // 越出最近的裁剪祖先 → 视觉上冲出框
      let clip: Element | null = el.parentElement
      while (clip && clip !== document.body) {
        const cs = getComputedStyle(clip)
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') break
        clip = clip.parentElement
      }
      if (clip && clip !== document.body && !scrolls(clip)) {
        const over = Math.round(rect.right - clip.getBoundingClientRect().right)
        if (over > tolerance) {
          hits.push({ kind: '越出裁剪祖先', el: label(el), px: over, of: label(clip) })
        }
      }
    }

    const seen = new Set<string>()
    return hits.filter((h) => {
      const key = `${h.kind}|${h.el}|${h.of ?? ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, TOLERANCE)
}

/**
 * 入场动画期间的溢出。
 *
 * 上面那组门禁是「打开页面 → 量一次」，量到的是动画结束后的静止态，
 * 因此漏掉了智能详情卡：它曾经从 translateX(8px) 滑进来，
 * 而它的宽度正好等于所在栅格列宽，滑动那 420ms 会顶出列外，
 * 每换一次选中项底部就闪一下横向滚动条。
 * 所以这里必须在动画进行中连续采样，而不是等它落定。
 */
test('智能详情入场动画不把卡片顶出栅格列', async ({ page }) => {
  await page.goto('/#/tasks')
  await page.waitForLoadState('networkidle')

  // 从任务管理点进项目总览，详情卡才会带着选中项重新入场
  await page.getByRole('button', { name: '项目总览' }).click()

  const worst = await page.evaluate(async () => {
    const deadline = performance.now() + 700
    let max = 0
    while (performance.now() < deadline) {
      const card = document.querySelector('.gp-detail')
      const column = document.querySelector('.gp-project-side')
      if (card && column) {
        const over = card.getBoundingClientRect().right - column.getBoundingClientRect().right
        max = Math.max(max, over)
      }
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
    return Math.round(max)
  })

  expect(worst, `详情卡在入场过程中最多顶出列外 ${worst}px`).toBeLessThanOrEqual(TOLERANCE)
})

for (const width of [1280, 1440, 1920]) {
  for (const theme of ['dark', 'light'] as const) {
    const themeName = theme === 'dark' ? '暗色' : '亮色'

    test.describe(`版面在 ${width}px ${themeName}不溢出`, () => {
      test.use({ viewport: { width, height: 1000 } })

      test.beforeEach(async ({ page }) => {
        // 两套主题的字重、内边距和边框都不同，宽度敏感的地方要分别量。
        // 偏好是裸字符串存的，写完必须刷新才走防闪烁脚本；
        // 暗色又是 `:root` 默认值，不断言 data-theme-resolved 的话，
        // 切换失败会安静地退回暗色，亮色那一半就白跑了。
        await page.goto('/#/tasks')
        await page.evaluate((value) => {
          localStorage.setItem('gamepmer.appearance.theme', value)
        }, theme)
        await page.reload()
        await expect(page.locator('html')).toHaveAttribute('data-theme-resolved', theme)
      })

      for (const [route, name] of ROUTES) {
        test(`${name}`, async ({ page }) => {
          await page.goto(`/#/${route}`)
          await page.waitForLoadState('networkidle')

          const hits = await findOverflow(page)
          const report = hits
            .map((h) => `${h.kind} ${h.el}${h.of ? ' 越出 ' + h.of : ''} +${h.px}px`)
            .join('\n')
          expect(hits, `${name}（${width}px ${themeName}）有元素溢出：\n${report}`).toEqual([])
        })
      }
    })
  }
}
