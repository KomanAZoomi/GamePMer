import { expect, test } from '@playwright/test'

/**
 * 结项、IT 备份与 BD 出账端到端。
 *
 * 主路径：AUR_A_3D_B11 已完成全部验收、最终包与客户确认，卡在 IT 备份回执。
 * 登记回执 → 解锁出账 → 生成通知草稿 → 收到回执后归档。
 */

test('首次打开有真实密度，五道门禁状态一眼可见', async ({ page }) => {
  await page.goto('/#/closeout')

  await expect(page.getByRole('heading', { name: '结项中心' })).toBeVisible()
  await expect(page.getByLabel('结项项目')).toBeVisible()
  await expect(page.getByLabel('结项门禁')).toBeVisible()
  await expect(page.getByLabel('出账资料包')).toBeVisible()

  const track = page.locator('.gp-gate-track')
  await expect(track.locator('li')).toHaveCount(5)
  await expect(track.getByText('当前门槛')).toHaveCount(1)
  await expect(track.getByText('前置未完成')).toHaveCount(1)
})

test('门禁不能跳步：点被挡住的那一步只看到原因', async ({ page }) => {
  await page.goto('/#/closeout')
  await page.locator('.gp-gate-track').getByText('通知 BD 出账').click()

  const main = page.getByLabel('结项门禁')
  await expect(main.getByText('这一步现在做不了')).toBeVisible()
  await expect(main.getByText(/「IT 剪切备份」尚未完成/)).toBeVisible()
  await expect(main.getByRole('button', { name: /完成（被阻断）/ })).toHaveCount(0)
})

test('资产没验收完的项目卡在第一道门禁，并说清还差几个', async ({ page }) => {
  await page.goto('/#/closeout')
  await page.getByLabel('结项项目').getByText(/NST_A_3D_B24/).click()

  const main = page.getByLabel('结项门禁')
  await expect(main.getByText(/还差 \d+ 个阶段/)).toBeVisible()
  await expect(main.getByText(/不能手工打勾/).first()).toBeVisible()
})

test('聊天截图不能替代正式邮件', async ({ page }) => {
  await page.goto('/#/closeout')
  const main = page.getByLabel('结项门禁')

  await main.getByLabel('证据类型').selectOption('screenshot')
  await main.getByLabel('邮件主题或路径').fill('wechat_20260727.png')

  await expect(main.getByText(/必须有正式邮件回执/)).toBeVisible()
  await expect(main.getByRole('button', { name: /完成（被阻断）/ })).toBeDisabled()
})

test('登记 IT 回执 → 解锁出账 → 生成草稿 → 归档', async ({ page }) => {
  await page.goto('/#/closeout')
  const main = page.getByLabel('结项门禁')

  // 出账资料此刻还差 IT 回执
  await expect(page.getByLabel('出账资料包').getByText(/缺 IT 备份完成回执/)).toBeVisible()

  await main.getByLabel('邮件主题或路径').fill('RE: AUR_A_3D_B11 备份完成')
  await main.getByRole('button', { name: /完成「IT 剪切备份」/ }).click()

  await expect(page.getByLabel('出账资料包').getByText('资料齐全')).toBeVisible()

  await page.getByLabel('结项门禁').getByLabel('邮件主题或路径').fill('【可出账】AUR_A_3D_B11')
  await page.getByLabel('结项门禁').getByRole('button', { name: /完成「通知 BD 出账」/ }).click()

  // 只到草稿，界面上不出现「已发送」
  const drafts = page.getByLabel('通知草稿')
  await expect(drafts.getByText('待发出').first()).toBeVisible()
  await expect(drafts.getByRole('button', { name: '我已发出，标记为已发送' })).toBeVisible()

  // 归档是收到出账回执后的独立一步
  await page.getByRole('button', { name: '收到出账回执，归档项目' }).click()
  await expect(page.getByLabel('出账资料包').getByRole('heading', { name: '已归档' })).toBeVisible()
  await expect(page.getByRole('button', { name: /已归档 1/ })).toBeVisible()
})

test('退回门禁会连带作废它后面的所有门禁', async ({ page }) => {
  await page.goto('/#/closeout')
  await page.locator('.gp-gate-track').getByText('总监整理最终包').click()

  const main = page.getByLabel('结项门禁')
  await expect(main.getByText(/退回会连带作废它后面的所有门禁/)).toBeVisible()
  await main.getByRole('button', { name: '退回这一步' }).click()

  // 最终包退回后自己变成当前门槛，它后面的客户确认 / IT / 出账三步全部被挡住
  const track = page.locator('.gp-gate-track')
  await expect(track.getByText('当前门槛')).toHaveCount(1)
  await expect(track.getByText('前置未完成')).toHaveCount(3)
})

test('路径索引明说工作台不搬文件', async ({ page }) => {
  await page.goto('/#/closeout')
  const main = page.getByLabel('结项门禁')

  await expect(main.getByText(/不复制、不移动、不删除任何真实文件/)).toBeVisible()
  await expect(main.getByText(/ARCHIVE.2026.AUR_A_3D_B11/)).toBeVisible()
  await expect(main.getByText(/工作台不执行剪切备份/)).toBeVisible()
})

test('出账资料包汇总该项目的报价', async ({ page }) => {
  await page.goto('/#/closeout')
  const billing = page.getByLabel('出账资料包')

  await expect(billing.getByText(/首次报价 Q-018/)).toBeVisible()
  await expect(billing.getByText('应结合计')).toBeVisible()
})

test('恢复示例数据把结项状态一并复位', async ({ page }) => {
  await page.goto('/#/closeout')
  await page.getByLabel('结项门禁').getByLabel('邮件主题或路径').fill('RE: 备份完成')
  await page.getByLabel('结项门禁').getByRole('button', { name: /完成「IT 剪切备份」/ }).click()
  await expect(page.getByLabel('出账资料包').getByText('资料齐全')).toBeVisible()

  await page.getByRole('button', { name: '恢复示例数据' }).click()
  await page.goto('/#/closeout')
  await expect(page.getByLabel('出账资料包').getByText(/缺 IT 备份完成回执/)).toBeVisible()
})
