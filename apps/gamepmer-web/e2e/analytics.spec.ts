import { expect, test, type Page } from '@playwright/test'

/**
 * 智能分析端到端。
 *
 * 两条红线：客户等待与团队延期永远是两个数、页面任何地方不出现制作人员姓名。
 * 页签「报价与变更」与左侧导航同名，所以一律在页头的 chip 行里点。
 */

const tab = (page: Page, label: string) =>
  page.locator('.gp-analytics .gp-chip-row').getByRole('button', { name: label })

test('首次打开有真实密度，五个指标与主区都在', async ({ page }) => {
  await page.goto('/#/analytics')

  await expect(page.getByRole('heading', { name: '智能分析' })).toBeVisible()
  await expect(page.getByLabel('分析主区')).toBeVisible()
  await expect(page.getByLabel('AI 洞察')).toBeVisible()
  await expect(page.getByLabel('项目健康度')).toBeVisible()
  await expect(page.getByText(/不产生任何新数据/)).toBeVisible()
})

test('客户等待与团队延期是两个独立指标', async ({ page }) => {
  await page.goto('/#/analytics')

  await expect(page.getByText('客户等待占比')).toBeVisible()
  await expect(page.getByText('团队延期占比')).toBeVisible()
  // 右侧口径说明里有更长的同义句，这里只看指标卡上的那行
  const metrics = page.locator('.gp-analytics .gp-metrics')
  await expect(metrics.getByText('不计入团队延期')).toBeVisible()
  await expect(metrics.getByText('已扣除客户等待')).toBeVisible()
})

test('归因四类各一行，客户等待明说不算团队的账', async ({ page }) => {
  await page.goto('/#/analytics')
  await tab(page, '延期归因').click()

  const table = page.getByLabel('归因明细')
  await expect(table.getByRole('row')).toHaveCount(5) // 表头 + 四类
  await expect(table.getByText(/不算团队的账/)).toBeVisible()

  // 逐阶段能下钻
  await expect(page.getByLabel('阶段下钻').getByRole('row').nth(1)).toBeVisible()
})

test('四个页签都换真内容，不是摆设', async ({ page }) => {
  await page.goto('/#/analytics')

  await tab(page, '产能与负载').click()
  await expect(page.getByLabel('制作组负载')).toBeVisible()

  await tab(page, '报价与变更').click()
  await expect(page.getByLabel('报价统计')).toBeVisible()

  await tab(page, '交付表现').click()
  await expect(page.getByLabel('项目健康度')).toBeVisible()
})

test('四个页签下都不出现制作人员姓名', async ({ page }) => {
  await page.goto('/#/analytics')

  // 种子里的制作人员
  const owners = ['Chen', 'Mei', 'Rui', 'Lin', 'Yuki', 'Mika']
  for (const label of ['交付表现', '延期归因', '产能与负载', '报价与变更']) {
    await tab(page, label).click()
    const text = (await page.getByLabel('分析主区').innerText()) ?? ''
    for (const owner of owners) {
      expect(text.includes(owner), `${label} 页签下出现了 ${owner}`).toBe(false)
    }
  }
})

test('口径说明常驻，并明写不统计个人绩效', async ({ page }) => {
  await page.goto('/#/analytics')
  const side = page.getByLabel('AI 洞察')

  await expect(side.getByText('口径说明')).toBeVisible()
  await expect(side.getByText(/不统计任何个人维度/)).toBeVisible()
  await expect(side.getByText(/制作组内部谁做的哪一版，工作台不记录/)).toBeVisible()
})

test('AI 洞察每条都带依据并标注未执行', async ({ page }) => {
  await page.goto('/#/analytics')
  const side = page.getByLabel('AI 洞察')

  const cards = side.locator('.gp-insight')
  const count = await cards.count()
  expect(count).toBeGreaterThan(0)
  await expect(side.getByText('建议 · 未执行')).toHaveCount(count)
  await expect(side.locator('.gp-insight-evidence')).toHaveCount(count)
})

test('人天偏差带样本数，样本少的不当结论', async ({ page }) => {
  await page.goto('/#/analytics')

  await expect(page.getByLabel('人天偏差')).toBeVisible()
  await expect(page.getByText(/样本数少于 2 的阶段不作为结论依据/)).toBeVisible()
})

test('分析是投影：确认候选后指标跟着变', async ({ page }) => {
  await page.goto('/#/analytics')
  const before = await page.getByLabel('项目健康度').innerText()

  // 在候选收件箱把一个阶段推进到「已交 PM」
  await page.goto('/#/inbox')
  await page.getByLabel('候选记录').getByText('MECH-02 高模已完成').click()
  await page.getByRole('button', { name: /确认并推进阶段/ }).click()

  await page.goto('/#/analytics')
  expect(await page.getByLabel('项目健康度').innerText()).not.toBe(before)
})
