import { expect, test } from '@playwright/test'

/**
 * 阶段推进。
 *
 * 验收提问：反馈分流之后高模怎么流转到低模？当时答案是「流转不了」。
 * 这组用例把一个资产从未开始一路推到客户验收，再确认下一阶段因此解锁。
 */
test('把一个阶段从未开始推到客户验收，四个时间点各记各的', async ({ page }) => {
  await page.goto('/#/projects')
  await page.getByRole('button', { name: /NST_C_3D_B31/ }).click()

  const gantt = page.getByLabel('项目排期甘特')
  await gantt.getByRole('button', { name: /中模/ }).nth(1).click()

  const inspector = page.getByLabel('阶段详情')
  for (const label of ['标记开工', '已交 PM', '已提交客户', '客户已验收']) {
    await inspector.getByRole('button', { name: label, exact: true }).click()
  }

  await expect(inspector.getByText('已验收').first()).toBeVisible()
  // 推进区消失：已验收是终态
  await expect(inspector.getByText('推进这个阶段')).toHaveCount(0)
})

test('前一阶段验收后，下一阶段才解锁开工', async ({ page }) => {
  await page.goto('/#/projects')
  await page.getByRole('button', { name: /NST_C_3D_B31/ }).click()

  const gantt = page.getByLabel('项目排期甘特')
  const inspector = page.getByLabel('阶段详情')

  // 先看高模：前置中模还没验收，没有开工按钮，但有理由
  await gantt.getByRole('button', { name: /高模/ }).nth(1).click()
  await expect(inspector.getByRole('button', { name: '标记开工', exact: true })).toHaveCount(0)
  await expect(inspector.getByText(/还没客户验收/)).toBeVisible()

  // 把中模一路推到验收
  await gantt.getByRole('button', { name: /中模/ }).nth(1).click()
  for (const label of ['标记开工', '已交 PM', '已提交客户', '客户已验收']) {
    await inspector.getByRole('button', { name: label, exact: true }).click()
  }

  // 高模现在能开工了
  await gantt.getByRole('button', { name: /高模/ }).nth(1).click()
  await expect(inspector.getByRole('button', { name: '标记开工', exact: true })).toBeEnabled()
})

test('等待变更报价的阶段不能被推进绕过冻结', async ({ page }) => {
  await page.goto('/#/projects')
  const gantt = page.getByLabel('项目排期甘特')
  await gantt.getByRole('button', { name: /烘焙/ }).first().click()

  const inspector = page.getByLabel('阶段详情')
  await expect(inspector.getByRole('button', { name: '标记开工', exact: true })).toHaveCount(0)
  // 「等待变更报价」既是阶段上的标记也是阻断理由，按阻断区定位
  await expect(inspector.locator('.gp-stage-flow-blocked').getByText(/等待变更报价/)).toBeVisible()
})

/**
 * 结项第一道门禁是从阶段状态推导的。原来没有任何动作能把阶段设成已验收，
 * 于是**一个真正从工作台走完的项目永远到不了结项**——种子里那些已验收是写死的。
 * 这条把 PROP 系列全部推到验收，确认门禁自己会开。
 */
test('把项目的阶段全部推到验收后，结项第一道门禁自己就开了', async ({ page }) => {
  await page.goto('/#/closeout')
  await page.getByLabel('结项项目').getByText(/HLC_B_2D_B18/).click()
  await expect(page.getByLabel('结项门禁').getByText(/还差 \d+ 个阶段/)).toBeVisible()

  await page.goto('/#/projects')
  await page.getByRole('button', { name: /HLC_B_2D_B18/ }).click()
  const gantt = page.getByLabel('项目排期甘特')
  const inspector = page.getByLabel('阶段详情')

  // 反复扫：每轮找一个当前动得了的阶段推一步，直到没有可推的
  for (let round = 0; round < 60; round += 1) {
    const rows = gantt.getByRole('button', { name: /人天/ })
    let moved = false
    for (let i = 0; i < (await rows.count()); i += 1) {
      await rows.nth(i).click()
      const buttons = inspector.locator('.gp-stage-flow .gp-detail-actions button')
      if ((await buttons.count()) === 0) continue
      await buttons.first().click()
      moved = true
      break
    }
    if (!moved) break
  }

  await page.goto('/#/closeout')
  await page.getByLabel('结项项目').getByText(/HLC_B_2D_B18/).click()
  await expect(page.getByLabel('结项门禁').getByText(/还差 \d+ 个阶段/)).toHaveCount(0)
})
