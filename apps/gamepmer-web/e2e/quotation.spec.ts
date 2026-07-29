import { expect, test, type Page } from '@playwright/test'

/**
 * 报价与变更端到端。
 *
 * 对应完整业务主线：
 * BD 需求 → 总监报价（含排期）→ 组长兼 BD 一次复核 → **BD 报给客户** →
 * **BD 回传客户确认** → PM 发出开工邮件 → 资产解冻、排期更新（首次报价还会正式建项）。
 *
 * 中间两步是验收时补上的：复核通过只是公司内部认了，客户没点头不能开工。
 */

/** 复核通过 → 报客户 → 客户确认，走到「可以发开工邮件」 */
async function throughClient(page: Page) {
  await page.getByRole('button', { name: /以组长兼BD身份复核通过/ }).click()
  await page.getByRole('button', { name: 'BD 已把报价报给客户' }).click()
  await page.getByRole('button', { name: '客户已确认接受' }).click()
}

test('首次打开有真实密度，五个指标与四个页签都有数字', async ({ page }) => {
  await page.goto('/#/quotation')

  await expect(page.getByRole('heading', { name: '报价与变更' })).toBeVisible()
  await expect(page.getByLabel('报价案件')).toBeVisible()
  await expect(page.getByLabel('报价单')).toBeVisible()
  await expect(page.getByLabel('报价详情')).toBeVisible()
  await expect(page.getByLabel('待复核清单')).toBeVisible()
})

test('报价展开到每个阶段，带人天、单价与节点', async ({ page }) => {
  await page.goto('/#/quotation')
  const table = page.getByLabel('报价工作项')

  await expect(table.getByText('高模 · 能源模块结构')).toBeVisible()
  await expect(table.getByText('08-03 — 08-04')).toBeVisible()
  await expect(table.getByText('¥ 9,000')).toBeVisible()
  // 8/5 是公司休息日，节点已经避开
  await expect(table.getByText('08-05')).toHaveCount(0)
})

test('组长兼 BD 只出现一条待办，两个角色都写出来', async ({ page }) => {
  await page.goto('/#/quotation')
  const todos = page.getByLabel('待复核清单')

  const row = todos.getByRole('row').filter({ hasText: 'CQ-004' })
  await expect(row).toHaveCount(1)
  await expect(row.getByText('组长', { exact: true })).toBeVisible()
  await expect(row.getByText('BD', { exact: true })).toBeVisible()
  await expect(row.getByText('合并为 1 次确认')).toBeVisible()
})

test('批准不等于开工：复核通过后甘特上的排期还没变', async ({ page }) => {
  await page.goto('/#/projects')
  const gantt = page.getByLabel('项目排期甘特')
  await expect(gantt.getByText('等待变更报价').first()).toBeVisible()

  await page.goto('/#/quotation')
  await page.getByRole('button', { name: /以组长兼BD身份复核通过/ }).click()
  await expect(page.getByRole('heading', { name: '复核已通过' })).toBeVisible()

  // 排期此刻仍未变更：冻结标记还在
  await page.goto('/#/projects')
  await expect(page.getByLabel('项目排期甘特').getByText('等待变更报价').first()).toBeVisible()
})

test('发出变更开工邮件后：受影响资产解冻，排期按报价单更新', async ({ page }) => {
  await page.goto('/#/quotation')
  await throughClient(page)
  await page.getByRole('button', { name: /我已发出变更开工邮件/ }).click()
  await expect(page.getByRole('heading', { name: '已开工' })).toBeVisible()

  await page.goto('/#/projects')
  const gantt = page.getByLabel('项目排期甘特')
  await expect(gantt.getByText('等待变更报价')).toHaveCount(0)
})

test('开工前正式排期没有被动过——冻结的是标记，不是日期', async ({ page }) => {
  await page.goto('/#/schedule')
  const before = await page.getByLabel('组合排期').innerText()

  await page.goto('/#/quotation')
  await page.getByRole('button', { name: /以组长兼BD身份复核通过/ }).click()

  await page.goto('/#/schedule')
  expect(await page.getByLabel('组合排期').innerText()).toBe(before)
})

test('退回总监后不能开工，状态回到总监报价中', async ({ page }) => {
  await page.goto('/#/quotation')
  await page.getByRole('button', { name: '退回总监修改' }).click()

  await expect(page.getByLabel('报价详情').getByText('等待总监返回')).toBeVisible()
  await expect(page.getByRole('button', { name: /我已发出变更开工邮件/ })).toHaveCount(0)
})

/**
 * 「才算正式接入项目」在数据上的落点。
 * 在这一刻之前，`AUR_B_3D_B34` 只是一个提议的批次编号，不是项目。
 */
