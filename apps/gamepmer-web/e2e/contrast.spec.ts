import { expect, test, type Page } from '@playwright/test'

/**
 * 文本对比度门禁（WCAG AA）。
 *
 * 起因：一轮全站审计一次捞出 170 处不达标，根因只有四个，全在令牌层——
 * 两档次级文字色定得太浅、甘特条的标签统一用近白色压在浅底上、
 * 还有一张做成 `<button>` 的卡片没写 background，坐在浏览器默认的 buttonface 灰上。
 * 这类问题肉眼扫页面扫不出来（每一处单看都"还行"），只有量才有结论，
 * 所以固化成门禁。
 *
 * 两个必须坚持的细节：
 * - **渐变底要按最不利的那个色标算**。跳过渐变等于放掉全站近一半的文字，
 *   面板底色恰恰全是渐变。
 * - **先断言主题真的切过去了再量**。此前有过 `addInitScript` 静默失败、
 *   十张"亮色"截图其实全是暗色的教训：暗色是 `:root` 默认值，写不进去也不报错。
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

interface Hit {
  el: string
  text: string
  ratio: number
  need: number
  size: number
  color: string
  bg: string
}

async function findLowContrast(page: Page): Promise<Hit[]> {
  return page.evaluate(() => {
    const parse = (value: string) => {
      const m = value.match(/[\d.]+/g)
      if (!m) return null
      const [r, g, b, a = '1'] = m.map(Number)
      return { r, g, b, a }
    }

    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        const c = v / 255
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }

    const ratio = (
      fg: { r: number; g: number; b: number },
      bg: { r: number; g: number; b: number },
    ) => {
      const a = lum(fg) + 0.05
      const b = lum(bg) + 0.05
      return a > b ? a / b : b / a
    }

    // 半透明前景先按 alpha 压到背景上，否则算出来的对比度偏高
    const flatten = (
      fg: { r: number; g: number; b: number; a: number },
      bg: { r: number; g: number; b: number },
    ) =>
      fg.a >= 1
        ? fg
        : {
            r: fg.r * fg.a + bg.r * (1 - fg.a),
            g: fg.g * fg.a + bg.g * (1 - fg.a),
            b: fg.b * fg.a + bg.b * (1 - fg.a),
          }

    /** 渐变底取所有色标里最不利的一个；解析不出来就当没有底，交给上层继续找 */
    const gradientStops = (image: string) => {
      if (!image.startsWith('linear-gradient')) return []
      return (image.match(/rgba?\([^)]+\)/g) ?? [])
        .map(parse)
        .filter((c): c is NonNullable<typeof c> => c !== null && c.a > 0.92)
    }

    const label = (el: Element) => {
      const cls = el.className?.toString().trim().split(/\s+/).slice(0, 2).join('.')
      return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`
    }

    const hits: Array<{
      el: string
      text: string
      ratio: number
      need: number
      size: number
      color: string
      bg: string
    }> = []

    for (const el of Array.from(document.querySelectorAll('body *'))) {
      // 只看元素自己直接持有的文字，避免把容器重复计一遍
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent?.trim() ?? '')
        .join('')
      if (!own) continue

      const rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none') continue
      if (Number(cs.opacity) < 0.95) continue

      const fg = parse(cs.color)
      if (!fg || fg.a === 0) continue

      // 往上找第一个能定色的底：不透明纯色，或可解析的线性渐变
      let node: Element | null = el
      let grounds: Array<{ r: number; g: number; b: number }> = []
      while (node && node !== document.documentElement) {
        const s = getComputedStyle(node)
        if (s.backgroundImage !== 'none') {
          const stops = gradientStops(s.backgroundImage)
          if (stops.length > 0) {
            grounds = stops
            break
          }
        }
        const c = parse(s.backgroundColor)
        if (c && c.a > 0.92) {
          grounds = [c]
          break
        }
        node = node.parentElement
      }
      if (grounds.length === 0) continue

      const size = parseFloat(cs.fontSize)
      const weight = Number(cs.fontWeight) || 400
      const large = size >= 24 || (size >= 18.66 && weight >= 700)
      const need = large ? 3 : 4.5

      let worst = Number.POSITIVE_INFINITY
      let worstBg = grounds[0]
      for (const ground of grounds) {
        const r = ratio(flatten(fg, ground), ground)
        if (r < worst) {
          worst = r
          worstBg = ground
        }
      }

      if (worst < need) {
        hits.push({
          el: label(el),
          text: own.slice(0, 24),
          ratio: Math.round(worst * 100) / 100,
          need,
          size: Math.round(size * 10) / 10,
          color: cs.color,
          bg: `rgb(${Math.round(worstBg.r)}, ${Math.round(worstBg.g)}, ${Math.round(worstBg.b)})`,
        })
      }
    }

    // 同一个类名同一个颜色只报最差的那处，否则一屏全是重复行
    const seen = new Map<string, (typeof hits)[number]>()
    for (const hit of hits) {
      const key = `${hit.el}|${hit.color}|${hit.bg}`
      const prev = seen.get(key)
      if (!prev || hit.ratio < prev.ratio) seen.set(key, hit)
    }
    return [...seen.values()].sort((a, b) => a.ratio - b.ratio)
  })
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme === 'dark' ? '暗色' : '亮色'}主题文字对比度达到 AA`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/#/tasks')
      // 偏好是裸字符串存的，写完必须刷新才走防闪烁脚本
      await page.evaluate((value) => {
        localStorage.setItem('gamepmer.appearance.theme', value)
      }, theme)
      await page.reload()
      await expect(page.locator('html')).toHaveAttribute('data-theme-resolved', theme)
    })

    for (const [route, name] of ROUTES) {
      test(name, async ({ page }) => {
        await page.goto(`/#/${route}`)
        await page.waitForLoadState('networkidle')
        // 入场动画与导航过渡期间颜色还在插值，等落定再量
        await page.waitForTimeout(400)

        const hits = await findLowContrast(page)
        const report = hits
          .map(
            (h) =>
              `${h.ratio} < ${h.need}  ${h.el}  ${h.size}px  ${h.color} on ${h.bg}  「${h.text}」`,
          )
          .join('\n')
        expect(hits, `${name}（${theme}）有文字对比度不达标：\n${report}`).toEqual([])
      })
    }
  })
}
