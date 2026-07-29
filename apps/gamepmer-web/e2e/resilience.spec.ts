import { expect, test, type Page } from '@playwright/test'

import { DEMO_STORAGE_KEY } from '../src/data/LocalDemoRepository'

/**
 * 压力数据与可达性回归。
 *
 * 视觉验收不能只用「刚好合适」的种子数据。真实项目里项目名会很长、
 * 资产会很多、一次反馈会拆出十几项——这些情况下版面不能垮。
 */

/**
 * 直接引真常量，不再手抄。
 * 存储键是由 schema 版本拼出来的，抄一份在这里的后果是：
 * schema 一升版，这份压力数据就悄悄写进了没人读的旧键，测试却还「通过」。
 */
const STORAGE_KEY = DEMO_STORAGE_KEY

/** 往仓储里塞一份极端数据：超长名称、多资产、多反馈项。 */
async function seedStressData(page: Page) {
  await page.addInitScript((key: string) => {
    const longName = '蒸汽守卫机甲主角资产包（含可拆卸武器组与四套涂装变体）第二批次'
    const base = {
      schemaVersion: 8,
      calendars: [{ id: 'cal-company', name: '公司日历 2026', holidays: ['2026-08-05'], extraWorkdays: [] }],
      productionGroups: [
        { id: 'grp-3d-a', name: '3D 角色 A 组（含外包协作）', discipline: '3D', leadName: 'Leo', dailyCapacity: 1.5 },
        { id: 'grp-3d-b', name: '3D 场景 B 组', discipline: '3D', leadName: 'Rui', dailyCapacity: 3 },
        { id: 'grp-2d-a', name: '2D 角色 A 组', discipline: '2D', leadName: 'Yuki', dailyCapacity: 2 },
      ],
      projects: [
        {
          id: 'prj-stress',
          code: 'NST_A_3D_B24',
          name: longName,
          client: 'Northstar Studio 北极星互动娱乐（上海）有限公司',
          discipline: '3D',
          status: 'InProduction',
          pmName: 'Brandon',
          artDirectorName: 'Evan',
          calendarId: 'cal-company',
          // 8 个资产 × 6 阶段 = 48 行
          assets: Array.from({ length: 8 }, (_, assetIndex) => ({
            id: `MECH-${String(assetIndex + 1).padStart(2, '0')}`,
            name: `机甲单位 ${assetIndex + 1} 号 · 带可替换护甲与武器挂点`,
            discipline: '3D',
            projectCode: 'NST_A_3D_B24',
            stages: ['3D_MID', '3D_HIGH', '3D_LOW', '3D_BAKE', '3D_TEXTURE', '3D_LOD'].map(
              (code, stageIndex) => ({
                id: `MECH-${String(assetIndex + 1).padStart(2, '0')}/${code}`,
                code,
                name: ['中模', '高模', '低模', '烘焙', '贴图', 'LOD'][stageIndex],
                assetId: `MECH-${String(assetIndex + 1).padStart(2, '0')}`,
                productionGroupId: 'grp-3d-a',
                ownerName: 'Chen',
                estimatedPersonDays: 2,
                baselineStart: '2026-07-27',
                baselineFinish: '2026-07-28',
                currentStart: '2026-07-27',
                currentFinish: '2026-07-28',
                dependsOn: [],
                status: 'NotStarted',
                flags: stageIndex === 1 ? ['Rework', 'ScheduleRevisionRequired'] : [],
              }),
            ),
          })),
        },
      ],
      sourceRecords: [],
      candidates: [],
      people: [],
      quoteCases: [],
      quoteVersions: [],
      closeoutCases: [],
      projectPaths: [],
      feedbackBatches: [
        {
          id: 'F-017',
          projectCode: 'NST_A_3D_B24',
          client: 'Northstar Studio',
          receivedAt: '2026-07-27T10:42:00+08:00',
          feedbackDrivePath: '\\\\NAS-ART\\Feedback\\NST_A_3D_B24\\F-017_20260727',
          summary: '一次评审提出十二项修改，涉及比例、结构、纹理与新增部件。',
          clientWaitWorkdays: 1,
          evidence: [
            {
              id: 'EV-1',
              kind: 'email',
              label: 'Outlook 邮件',
              locator: 'Re: NST_A_3D_B24 / Highpoly Review',
              receivedAt: '2026-07-27T10:42:00+08:00',
            },
          ],
          // 12 项反馈
          items: Array.from({ length: 12 }, (_, index) => ({
            id: `F-017/ITEM-${String(index + 1).padStart(2, '0')}`,
            batchId: 'F-017',
            assetId: 'MECH-01',
            stageId: 'MECH-01/3D_HIGH',
            title: `第 ${index + 1} 项修改：需要调整的细节说明写得比较长以便检验换行`,
            originalText: '客户在批注里写了很长一段描述，用来验证详情面板不会被撑破。'.repeat(2),
            scope: 'unclassified',
            status: 'NeedsClassification',
            ownerName: 'Chen',
            estimatedReworkDays: 1,
          })),
        },
      ],
      revisions: [],
      notificationDrafts: [],
      auditEvents: [],
      changeRequests: [],
      insightDispositions: [],
    }
    window.localStorage.setItem(key, JSON.stringify(base))
  }, STORAGE_KEY)
}

