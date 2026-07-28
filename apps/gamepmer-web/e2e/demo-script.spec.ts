import { expect, test, type Page } from '@playwright/test'

/**
 * 五分钟演示脚本的端到端验证。
 *
 * 这份脚本是实施计划 §1 定下的验收基准：它走不通，本轮就没有完成，
 * 与单元测试是否全绿无关。用例顺序与脚本步骤一一对应。
 */

async function freshWorkspace(page: Page) {
  await page.goto('/#/tasks')
  await page.getByRole('button', { name: '恢复示例数据' }).click()
  await page.waitForTimeout(200)
}

test.beforeEach(async ({ page }) => {
  await freshWorkspace(page)
})

test('步骤 1-2：首页首次打开就有真实数据，且每条待办能追溯到来源', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '任务管理' })).toBeVisible()
  await expect(page.getByText(/共 4 个在管项目/)).toBeVisible()

  const board = page.getByLabel('任务看板')
  await expect(board.getByText('缩小肩甲比例')).toBeVisible()

  await board.getByRole('button', { name: /缩小肩甲比例/ }).click()
  const detail = page.getByLabel('智能详情')
  await expect(detail.getByText('原始证据')).toBeVisible()
  await expect(detail.getByText(/review_03\.jpg/)).toBeVisible()
  await expect(detail.getByText(/建议未执行/)).toBeVisible()
})

test('步骤 3：项目甘特按资产展开到每个阶段，基准与当前并存', async ({ page }) => {
  await page.goto('/#/projects')

  const gantt = page.getByLabel('项目排期甘特')
  await expect(gantt.getByText('MECH-01 · 主角机甲')).toBeVisible()
  for (const stage of ['中模', '高模', '低模', '烘焙', '贴图', 'LOD']) {
    await expect(gantt.getByText(stage, { exact: true }).first()).toBeVisible()
  }

  // 今天线与公司休息日
  await expect(gantt.getByText('今天', { exact: true })).toBeVisible()
  await expect(gantt.getByTitle('2026-08-05 公司休息日')).toBeVisible()

  // 等待客户与实际是两条不同的条
  await expect(gantt.getByTitle(/高模 · 等待客户/)).toBeVisible()
  // MECH-01 与 MECH-02 都有中模，这里认准 MECH-01 已完成的那条
  await expect(gantt.getByTitle('中模 · 实际｜07-20 — 07-22')).toBeVisible()
})

test('步骤 4：团队档期按周给出容量，休息日让可用人天变少', async ({ page }) => {
  await page.goto('/#/schedule')
  await page.getByRole('tab', { name: '团队档期' }).click()

  const thisWeek = page.getByRole('button', { name: '3D 角色 A 组 2026-07-27 当周占用明细' })
  await expect(thisWeek.getByText('7 / 7.5')).toBeVisible()

  const holidayWeek = page.getByRole('button', { name: '3D 角色 A 组 2026-08-03 当周占用明细' })
  await expect(holidayWeek.getByText('6 / 6')).toBeVisible()
  await expect(holidayWeek.getByText(/4 个工作日/)).toBeVisible()

  // 占用明细能解释超载来自哪个项目
  await thisWeek.click()
  await expect(page.getByText('MECH-01 · 低模')).toBeVisible()
  await expect(page.getByText('PROP-03 · 中模')).toBeVisible()
})

test('步骤 5-7：草案可微调、可取消，取消后正式计划零变化', async ({ page }) => {
  await page.goto('/#/feedback')
  await page.getByRole('button', { name: '判为范围内' }).click()
  await page.getByRole('button', { name: '生成排期草案' }).click()

  const draft = page.getByLabel('排期修订草案')
  await expect(draft.getByText('07-29 — 07-31')).toBeVisible()
  await expect(draft.getByText(/未受影响/)).toBeVisible()
  await expect(draft.getByText(/MECH-02/)).toBeVisible()

  // 微调后后续阶段自动顺延，不会卡在自己造出来的冲突上
  await draft.getByRole('button', { name: '低模 顺延一个工作日' }).click()
  await expect(draft.getByText('07-30 — 08-03')).toBeVisible()
  await expect(draft.getByRole('button', { name: '确认重排' })).toBeEnabled()

  // 甘特上草案是独立的一层
  await page.goto('/#/projects')
  await expect(page.getByLabel('项目排期甘特').getByText('未确认草案')).toBeVisible()

  // 取消
  await page.goto('/#/feedback')
  await page.getByRole('button', { name: '取消草案' }).click()
  await expect(page.getByLabel('排期修订草案')).toHaveCount(0)

  await page.goto('/#/projects')
  await page.getByLabel('项目排期甘特').getByRole('button', { name: /低模.*Chen/ }).click()
  const inspector = page.getByLabel('阶段详情')
  // 取消后基准与当前应当一致，都停在 07-27 — 07-29
  await expect(inspector.getByTitle('2026-07-27 — 2026-07-29')).toHaveCount(2)
  await expect(page.getByLabel('排期修订历史').getByText(/尚无已确认的排期修订/)).toBeVisible()
})