test('客户确认后发开工通知，项目在这一刻才建出来', async ({ page }) => {
  await page.goto('/#/projects')
  await expect(page.getByText('AUR_B_3D_B34')).toHaveCount(0)

  await page.goto('/#/quotation')
  await page.getByRole('button', { name: /全部进行中/ }).click()
  await page.getByLabel('报价案件').getByText(/Q-029/).click()

  const detail = page.getByLabel('报价详情')
  await expect(detail.getByText(/才正式建项/)).toBeVisible()
  await detail.getByRole('button', { name: /我已发出正式开工邮件/ }).click()

  // 项目、资产、阶段一次性建出来，报价节点同时成为基准
  await page.goto('/#/projects')
  await expect(page.getByText('AUR_B_3D_B34').first()).toBeVisible()
})

test('客户没点头之前开工按钮根本不出现', async ({ page }) => {
  await page.goto('/#/quotation')
  await page.getByRole('button', { name: /以组长兼BD身份复核通过/ }).click()
  await expect(page.getByRole('button', { name: /我已发出变更开工邮件/ })).toHaveCount(0)

  await page.getByRole('button', { name: 'BD 已把报价报给客户' }).click()
  await expect(page.getByRole('button', { name: /我已发出变更开工邮件/ })).toHaveCount(0)
  await expect(page.getByLabel('报价详情').getByText(/客户没点头之前不能开工/)).toBeVisible()

  await page.getByRole('button', { name: '客户已确认接受' }).click()
  await expect(page.getByRole('button', { name: /我已发出变更开工邮件/ })).toBeEnabled()
})

/** 客户不接受是终止，不是退回重报；这条路径也是 Rejected 唯一的入口 */
test('客户不接受必须写原因，写了才终止案件', async ({ page }) => {
  await page.goto('/#/quotation')
  await page.getByRole('button', { name: /以组长兼BD身份复核通过/ }).click()
  await page.getByRole('button', { name: 'BD 已把报价报给客户' }).click()

  const decline = page.getByRole('button', { name: '客户未接受 · 终止案件' })
  await expect(decline).toBeDisabled()

  await page.getByLabel(/客户怎么说的/).fill('价格超预算 30%')
  await decline.click()
  await expect(page.getByLabel('报价详情').getByText(/客户未接受/).first()).toBeVisible()
})

test('开工只生成通知草稿，不出现「已发送」', async ({ page }) => {
  await page.goto('/#/quotation')
  await throughClient(page)
  await page.getByRole('button', { name: /我已发出变更开工邮件/ }).click()

  const notifications = page.getByLabel('通知草稿')
  await expect(notifications.getByText(/变更开工/)).toBeVisible()
  await expect(notifications.getByRole('button', { name: '我已发出，标记为已发送' }).first()).toBeVisible()
})

test('原报价永不覆盖：应结汇总同时列出首次报价与追加报价', async ({ page }) => {
  await page.goto('/#/quotation')
  const detail = page.getByLabel('报价详情')

  await expect(detail.getByText(/首次报价 Q-021/)).toBeVisible()
  await expect(detail.getByText(/追加报价 CQ-004/)).toBeVisible()

  await throughClient(page)
  await page.getByRole('button', { name: /我已发出变更开工邮件/ }).click()
  await expect(page.getByLabel('报价详情').getByText('¥ 51,000')).toBeVisible()
})

test('恢复示例数据把报价状态一并复位', async ({ page }) => {
  await page.goto('/#/quotation')
  await page.getByRole('button', { name: /以组长兼BD身份复核通过/ }).click()
  await expect(page.getByRole('heading', { name: '复核已通过' })).toBeVisible()

  await page.getByRole('button', { name: '恢复示例数据' }).click()
  await page.goto('/#/quotation')
  await expect(page.getByRole('button', { name: /以组长兼BD身份复核通过/ })).toBeVisible()
})

test('总监报价中的案件能录入报价并往下流转', async ({ page }) => {
  await page.goto('/#/quotation')
  await page.getByRole('button', { name: /全部进行中/ }).click()
  await page.getByLabel('报价案件').getByText(/Q-030/).click()
  await page.getByRole('button', { name: '录入总监报价' }).click()

  const drawer = page.getByLabel('录入报价')
  await expect(drawer.getByText(/HLC_C_2D_B20 还不是正式项目/)).toBeVisible()
  await drawer.getByRole('button', { name: '按 2D 模板生成' }).click()

  // 只填模板不填人天/节点时提交被阻断，并逐行说明
  await expect(drawer.getByRole('button', { name: /提交（被阻断）/ })).toBeDisabled()
  await expect(drawer.getByText('缺人天').first()).toBeVisible()

  for (let row = 1; row <= 3; row += 1) {
    await drawer.getByLabel(`第 ${row} 行 人天`).fill('2')
    await drawer.getByLabel(`第 ${row} 行 开始日`).fill('2026-08-17')
    await drawer.getByLabel(`第 ${row} 行 结束日`).fill('2026-08-18')
  }
  await drawer.getByLabel('工期影响').fill('6')
  await drawer.getByRole('button', { name: '提交给组长/BD 复核' }).click()

  // 进入待复核，并出现在待复核清单里
  await expect(page.getByLabel('报价详情').getByRole('button', { name: /复核通过/ })).toBeVisible()
  await expect(
    page.getByLabel('待复核清单').getByRole('row').filter({ hasText: 'Q-030' }),
  ).toHaveCount(1)
})

