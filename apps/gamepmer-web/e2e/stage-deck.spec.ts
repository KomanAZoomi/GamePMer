import { expect, test } from '@playwright/test'

/**
 * 首页「资产阶段流」的两种视图。
 *
 * 回归背景：平铺视图曾把整块卡片撑爆——`.gp-deck-viewport` 是 grid item，
 * 缺少 `min-width: 0` 时会被 flex 轨道的 max-content 宽度顶开，
 * 内容溢出卡片边框，同时把标题栏一起拉长，导致「层叠」按钮被推出可视区、
 * 只能靠刷新页面才能切回去。层叠视图下卡片是绝对定位、不参与固有宽度，
 * 所以这个缺陷只在平铺时暴露。
 */

test.describe('阶段流视图切换', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/tasks')
    await expect(page.locator('.gp-deck-viewport')).toBeVisible()
  })

  test('平铺视图不撑爆卡片，且能切回层叠', async ({ page }) => {
    const deck = page.locator('.gp-deck')
    const viewport = page.locator('.gp-deck-viewport')

    await page.getByRole('button', { name: '平铺' }).click()
    await expect(viewport).toHaveClass(/is-flat/)

    // 视口不得宽过它所在的卡片——宽出去就是溢出到框外
    const size = await page.evaluate(() => {
      const d = document.querySelector('.gp-deck') as HTMLElement
      const v = document.querySelector('.gp-deck-viewport') as HTMLElement
      return {
        deck: Math.round(d.getBoundingClientRect().width),
        viewport: Math.round(v.getBoundingClientRect().width),
      }
    })
    expect(size.viewport).toBeLessThanOrEqual(size.deck)

    // 卡片本身也不该被撑出工作区
    const zone = await page.evaluate(() => {
      const z = document.querySelector('.gp-work-zone') as HTMLElement
      const d = document.querySelector('.gp-deck') as HTMLElement
      return {
        zoneRight: Math.round(z.getBoundingClientRect().right),
        deckRight: Math.round(d.getBoundingClientRect().right),
      }
    })
    expect(zone.deckRight).toBeLessThanOrEqual(zone.zoneRight + 1)

    // 「层叠」按钮必须仍然在卡片范围内，能点回去——不能只靠刷新页面
    const stackButton = page.getByRole('button', { name: '层叠' })
    await expect(stackButton).toBeInViewport()
    await stackButton.click()
    await expect(viewport).toHaveClass(/is-stack/)

    await expect(deck).toBeVisible()
  })

  test('平铺视图里六个阶段都在，横向滚动条归轨道自己', async ({ page }) => {
    await page.getByRole('button', { name: '平铺' }).click()

    const cards = page.locator('.gp-deck-viewport.is-flat .gp-deck-card')
    await expect(cards).toHaveCount(6)

    // 装不下时应当是轨道内部横向滚动，而不是把页面撑出横滚
    const overflow = await page.evaluate(() => {
      const content = document.querySelector('.gp-content') as HTMLElement
      return content.scrollWidth - content.clientWidth
    })
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('层叠视图能用键盘走完整条阶段流', async ({ page }) => {
    const focused = page.locator('.gp-deck-focused')
    await page.locator('.gp-deck-track').focus()

    await page.keyboard.press('End')
    await expect(focused).toContainText('第 6 阶段')

    await page.keyboard.press('Home')
    await expect(focused).toContainText('第 1 阶段')

    await page.keyboard.press('ArrowRight')
    await expect(focused).toContainText('第 2 阶段')
  })
})