test('步骤 8-10：确认后写入修订、保留基准、生成未发出通知，刷新仍在', async ({ page }) => {
  await page.goto('/#/feedback')
  await page.getByRole('button', { name: '判为范围内' }).click()
  await page.getByRole('button', { name: '生成排期草案' }).click()
  await page.getByLabel('排期修订草案').getByRole('button', { name: '确认重排' }).click()

  // 通知是草稿，且明说工作台不发信
  const notifications = page.getByLabel('通知草稿')
  await expect(notifications.getByText(/不发送邮件/)).toBeVisible()
  await expect(notifications.getByText('待发出').first()).toBeVisible()

  // 基准保留，当前更新
  await page.goto('/#/projects')
  await page.getByLabel('项目排期甘特').getByRole('button', { name: /低模.*Chen/ }).click()
  const inspector = page.getByLabel('阶段详情')
  await expect(inspector.getByTitle('2026-07-27 — 2026-07-29')).toBeVisible() // 基准原封不动
  await expect(inspector.getByTitle('2026-07-29 — 2026-07-31')).toBeVisible() // 当前已更新
  await expect(page.getByLabel('排期修订历史').getByText('v1')).toBeVisible()

  // 刷新后仍在
  await page.reload()
  await expect(page.getByLabel('排期修订历史').getByText('v1')).toBeVisible()
})

test('步骤 11：范围外走变更单，只冻结受影响资产', async ({ page }) => {
  await page.goto('/#/feedback')
  await page.getByRole('button', { name: '新增腰部挂件' }).click()
  await page.getByRole('button', { name: '判为范围外' }).click()

  // 种子里已有 CQ-004（背部能源模块），新建的变更单接着往后排
  await expect(page.getByLabel('反馈项详情').getByText('CQ-005')).toBeVisible()

  // MECH-01 高模冻结，MECH-02 照常
  await page.goto('/#/projects')
  const gantt = page.getByLabel('项目排期甘特')
  // 种子里 CQ-004 已经冻了烘焙，这次分流又冻了高模——两处都该出现
  await expect(gantt.getByText('等待变更报价')).toHaveCount(2)
  await expect(gantt.getByText('MECH-02 · 轻型载具')).toBeVisible()
})

test('通知标记为已发出后，修订不再允许撤销', async ({ page }) => {
  await page.goto('/#/feedback')
  await page.getByRole('button', { name: '判为范围内' }).click()
  await page.getByRole('button', { name: '生成排期草案' }).click()
  await page.getByLabel('排期修订草案').getByRole('button', { name: '确认重排' }).click()

  await expect(page.getByRole('button', { name: '撤销修订并退回待分流' })).toBeVisible()

  await page.getByRole('button', { name: '我已发出，标记为已发送' }).first().click()
  await expect(page.getByRole('button', { name: '撤销修订并退回待分流' })).toHaveCount(0)
  await expect(page.getByText(/通知已被标记为发出/)).toBeVisible()
})

test('恢复示例数据回到相同初始状态', async ({ page }) => {
  await page.goto('/#/feedback')
  await page.getByRole('button', { name: '判为范围内' }).click()
  await page.getByRole('button', { name: '生成排期草案' }).click()
  await page.getByLabel('排期修订草案').getByRole('button', { name: '确认重排' }).click()

  await page.getByRole('button', { name: '恢复示例数据' }).click()
  await page.goto('/#/projects')
  await expect(page.getByLabel('排期修订历史').getByText(/尚无已确认的排期修订/)).toBeVisible()
})
