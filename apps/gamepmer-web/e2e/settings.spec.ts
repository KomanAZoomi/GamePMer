import { expect, test, type Page } from '@playwright/test'

/**
 * 设置中心端到端。
 *
 * 最重要的一条：填进去的 API Key 不许出现在前端任何地方——
 * 这里直接翻 localStorage 验，不看文案。
 */

const REAL_KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789'

const section = (page: Page, label: string) =>
  page.getByLabel('设置分组').getByRole('button', { name: new RegExp(`^${label}`) })

test('首次打开落在 LLM 供应商，六个预设都在', async ({ page }) => {
  await page.goto('/#/settings')

  await expect(page.getByRole('heading', { name: '设置中心' })).toBeVisible()
  await expect(page.getByLabel('设置分组')).toBeVisible()
  await expect(page.getByLabel('安全边界')).toBeVisible()

  const table = page.getByLabel('供应商预设')
  await expect(table.locator('tbody tr')).toHaveCount(6)
  await expect(table.getByText('https://api.anthropic.com/v1')).toBeVisible()
})

test('填入的 API Key 在 localStorage 里搜不到', async ({ page }) => {
  await page.goto('/#/settings')

  await page.getByRole('button', { name: '替换 Key' }).click()
  await page.getByLabel('API Key').fill(REAL_KEY)
  await page.getByRole('button', { name: '提交到服务端密钥库' }).click()

  const dump = await page.evaluate(() => JSON.stringify(window.localStorage))
  expect(dump).not.toContain(REAL_KEY)
  expect(dump).not.toContain('sk-ant-api03')
  // 只留后 4 位
  expect(dump).toContain('••••6789')
})

test('Key 输入框是密码类型，格式不对时提交被阻断', async ({ page }) => {
  await page.goto('/#/settings')
  await page.getByRole('button', { name: '替换 Key' }).click()

  await expect(page.getByLabel('API Key')).toHaveAttribute('type', 'password')
  await page.getByLabel('API Key').fill('sk-短')
  await expect(page.getByText(/Key 太短/)).toBeVisible()
  await expect(page.getByRole('button', { name: '提交到服务端密钥库' })).toBeDisabled()
})

test('边界表逐条写清 Key 的去向', async ({ page }) => {
  await page.goto('/#/settings')
  const side = page.getByLabel('安全边界')

  await expect(side.getByText('内网服务端密钥库')).toBeVisible()
  await expect(side.getByText('仅后 4 位，用于识别')).toBeVisible()
  await expect(side.getByText('无（只写不读）')).toBeVisible()
})

test('用途分档：提取用便宜档，分流与起草用中档', async ({ page }) => {
  await page.goto('/#/settings')
  const table = page.getByLabel('用途分配')

  await expect(table.locator('tbody tr')).toHaveCount(5)
  await expect(table.getByText('claude-haiku-4-5')).toHaveCount(2)
  await expect(table.getByText('claude-sonnet-5')).toHaveCount(3)
  await expect(table.getByText(/每百万 token/).first()).toBeVisible()
})

test('连接器如实标注审批门槛，并给替代路径', async ({ page }) => {
  await page.goto('/#/settings')
  await section(page, '连接器').click()

  const list = page.getByLabel('连接器状态')
  // 说明文字里也会出现「零审批」，所以按胶囊的完整文本精确匹配
  await expect(list.getByText('零审批', { exact: true })).toHaveCount(4)
  await expect(list.getByText('需企业管理员', { exact: true })).toHaveCount(2)
  await expect(list.getByText('本人可授权', { exact: true })).toHaveCount(1)
  await expect(list.getByText(/替代路径：/).first()).toBeVisible()
})

test('成员与角色点名兼多角的人', async ({ page }) => {
  await page.goto('/#/settings')
  await section(page, '成员与角色').click()

  await expect(page.getByLabel('成员与角色')).toBeVisible()
  await expect(page.locator('.gp-merge-note').getByText(/只需确认一次/)).toBeVisible()
  await expect(page.getByText(/跨项目共享资源/)).toBeVisible()
})

test('业务规则里的编号规范与解析器同源', async ({ page }) => {
  await page.goto('/#/settings')
  await section(page, '业务规则').click()

  await expect(page.getByText('客户代号_项目代号_2D|3D_批次号')).toBeVisible()
  await expect(page.getByText(/同一份解析规则/)).toBeVisible()
  await expect(page.getByText(/2026-08-05/)).toBeVisible()
})

test('运维页如实说明当前是演示环境', async ({ page }) => {
  await page.goto('/#/settings')
  await section(page, '数据与运维').click()

  await expect(page.getByText(/不要拿真实客户或公司数据测试/)).toBeVisible()
  await expect(page.getByText(/尚无多用户与访问控制/)).toBeVisible()
})

test('十项导航全部进得去，没有一个是占位页', async ({ page }) => {
  const routes = [
    'tasks',
    'projects',
    'inbox',
    'schedule',
    'feedback',
    'quotation',
    'closeout',
    'files',
    'analytics',
    'settings',
  ]

  for (const route of routes) {
    await page.goto(`/#/${route}`)
    await expect(page.locator('h1').first()).toBeVisible()
    await expect(page.getByText(/尚未实现/)).toHaveCount(0)
  }
})

/**
 * 界面上不出现内部标识。
 *
 * 「切片 5 交付」曾经作为过期阻断理由出现过，检查点编号（C2 / C4）
 * 也一样是给写代码的人看的。这条扫全部路由，把这类泄漏一并守住。
 */
test('十个页面都不出现检查点编号或切片编号', async ({ page }) => {
  const routes = [
    'tasks',
    'projects',
    'inbox',
    'schedule',
    'feedback',
    'quotation',
    'closeout',
    'files',
    'analytics',
    'settings',
  ]

  for (const route of routes) {
    await page.goto(`/#/${route}`)
    await expect(page.locator('h1').first()).toBeVisible()
    const body = await page.locator('body').innerText()
    expect(body, `${route} 页泄漏了内部编号`).not.toMatch(/（C\d+）|切片 \d/)
  }
})
