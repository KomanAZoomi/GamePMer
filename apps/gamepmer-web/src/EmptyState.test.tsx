import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { App } from './App'
import { NAV_ITEMS } from './app/navigation'
import { createBlankState } from './data/seed'
import { LocalDemoRepository, type StorageLike } from './data/LocalDemoRepository'
import { createWorkspaceStore } from './features/workspace/workspaceStore'

/**
 * 空工作台。
 *
 * 用户要把演示数据换成自己的真实业务，所以「清空之后还能不能用」是一条硬要求：
 * 十个页面一个都不许崩、不许白屏，而且必须告诉人下一步该点哪里——
 * 空态给一片空白，和点了没反应的按钮是同一种失败。
 */

function memoryStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

function renderBlank() {
  const storage = memoryStorage()
  const repository = new LocalDemoRepository(storage)
  repository.clear()
  const store = createWorkspaceStore(repository)
  return { user: userEvent.setup(), store, storage, ...render(<App store={store} />) }
}

beforeEach(() => {
  window.location.hash = ''
})

describe('清空业务数据', () => {
  it('演示项目、报价、候选、反馈、结项全部清掉', () => {
    const blank = createBlankState()
    expect(blank.projects).toHaveLength(0)
    expect(blank.quoteCases).toHaveLength(0)
    expect(blank.quoteVersions).toHaveLength(0)
    expect(blank.candidates).toHaveLength(0)
    expect(blank.sourceRecords).toHaveLength(0)
    expect(blank.feedbackBatches).toHaveLength(0)
    expect(blank.revisions).toHaveLength(0)
    expect(blank.closeoutCases).toHaveLength(0)
    expect(blank.projectPaths).toHaveLength(0)
    expect(blank.notificationDrafts).toHaveLength(0)
    expect(blank.changeRequests).toHaveLength(0)
    expect(blank.auditEvents).toHaveLength(0)
  })

  it('保留组织配置——制作组、工作日历和成员没有创建入口，清掉就没法用了', () => {
    const blank = createBlankState()
    expect(blank.productionGroups.length).toBeGreaterThan(0)
    expect(blank.calendars.length).toBeGreaterThan(0)
    expect(blank.people.length).toBeGreaterThan(0)
  })

  it('清空要落盘，刷新之后不许自己变回示例数据', () => {
    const storage = memoryStorage()
    const repository = new LocalDemoRepository(storage)
    repository.clear()

    // 换一个 Repository 实例重新读，模拟刷新
    const reloaded = new LocalDemoRepository(storage).load()
    expect(reloaded.projects).toHaveLength(0)
    expect(reloaded.productionGroups.length).toBeGreaterThan(0)
  })

  it('清空之后还能恢复示例数据', async () => {
    const { user, store } = renderBlank()
    expect(store.getState().demo.projects).toHaveLength(0)

    await user.click(screen.getAllByRole('button', { name: '恢复示例数据' })[0])
    expect(store.getState().demo.projects.length).toBeGreaterThan(0)
  })
})

describe('十个页面在空态下都不崩', () => {
  for (const item of NAV_ITEMS) {
    it(`${item.label} 渲染出标题，且没有报错边界`, async () => {
      const { user, unmount } = renderBlank()
      const nav = screen.getByRole('navigation', { name: '全局导航' })
      await user.click(within(nav).getByRole('button', { name: new RegExp(item.label) }))

      // 崩了的话根本渲染不出一级标题
      expect(screen.getAllByRole('heading', { level: 1 }).length).toBeGreaterThan(0)
      // 空态不是错误态，不该出现「加载失败」之类的字样
      expect(screen.queryByText(/加载失败|出错了|undefined|NaN/)).toBeNull()
      unmount()
    })
  }
})

describe('空态要告诉人下一步点哪里', () => {
  it('首页说明没有任何项目，并指向新建需求', async () => {
    const { user } = renderBlank()
    const nav = screen.getByRole('navigation', { name: '全局导航' })
    await user.click(within(nav).getByRole('button', { name: /任务管理/ }))

    expect(screen.getByText(/还没有任何项目|暂无|没有/)).toBeInTheDocument()
  })

  it('顶栏的新建需求入口在空态下依然可用——这是整条业务线的起点', async () => {
    const { user } = renderBlank()
    const start = screen.getAllByRole('button', { name: /新增需求/ })[0]
    expect(start).toBeEnabled()
    await user.click(start)
    expect(screen.getAllByRole('heading', { level: 1 }).length).toBeGreaterThan(0)
  })

  /**
   * 空工作台里必须能录进第一条需求。
   *
   * 原来这一页在没有案件时提前返回，把立案面板一起挡在外面——
   * 清空数据之后整个工作台没有任何录入入口，是条死路。
   */
  it('一个案件都没有时，报价页也能立案', async () => {
    const { user, store } = renderBlank()
    const nav = screen.getByRole('navigation', { name: '全局导航' })
    await user.click(within(nav).getByRole('button', { name: /报价与变更/ }))

    await user.click(screen.getByRole('button', { name: '立案第一条需求' }))
    // 立案表单真的出现了，而不是只换了句文案
    expect(screen.getByLabelText(/需求标题/)).toBeInTheDocument()
    expect(store.getState().demo.quoteCases).toHaveLength(0)
  })

  it('顶栏「新增需求」在空工作台里直接打开立案表单', async () => {
    const { user } = renderBlank()
    await user.click(screen.getAllByRole('button', { name: /新增需求/ })[0])
    expect(screen.getByLabelText(/需求标题/)).toBeInTheDocument()
  })
})
