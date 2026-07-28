import { expect, test } from '@playwright/test'

/**
 * 报价与变更端到端。
 *
 * 对应五分钟脚本之后的第二条主路径：
 * 追加需求 → 总监报价（含排期）→ 组长兼 BD 一次复核 → PM 发出变更开工邮件 → 资产解冻、排期更新。
 */

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
  await page.getByRole('button', { name: /以组长兼BD身份复核通过/ }).click()
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

test('项目还没建出来的首次报价，开工被诚实阻断', async ({ page }) => {
  await page.goto('/#/quotation')
  await page.getByRole('button', { name: /待开工/ }).click()
  await page.getByLabel('报价案件').getByText(/Q-029/).click()

  const detail = page.getByLabel('报价详情')
  await expect(detail.getByText(/还不是正式项目/)).toBeVisible()
  await expect(detail.getByRole('button', { name: /标记开工（被阻断）/ })).toBeDisabled()
})

test('开工只生成通知草稿，不出现「已发送」', async ({ page }) => {
  await page.goto('/#/quotation')
  await page.getByRole('button', { name: /以组长兼BD身份复核通过/ }).click()
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

  await page.getByRole('button', { name: /以组长兼BD身份复核通过/ }).click()
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
