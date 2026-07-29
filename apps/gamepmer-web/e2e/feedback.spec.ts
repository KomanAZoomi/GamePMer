import { expect, test } from '@playwright/test'

/**
 * 批次可切换。
 *
 * 这一页原来写死 `feedbackBatches[0]`，第二个批次永远看不到；
 * 而且每张批次卡都硬编码 `is-active`，看起来全选中、哪张都点不动。
 */
test('多个批次都能点开，选中的那张才高亮', async ({ page }) => {
  await page.goto('/#/feedback')
  const list = page.getByLabel('反馈批次')
  const cards = list.locator('.gp-batch-card')
  expect(await cards.count()).toBeGreaterThan(1)
  await expect(list.locator('.gp-batch-card.is-active')).toHaveCount(1)

  const second = cards.nth(1)
  const id = (await second.locator('strong').first().innerText()).trim()
  await second.click()

  await expect(list.locator('.gp-batch-card.is-active')).toHaveCount(1)
  await expect(page.getByLabel('资产级反馈项').getByText(id).first()).toBeVisible()
})
