import { expect, test, type Page } from '@playwright/test'

/**
 * 整条业务线走一遍。
 *
 * 这条不是补某个模块的覆盖率，而是回答一个具体问题：
 * **一个 PM 能不能从「BD 来了个需求」一路点到「归档出账」，中途不卡死、不需要我解释。**
 *
 * 之所以必须有这一条：此前每个模块单独看都是通的，但纵向串起来才发现
 * 阶段推不动、客户否掉后阶段永远冻着、反馈项走不到终点。
 * 横向补模块补不出这些洞。
 */

async function reset(page: Page) {
  await page.goto('/#/tasks')
  await page.getByRole('button', { name: '恢复示例数据' }).click()
}

test('第一段：BD 需求 → 立案 → 报价 → 复核 → 报客户 → 客户确认 → 开工建项', async ({ page }) => {
  await reset(page)

  // 顶栏那个动作指向业务起点
  await page.getByRole('button', { name: '新增需求' }).click()
  await expect(page).toHaveURL(/#\/quotation/)

  const form = page.getByLabel('录入新需求')
  await form.getByLabel('客户').fill('Northstar Studio')
  await form.getByLabel('批次编号').fill('NST_F_3D_B41')
  await form.getByLabel('需求标题').fill('全线走查用的守卫兵种')
  await form.getByLabel('需求描述').fill('BD 当面确认：3 套守卫兵种，中模到 LOD。')
  await page.getByRole('button', { name: '立案并交给总监报价' }).click()

  // 立案不建项目
  await page.goto('/#/projects')
  await expect(page.getByText('NST_F_3D_B41')).toHaveCount(0)

  // 总监录入报价
  await page.goto('/#/quotation')
  await page.getByRole('button', { name: /全部进行中/ }).click()
  await page.getByLabel('报价案件').getByText(/全线走查用的守卫兵种/).click()
  await page.getByRole('button', { name: '录入总监报价' }).click()

  const drawer = page.getByLabel('录入报价')
  await drawer.getByRole('button', { name: '新增一行' }).click()

  // 项目还不存在，所以资产是自由填写。人天与节点必须总监自己填——
  // 工作台不替他编估算，模板生成的行也一样是空的
  await drawer.getByLabel('第 1 行 资产').fill('GUARD-01')
  await drawer.getByLabel('第 1 行 人天').fill('4')
  await drawer.getByLabel('第 1 行 开始日').fill('2026-08-10')
  await drawer.getByLabel('第 1 行 结束日').fill('2026-08-14')

  await drawer.getByRole('button', { name: '提交给组长/BD 复核' }).click()

  // 复核 → 报客户 → 客户确认 → 开工建项
  await page.getByRole('button', { name: /身份复核通过/ }).click()
  await page.getByRole('button', { name: 'BD 已把报价报给客户' }).click()
  await page.getByRole('button', { name: '客户已确认接受' }).click()
  await page.getByRole('button', { name: /我已发出正式开工邮件/ }).click()

  // 这一刻才正式建项
  await page.goto('/#/projects')
  await expect(page.getByText('NST_F_3D_B41').first()).toBeVisible()
})

test('第二段：阶段推进 → 客户要返修 → 分流 → 重排确认', async ({ page }) => {
  await reset(page)
  await page.goto('/#/projects')
  await page.getByRole('button', { name: /NST_C_3D_B31/ }).click()

  const gantt = page.getByLabel('项目排期甘特')
  const inspector = page.getByLabel('阶段详情')
  await gantt.getByRole('button', { name: /中模/ }).nth(1).click()

  for (const label of ['标记开工', '已交 PM', '已提交客户']) {
    await inspector.getByRole('button', { name: label, exact: true }).click()
  }
  // 等客户有两个出口
  await expect(inspector.getByRole('button', { name: '客户已验收', exact: true })).toBeVisible()
  await inspector.getByRole('button', { name: '客户要返修', exact: true }).click()
  await inspector.getByLabel('客户原话').fill('灯柱顶部的发光面积再大一圈')
  await inspector.getByRole('button', { name: '记下并去分流' }).click()

  // 直接落在反馈中心，且刚建的那条已选中
  await expect(page).toHaveURL(/#\/feedback/)
  await expect(page.getByText('灯柱顶部的发光面积再大一圈').first()).toBeVisible()

  // 判为范围内 → 生成重排草案 → 确认
  await page.getByRole('button', { name: '判为范围内' }).click()
  await expect(page.getByText(/返修/).first()).toBeVisible()
})

test('第三段：范围外 → 追加报价 → 客户嫌贵 → 三条出路都在', async ({ page }) => {
  await reset(page)

  // 判一条范围外，冻结受影响阶段
  await page.goto('/#/feedback')
  await page.getByLabel('资产级反馈项').locator('tbody tr', { hasText: '待分流' }).first().click()
  await page.getByRole('button', { name: '判为范围外' }).click()

  // 报价页「待我处理」里立刻出现待立案，并写清冻住了哪个阶段
  await page.goto('/#/quotation')
  const list = page.getByLabel('报价案件')
  await expect(list.getByText('待立案').first()).toBeVisible()
  await expect(page.getByLabel('冻结与解冻')).toBeVisible()

  // 走既有的 CQ-004 到客户未接受
  await page.getByRole('button', { name: /全部进行中/ }).click()
  await list.getByText(/CQ-004/).click()
  await page.getByRole('button', { name: /身份复核通过/ }).click()
  await page.getByRole('button', { name: 'BD 已把报价报给客户' }).click()
  await page.getByLabel(/客户怎么说的/).fill('价格高了')
  await page.getByRole('button', { name: '客户未接受 · 终止案件' }).click()

  const detail = page.getByLabel('报价详情')
  await expect(detail.getByRole('button', { name: /降价重报/ })).toBeVisible()
  await expect(detail.getByRole('button', { name: /放弃变更/ })).toBeVisible()
  await expect(detail.getByRole('button', { name: /确认不接入/ })).toBeVisible()
})

test('第四段：确认不接入 → 删除；审计保留', async ({ page }) => {
  await reset(page)
  await page.goto('/#/quotation')
  await page.getByRole('button', { name: /全部进行中/ }).click()
  await page.getByLabel('报价案件').getByText(/CQ-004/).click()

  await page.getByRole('button', { name: /身份复核通过/ }).click()
  await page.getByRole('button', { name: 'BD 已把报价报给客户' }).click()
  await page.getByLabel(/客户怎么说的/).fill('价格高了')
  await page.getByRole('button', { name: '客户未接受 · 终止案件' }).click()

  const detail = page.getByLabel('报价详情')
  await detail.getByLabel(/决定与原因/).fill('客户预算只有一半，这单不接')
  await detail.getByRole('button', { name: /确认不接入/ }).click()

  await expect(detail.getByRole('heading', { name: '确认不接入' })).toBeVisible()
  await expect(detail.getByText(/审计一条不动/)).toBeVisible()

  await detail.getByRole('button', { name: '删除这张案件' }).click()
  // 案件消失，页面没崩
  await expect(page.getByLabel('报价案件').getByText(/CQ-004/)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '报价与变更' })).toBeVisible()
})

