import { expect, test } from '@playwright/test'

/**
 * 文件与归档端到端。
 *
 * 路径只挂批次、手工填写并保存、删除只删索引。
 * 「一键跳转」在浏览器里只能是一键复制——这一点界面必须说清楚，不能给个打不开的链接。
 */

const MAIN = 'NST_A_3D_B24'

test('首次打开有真实密度，六个盘位都列出来', async ({ page }) => {
  await page.goto('/#/files')

  await expect(page.getByRole('heading', { name: '文件与归档' })).toBeVisible()
  await expect(page.getByLabel('批次', { exact: true })).toBeVisible()
  await expect(page.getByLabel('路径登记')).toBeVisible()
  await expect(page.getByLabel('批次详情')).toBeVisible()

  const table = page.getByLabel('盘位路径')
  await expect(table.locator('tbody tr')).toHaveCount(6)
  await expect(table.getByText('还没登记').first()).toBeVisible()
})

test('边界说明写明只挂批次、不搬文件', async ({ page }) => {
  await page.goto('/#/files')

  await expect(page.getByText(/只挂在批次上，不挂到阶段/)).toBeVisible()
  await expect(page.getByText(/不复制、不移动、不删除/)).toBeVisible()
  await expect(page.locator('.gp-files-boundary code').first()).toHaveText(
    '客户代号_项目代号_2D|3D_批次号',
  )
})

test('批次编号拆成四段分色显示', async ({ page }) => {
  await page.goto('/#/files')
  const list = page.getByLabel('批次', { exact: true })

  await expect(list.locator('.gp-seg.is-client').first()).toHaveText('NST')
  await expect(list.locator('.gp-seg.is-discipline').first()).toHaveText('3D')
  await expect(list.locator('.gp-seg.is-batch').first()).toHaveText('B24')
})

test('手工填写路径并保存', async ({ page }) => {
  await page.goto('/#/files')
  const row = page.getByLabel('盘位路径').locator('tr').filter({ hasText: '最终包' })

  await row.getByRole('button', { name: '登记路径' }).click()
  await row.getByLabel('最终包 路径').fill('\\\\NAS-ART\\Final\\NST_A_3D_B24\\v1')
  await row.getByLabel('最终包 备注').fill('总监整理，含源文件与 LOD 清单')
  await row.getByRole('button', { name: '保存' }).click()

  await expect(row.getByText('\\\\NAS-ART\\Final\\NST_A_3D_B24\\v1')).toBeVisible()
  await expect(row.getByText('总监整理，含源文件与 LOD 清单')).toBeVisible()
})

test('路径不合法时保存被阻断，并说清怎么填', async ({ page }) => {
  await page.goto('/#/files')
  const row = page.getByLabel('盘位路径').locator('tr').filter({ hasText: '最终包' })

  await row.getByRole('button', { name: '登记路径' }).click()
  await row.getByLabel('最终包 路径').fill('Final/NST')

  await expect(row.getByText(/UNC/)).toBeVisible()
  await expect(row.getByRole('button', { name: '保存' })).toBeDisabled()
})

test('按约定填入只是建议，不自动保存', async ({ page }) => {
  await page.goto('/#/files')
  const row = page.getByLabel('盘位路径').locator('tr').filter({ hasText: '最终包' })

  await row.getByRole('button', { name: '登记路径' }).click()
  await row.getByRole('button', { name: /按约定填入/ }).click()
  await expect(row.getByLabel('最终包 路径')).toHaveValue('\\\\NAS-ART\\Final\\NST_A_3D_B24')

  await row.getByRole('button', { name: '取消' }).click()
  // 取消之后仍然是未登记
  await expect(row.getByText('还没登记')).toBeVisible()
})

test('一键跳转是复制，并说明为什么', async ({ page }) => {
  await page.goto('/#/files')
  const row = page.getByLabel('盘位路径').locator('tr').filter({ hasText: '反馈盘' })

  await expect(row.getByRole('button', { name: '复制路径' })).toBeEnabled()
  // 不给一个浏览器打不开的 file:// 链接
  await expect(page.getByLabel('路径登记').getByRole('link')).toHaveCount(0)
  await expect(page.getByText(/浏览器出于安全限制/)).toBeVisible()
  await expect(page.getByText(/盘上的文件不受任何影响/)).toBeVisible()
})

test('删除登记只删索引，项目本身不受影响', async ({ page }) => {
  await page.goto('/#/files')
  const row = page.getByLabel('盘位路径').locator('tr').filter({ hasText: '参考资料' })

  await row.getByRole('button', { name: '删除登记' }).click()
  await expect(row.getByText('还没登记')).toBeVisible()

  await page.goto('/#/projects')
  await expect(page.getByText(MAIN).first()).toBeVisible()
})

test('切批次能看到还差哪几个盘位', async ({ page }) => {
  await page.goto('/#/files')
  await page.getByLabel('批次', { exact: true }).getByText('NPC 服装套装').click()

  const detail = page.getByLabel('批次详情')
  await expect(detail.getByText(/还差 4 个盘位没登记/)).toBeVisible()
})

test('还没建项但已报价的批次也能先占盘', async ({ page }) => {
  await page.goto('/#/files')
  const list = page.getByLabel('批次', { exact: true })

  await expect(list.getByText('尚未建项（报价中）').first()).toBeVisible()
  await list.getByText('尚未建项（报价中）').first().click()

  const row = page.getByLabel('盘位路径').locator('tr').filter({ hasText: '反馈盘' })
  await row.getByRole('button', { name: '登记路径' }).click()
  await row.getByRole('button', { name: /按约定填入/ }).click()
  await row.getByRole('button', { name: '保存' }).click()
  await expect(row.getByRole('button', { name: '复制路径' })).toBeVisible()
})

test('结项中心读的是同一份路径', async ({ page }) => {
  await page.goto('/#/files')
  await page.getByLabel('批次', { exact: true }).getByText('幽灵中继站道具组').click()

  const archiveRow = page.getByLabel('盘位路径').locator('tr').filter({ hasText: '归档盘' })
  await archiveRow.getByRole('button', { name: '修改' }).click()
  await archiveRow.getByLabel('归档盘（IT 管辖） 路径').fill('\\\\ARCHIVE\\2027\\AUR_A_3D_B11')
  await archiveRow.getByRole('button', { name: '保存' }).click()

  // 结项中心的路径索引跟着变，说明没有两份数据
  await page.goto('/#/closeout')
  await expect(page.getByLabel('结项门禁').getByText('\\\\ARCHIVE\\2027\\AUR_A_3D_B11')).toBeVisible()
})

test('恢复示例数据把路径登记一并复位', async ({ page }) => {
  await page.goto('/#/files')
  const row = page.getByLabel('盘位路径').locator('tr').filter({ hasText: '参考资料' })
  await row.getByRole('button', { name: '删除登记' }).click()
  await expect(row.getByText('还没登记')).toBeVisible()

  await page.getByRole('button', { name: '恢复示例数据' }).click()
  await page.goto('/#/files')
  await expect(
    page.getByLabel('盘位路径').locator('tr').filter({ hasText: '参考资料' }).getByRole('button', { name: '复制路径' }),
  ).toBeVisible()
})