test.describe('压力数据下版面不垮', () => {
  test.beforeEach(async ({ page }) => {
    await seedStressData(page)
  })

  for (const width of [1280, 1440, 1920]) {
    test(`${width} 宽度下页面不出现横向溢出`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })

      for (const route of ['tasks', 'projects', 'schedule', 'feedback', 'inbox', 'quotation', 'closeout', 'files', 'analytics', 'settings']) {
        await page.goto(`/#/${route}`)
        await page.waitForTimeout(250)

        // 页面主体不允许整体横向滚动；宽内容应该在自己的容器里滚
        const overflow = await page.evaluate(() => {
          const doc = document.documentElement
          return doc.scrollWidth - doc.clientWidth
        })
        expect(overflow, `${route} 在 ${width} 下横向溢出 ${overflow}px`).toBeLessThanOrEqual(1)
      }
    })
  }

  test('48 个阶段与 12 项反馈都能渲染出来', async ({ page }) => {
    await page.goto('/#/projects')
    const gantt = page.getByLabel('项目排期甘特')
    await expect(gantt.getByText('MECH-08 · 机甲单位 8 号 · 带可替换护甲与武器挂点')).toBeVisible()

    await page.goto('/#/feedback')
    const list = page.getByLabel('资产级反馈项')
    await expect(list.getByText(/第 12 项修改/)).toBeVisible()
  })

  test('超长项目名靠省略号收口，而不是把版面顶开', async ({ page }) => {
    await page.goto('/#/projects')
    const head = page.locator('.gp-project-tab-name').first()

    // 装得下就不裁，装不下也只会省略——两种情况都不许溢出到容器外
    const box = await head.evaluate((node) => {
      const style = window.getComputedStyle(node)
      const parent = node.parentElement as HTMLElement
      return {
        ellipsis: style.textOverflow,
        overflow: style.overflow,
        withinParent: node.getBoundingClientRect().width <= parent.getBoundingClientRect().width + 1,
      }
    })

    expect(box.ellipsis).toBe('ellipsis')
    expect(box.overflow).toBe('hidden')
    expect(box.withinParent).toBe(true)
  })
})

test.describe('键盘可达性', () => {
  test('Tab 能走到主要操作，且焦点看得见', async ({ page }) => {
    await page.goto('/#/tasks')

    const focusRing = async () => {
      return page.evaluate(() => {
        const active = document.activeElement
        if (!active || active === document.body) return undefined
        const style = window.getComputedStyle(active)
        return {
          tag: active.tagName,
          text: (active.textContent ?? '').trim().slice(0, 20),
          shadow: style.boxShadow,
        }
      })
    }

    // 连续 Tab 若干次，应当能落在导航按钮上，并且有可见焦点环
    let sawNav = false
    let sawRing = false
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab')
      const info = await focusRing()
      if (!info) continue
      if (info.tag === 'BUTTON' && info.text.includes('任务管理')) sawNav = true
      if (info.shadow && info.shadow !== 'none') sawRing = true
    }

    expect(sawNav, 'Tab 应当能到达全局导航').toBe(true)
    expect(sawRing, '获得焦点的控件应当有可见焦点环').toBe(true)
  })

  /**
   * 原来这条盯的是顶栏那个禁用的「新建任务」。那个按钮已经改成真的能跳去候选收件箱，
   * 于是这条测试没了靶子——换成守真正的规则本身：**禁用的控件必须说明为什么禁用**。
   * 这样以后哪个按钮被禁用都跑不掉，不会再随某一个按钮的去留而失效。
   */
  test('每个禁用控件都说明了为什么禁用', async ({ page }) => {
    let seenDisabled = 0

    for (const route of ['tasks', 'projects', 'quotation', 'closeout', 'files']) {
      await page.goto(`/#/${route}`)
      const naked = await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('button[disabled]'))
        return {
          total: nodes.length,
          // 禁用又不说原因的，就是让人点了没反应的死键
          silent: nodes
            .filter((node) => !node.getAttribute('title')?.trim())
            .map((node) => node.textContent?.trim() ?? ''),
        }
      })
      expect(naked.silent, `${route} 存在禁用但没说明原因的控件`).toEqual([])
      seenDisabled += naked.total
    }

    // 全站一个禁用控件都没有的话，这条测试就是空转
    expect(seenDisabled, '应当至少有一个禁用控件可供检查').toBeGreaterThan(0)
  })

  test('反馈中心的关键动作都有可读的可访问名', async ({ page }) => {
    await page.goto('/#/feedback')
    await expect(page.getByRole('button', { name: '判为范围内' })).toBeVisible()
    await expect(page.getByRole('button', { name: '判为范围外' })).toBeVisible()
    await expect(page.getByLabel('反馈批次')).toBeVisible()
    await expect(page.getByLabel('资产级反馈项')).toBeVisible()
    await expect(page.getByLabel('反馈项详情')).toBeVisible()
  })
})