test('退回总监不是死胡同：能以上一版为底稿重新提交', async ({ page }) => {
  await page.goto('/#/quotation')
  await page.getByRole('button', { name: '退回总监修改' }).click()

  await page.getByRole('button', { name: '录入总监报价' }).click()
  const drawer = page.getByLabel('录入报价')
  // 上一版预填，五行都在
  await expect(drawer.getByLabel('第 5 行 人天')).toHaveValue('0.6')

  await drawer.getByLabel('第 1 行 人天').fill('2')
  await drawer.getByRole('button', { name: '提交给组长/BD 复核' }).click()

  // 回到待复核，且报价版本区能看到 v1 已被取代
  await expect(page.getByLabel('报价详情').getByText('CQ-004 / v2')).toBeVisible()
  await expect(page.getByText('已被新版本取代')).toBeVisible()
})

/**
 * 录入新需求。
 *
 * 顶栏那个动作按钮必须指向业务的真实起点：整条链路是从**需求**开始的。
 * 原来它叫「手工录入」并跳去候选收件箱——收件箱是「外部消息进来」的入口，
 * 不是「新活来了」的入口。
 */
test('顶栏「新增需求」去报价与变更，不是去收件箱', async ({ page }) => {
  await page.goto('/#/tasks')
  await page.getByRole('button', { name: '新增需求' }).click()
  await expect(page).toHaveURL(/#\/quotation/)
  await expect(page.getByRole('button', { name: '录入新需求' })).toBeVisible()
})

test('直接录一条首次需求 → 停在总监报价中，且没有建项目', async ({ page }) => {
  await page.goto('/#/quotation')
  await page.getByRole('button', { name: '录入新需求' }).click()

  const form = page.getByLabel('录入新需求')
  await form.getByLabel('客户').fill('Northstar Studio')
  await form.getByLabel('批次编号').fill('NST_E_3D_B40')
  await form.getByLabel('需求标题').fill('守卫兵种 3 套')
  await form.getByLabel('需求描述').fill('BD 当面确认：3 套守卫兵种，含中模到 LOD。')
  await page.getByRole('button', { name: '立案并交给总监报价' }).click()

  const detail = page.getByLabel('报价详情')
  await expect(detail.getByText('守卫兵种 3 套')).toBeVisible()
  await expect(page.getByLabel('报价详情').getByText(/总监报价中/).first()).toBeVisible()

  // 立案不建项目
  await page.goto('/#/projects')
  await expect(page.getByText('NST_E_3D_B40')).toHaveCount(0)
})

test('编号不合规范时立案键是灰的，并写清规范', async ({ page }) => {
  await page.goto('/#/quotation')
  await page.getByRole('button', { name: '录入新需求' }).click()

  const form = page.getByLabel('录入新需求')
  await form.getByLabel('客户').fill('Northstar Studio')
  await form.getByLabel('批次编号').fill('LYS_X')
  await form.getByLabel('需求标题').fill('随手写的')
  await form.getByLabel('需求描述').fill('随手写的')

  await expect(page.getByRole('button', { name: '立案（被阻断）' })).toBeDisabled()
  await expect(form.getByText(/不符合规范/)).toBeVisible()
})

test('追加报价改问项目与受影响资产，客户从项目上取', async ({ page }) => {
  await page.goto('/#/quotation')
  await page.getByRole('button', { name: '录入新需求' }).click()

  const form = page.getByLabel('录入新需求')
  await form.getByRole('button', { name: /追加报价/ }).click()
  await expect(form.getByLabel('批次编号')).toHaveCount(0)

  await form.getByLabel('挂到哪个项目').selectOption('NST_A_3D_B24')
  await form.getByLabel('受影响资产').getByRole('button', { name: /MECH-02/ }).click()
  await form.getByLabel('需求标题').fill('载具加一套涂装')
  await form.getByLabel('需求描述').fill('客户想给 MECH-02 加一套涂装。')
  await page.getByRole('button', { name: '立案并交给总监报价' }).click()

  const detail = page.getByLabel('报价详情')
  await expect(detail.getByText('载具加一套涂装')).toBeVisible()
  await expect(detail.getByText('Northstar Studio').first()).toBeVisible()
})

/**
 * 待立案的变更单。
 *
 * 判为范围外只建变更单并冻结阶段，不自动建报价案件。原来左侧列表只读报价案件，
 * 于是「阶段冻着、指标数到了它、列表里却没有一行能点」——验收时正是这么问的。
 */
test('判为范围外后，报价页「处理中」里立刻出现一条待立案', async ({ page }) => {
  await page.goto('/#/feedback')
  const pendingRow = page.getByLabel('资产级反馈项').locator('tbody tr', { hasText: '待分流' }).first()
  await pendingRow.click()
  await page.getByRole('button', { name: '判为范围外' }).click()

  await page.goto('/#/quotation')
  const list = page.getByLabel('报价案件')
  await expect(list.getByText('待立案').first()).toBeVisible()
  // 冻了哪个阶段直接写在行里，不用再去甘特上找
  await expect(list.locator('.gp-case.is-pending').first()).toContainText('冻住')
})

test('点待立案 → 录入面板已按变更单预填，立完案它从清单里消失', async ({ page }) => {
  await page.goto('/#/feedback')
  await page.getByLabel('资产级反馈项').locator('tbody tr', { hasText: '待分流' }).first().click()
  await page.getByRole('button', { name: '判为范围外' }).click()

  await page.goto('/#/quotation')
  await page.getByLabel('报价案件').locator('.gp-case.is-pending').first().click()

  const form = page.getByLabel('录入新需求')
  await expect(form.getByText(/立报价案件/)).toBeVisible()
  // 项目与受影响资产已经填好，客户原话也带过来了
  await expect(form.getByLabel('挂到哪个项目')).toHaveValue(/\w+/)
  await expect(form.getByLabel('需求描述')).not.toHaveValue('')

  await page.getByRole('button', { name: '立案并交给总监报价' }).click()
  await expect(page.getByLabel('报价案件').getByText('待立案')).toHaveCount(0)
})

test('资产冻结中数的是资产，阶段数另写', async ({ page }) => {
  await page.goto('/#/quotation')
  const card = page.locator('.gp-metric', { hasText: '资产冻结中' })
  await expect(card.getByText(/共 \d+ 个阶段/)).toBeVisible()
})

/**
 * 「待我处理」与解冻指引。
 *
 * 验收原话：处理中是空的，希望报价阶段所有该我推进的待办都汇总在这；
 * 以及「资产冻结中不知道怎么操作才能消除」。
 */
test('默认停在「待我处理」，每行写清等谁和下一步', async ({ page }) => {
  await page.goto('/#/quotation')
  const list = page.getByLabel('报价案件')

  await expect(page.getByRole('button', { name: /待我处理/ })).toBeVisible()
  await expect(list.getByText('等我').first()).toBeVisible()
  await expect(list.getByText(/下一步：/).first()).toBeVisible()
})

test('「全部进行中」把等别人的也列出来，并标明等谁', async ({ page }) => {
  await page.goto('/#/quotation')
  await page.getByRole('button', { name: /全部进行中/ }).click()

  const list = page.getByLabel('报价案件')
  await expect(list.getByText('等总监').first()).toBeVisible()
  await expect(list.getByText('等复核').first()).toBeVisible()
  // 等我的排在前面
  const first = list.locator('.gp-case').first()
  await expect(first.getByText('等我')).toBeVisible()
})

test('冻结的阶段直接告诉你怎么解冻，并能跳过去', async ({ page }) => {
  await page.goto('/#/quotation')
  const panel = page.getByLabel('冻结与解冻')

  await expect(panel).toBeVisible()
  await expect(panel.getByText(/发出变更开工邮件/)).toBeVisible()
  // 每个冻结阶段都给得出下一步
  await expect(panel.locator('li').first()).toContainText('CQ-')
})

test('走完追加报价，冻结跟着消失', async ({ page }) => {
  await page.goto('/#/quotation')
  await page.getByRole('button', { name: /全部进行中/ }).click()
  await page.getByLabel('报价案件').getByText(/CQ-004/).click()

  await page.getByRole('button', { name: /以组长兼BD身份复核通过/ }).click()
  await page.getByRole('button', { name: 'BD 已把报价报给客户' }).click()
  await page.getByRole('button', { name: '客户已确认接受' }).click()
  await page.getByRole('button', { name: /我已发出变更开工邮件/ }).click()

  // 解冻发生在发出开工邮件那一刻
  await expect(page.getByLabel('冻结与解冻')).toHaveCount(0)
})
