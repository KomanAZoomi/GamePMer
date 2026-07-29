import { expect, test } from '@playwright/test'

/**
 * 顶栏全局搜索。
 *
 * 验收时这里是个空壳：能打字、什么都不接。这组用例守的是它真的接上了，
 * 而且**每条结果都能跳到位**——只切模块不选中记录，等于让人重新找一遍。
 */

test('打两个字出结果，标了类型和命中字段', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox').fill('MECH')

  const panel = page.getByRole('listbox', { name: '搜索结果' })
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('option').first()).toBeVisible()
  await expect(panel.getByText(/命中 /).first()).toBeVisible()
})

test('单字符不检索，说清原因而不是给一屏噪音', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox').fill('M')

  const panel = page.getByRole('listbox', { name: '搜索结果' })
  await expect(panel.getByText(/再多打一个字/)).toBeVisible()
  await expect(panel.getByRole('option')).toHaveCount(0)
})

test('搜不到就说搜不到，不给一个凑数的近似结果', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox').fill('zzzz压根不存在的东西')

  const panel = page.getByRole('listbox', { name: '搜索结果' })
  await expect(panel.getByText(/没有匹配的记录/)).toBeVisible()
  await expect(panel.getByRole('option')).toHaveCount(0)
})

test('搜资产 → 跳到项目总览且那个批次已选中', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox').fill('MECH-01')
  await page.getByRole('listbox', { name: '搜索结果' }).getByRole('option').first().click()

  await expect(page).toHaveURL(/#\/projects/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('NST_A_3D_B24')
  // 跳过去之后面板必须收起，不然它挡着刚打开的页面
  await expect(page.getByRole('listbox', { name: '搜索结果' })).toHaveCount(0)
})

test('搜报价编号 → 跳到报价与变更并选中那件案件', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox').fill('CQ-004')
  await page.getByRole('listbox', { name: '搜索结果' }).getByRole('option').first().click()

  await expect(page).toHaveURL(/#\/quotation/)
  await expect(page.getByText('CQ-004').first()).toBeVisible()
})

test('搜路径片段 → 跳到文件与归档', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox').fill('NAS-ART')

  const panel = page.getByRole('listbox', { name: '搜索结果' })
  const pathHit = panel.getByRole('option').filter({ hasText: '路径' }).first()
  await expect(pathHit).toBeVisible()
  await pathHit.click()

  await expect(page).toHaveURL(/#\/files/)
})

test('键盘全程可用：↓ 选、Enter 开、Esc 关', async ({ page }) => {
  await page.goto('/')
  const box = page.getByRole('combobox')
  await box.fill('MECH')

  await box.press('Escape')
  await expect(page.getByRole('listbox', { name: '搜索结果' })).toHaveCount(0)
  // Esc 只收面板，不清空已经打的字
  await expect(box).toHaveValue('MECH')

  await box.press('ArrowDown')
  await box.press('Enter')
  await expect(page).toHaveURL(/#\/(projects|schedule)/)
})

test('顶栏「新增需求」去报价与变更立案', async ({ page }) => {
  await page.goto('/#/tasks')
  await page.getByRole('button', { name: '新增需求' }).click()
  await expect(page).toHaveURL(/#\/quotation/)
})