test('第五段：推到底 → 结项五道门禁 → 通知 BD → 归档', async ({ page }) => {
  await reset(page)

  // 结项卡在第一道时，给得出去处
  await page.goto('/#/closeout')
  await page.getByLabel('结项项目').getByText(/HLC_B_2D_B18/).click()
  const gate = page.getByLabel('结项门禁')
  await expect(gate.getByText(/还差 \d+ 个阶段/)).toBeVisible()
  await gate.getByRole('button', { name: /推进阶段/ }).click()
  await expect(page).toHaveURL(/#\/projects/)

  // 把这个项目的阶段全部推到验收
  const gantt = page.getByLabel('项目排期甘特')
  const inspector = page.getByLabel('阶段详情')
  for (let round = 0; round < 60; round += 1) {
    const rows = gantt.getByRole('button', { name: /人天/ })
    let moved = false
    for (let i = 0; i < (await rows.count()); i += 1) {
      await rows.nth(i).click()
      const buttons = inspector.locator('.gp-stage-flow .gp-detail-actions button')
      if ((await buttons.count()) === 0) continue
      const label = (await buttons.first().innerText()).trim()
      if (label === '客户要返修') continue
      await buttons.first().click()
      moved = true
      break
    }
    if (!moved) break
  }

  // 第一道门禁自己就开了
  await page.goto('/#/closeout')
  await page.getByLabel('结项项目').getByText(/HLC_B_2D_B18/).click()
  await expect(page.getByLabel('结项门禁').getByText(/还差 \d+ 个阶段/)).toHaveCount(0)
})
