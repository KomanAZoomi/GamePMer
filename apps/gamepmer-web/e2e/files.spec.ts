import { expect, test } from '@playwright/test'

/**
 * 文件与归档端到端。
 *
 * 守的是这一页最容易被误解的一条：**工作台只做索引，不搬文件**。
 * 以及命名不规范时保留原名进待关联，绝不丢证据。
 */

test('首次打开有真实密度，五个盘位与边界说明都在', async ({ page }) => {
  await page.goto('/#/files')

  await expect(page.getByRole('heading', { name: '文件与归档' })).toBeVisible()
  await expect(page.getByLabel('盘位')).toBeVisible()
  await expect(page.getByLabel('文件索引')).toBeVisible()
  await expect(page.getByLabel('文件详情')).toBeVisible()
  await expect(page.getByLabel('归档与备份')).toBeVisible()

  await expect(page.getByText(/不复制、不移动、不删除、不改名/)).toBeVisible()
  // 命名规范在页头以 <code> 呈现；解析失败提示里也会引用同一句话
  await expect(page.locator('.gp-files-boundary code')).toHaveText('资产名_阶段名_YYYYMMDD_rNN')
})

test('文件名按四段分色标出，缺哪段一眼可见', async ({ page }) => {
  await page.goto('/#/files')
  const table = page.getByLabel('文件索引')

  await expect(table.locator('.gp-seg.is-asset').first()).toBeVisible()
  await expect(table.locator('.gp-seg.is-stage').first()).toBeVisible()
  await expect(table.locator('.gp-seg.is-date').first()).toBeVisible()
  await expect(table.locator('.gp-seg.is-rev').first()).toBeVisible()
  // 缺版本号的那条会额外标出来
  await expect(table.locator('.gp-seg.is-missing').first()).toBeVisible()
})

test('完全不规范的文件保留原名，四个字段全写未识别', async ({ page }) => {
  await page.goto('/#/files')
  await page.getByLabel('文件索引').getByText('机甲主角_最终版本_改过的_v3_ok.fbx').click()

  const detail = page.getByLabel('文件详情')
  await expect(detail.getByText('机甲主角_最终版本_改过的_v3_ok.fbx')).toBeVisible()
  await expect(detail.getByText('未识别')).toHaveCount(4)
  await expect(detail.getByText(/原文件名已保留/)).toBeVisible()
})

test('手工关联只写索引，盘上文件名一个字符都不变', async ({ page }) => {
  await page.goto('/#/files')
  await page.getByLabel('文件索引').getByText('机甲主角_最终版本_改过的_v3_ok.fbx').click()

  const detail = page.getByLabel('文件详情')
  await expect(detail.getByRole('button', { name: /确认关联（未选阶段）/ })).toBeDisabled()

  await detail.getByLabel('关联到阶段').selectOption('MECH-01/3D_LOW')
  await detail.getByRole('button', { name: '确认关联' }).click()

  await expect(page.getByLabel('文件详情').getByRole('heading', { name: '已关联' })).toBeVisible()
  // 原文件名还在标题上
  await expect(page.getByLabel('文件详情').getByText('机甲主角_最终版本_改过的_v3_ok.fbx')).toBeVisible()
})

test('忽略要写原因，且不是删除——能退回', async ({ page }) => {
  await page.goto('/#/files')
  await page.getByLabel('文件索引').getByText('机甲主角_最终版本_改过的_v3_ok.fbx').click()

  const detail = page.getByLabel('文件详情')
  await expect(detail.getByRole('button', { name: '标记为无关文件' })).toBeDisabled()

  await detail.getByLabel('忽略原因').fill('临时目录下的过程文件')
  await detail.getByRole('button', { name: '标记为无关文件' }).click()
  await expect(page.getByLabel('文件详情').getByRole('heading', { name: '已忽略' })).toBeVisible()
  // 原文件名仍在
  await expect(page.getByLabel('文件详情').getByText('机甲主角_最终版本_改过的_v3_ok.fbx')).toBeVisible()

  await page.getByRole('button', { name: '退回待关联' }).click()
  await expect(page.getByLabel('文件详情').getByLabel('关联到阶段')).toBeVisible()
})

test('解析得出的文件预选建议阶段并说明依据', async ({ page }) => {
  await page.goto('/#/files')
  await page.getByLabel('文件索引').getByText('MECH-02', { exact: true }).click()

  const detail = page.getByLabel('文件详情')
  await expect(detail.getByLabel('关联到阶段')).toHaveValue('MECH-02/3D_HIGH')
  await expect(detail.getByText(/与 P-3D-024 的正式排期匹配/)).toBeVisible()
})

test('盘位筛选只改显示', async ({ page }) => {
  await page.goto('/#/files')
  await page.getByLabel('盘位').getByText('反馈盘').click()
  await expect(page.getByLabel('文件索引')).toContainText('反馈盘 · 文件索引')

  await page.getByLabel('盘位').getByText('全部盘位').click()
  await expect(page.getByLabel('文件索引')).toContainText('全部盘位 · 文件索引')
})

test('归档批次直接读结项案件，并能跳过去处理', async ({ page }) => {
  await page.goto('/#/files')
  const archive = page.getByLabel('归档与备份')

  await expect(archive.getByText(/等待 IT 备份回执/)).toBeVisible()
  await expect(archive.getByText(/真实的剪切、备份和权限处理由 IT 执行/)).toBeVisible()

  await archive.getByRole('button', { name: /去结项中心处理/ }).first().click()
  await expect(page.getByRole('heading', { name: '结项中心' })).toBeVisible()
})

test('恢复示例数据把文件索引一并复位', async ({ page }) => {
  await page.goto('/#/files')
  await page.getByLabel('文件索引').getByText('机甲主角_最终版本_改过的_v3_ok.fbx').click()
  await page.getByLabel('文件详情').getByLabel('关联到阶段').selectOption('MECH-01/3D_LOW')
  await page.getByLabel('文件详情').getByRole('button', { name: '确认关联' }).click()
  await expect(page.getByLabel('文件详情').getByRole('heading', { name: '已关联' })).toBeVisible()

  await page.getByRole('button', { name: '恢复示例数据' }).click()
  await page.goto('/#/files')
  await page.getByLabel('文件索引').getByText('机甲主角_最终版本_改过的_v3_ok.fbx').click()
  await expect(page.getByLabel('文件详情').getByLabel('关联到阶段')).toBeVisible()
})
