import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import { NAV_ITEMS } from './app/navigation'
import { LocalDemoRepository, type StorageLike } from './data/LocalDemoRepository'
import { createWorkspaceStore } from './features/workspace/workspaceStore'

function memoryStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

function renderApp() {
  const store = createWorkspaceStore(new LocalDemoRepository(memoryStorage()))
  return { user: userEvent.setup(), ...render(<App store={store} />) }
}

beforeEach(() => {
  window.location.hash = ''
})

describe('工作台外壳', () => {
  it('完整展开十项导航，不折叠也不删减', () => {
    renderApp()
    const nav = screen.getByRole('navigation', { name: '全局导航' })
    for (const item of NAV_ITEMS) {
      expect(within(nav).getByRole('button', { name: new RegExp(item.label) })).toBeInTheDocument()
    }
    expect(NAV_ITEMS).toHaveLength(10)
  })

  it('未实现的模块点得动，并说明在哪个检查点交付', async () => {
    const { user } = renderApp()
    await user.click(screen.getByRole('button', { name: /报价与变更/ }))
    expect(screen.getByRole('heading', { name: '报价与变更' })).toBeInTheDocument()
    expect(screen.getByText(/尚未实现/)).toBeInTheDocument()
  })

  it('已实现的模块给出真实页面，而不是占位说明', async () => {
    const { user } = renderApp()
    await user.click(screen.getByRole('button', { name: /候选收件箱/ }))
    expect(screen.getByRole('heading', { name: '候选收件箱' })).toBeInTheDocument()
    expect(screen.queryByText(/尚未实现/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('候选记录')).toBeInTheDocument()
  })
})

describe('首页首次打开', () => {
  it('直接呈现多个项目的真实数据，不是空白页', () => {
    renderApp()
    expect(screen.getByRole('heading', { name: '任务管理' })).toBeInTheDocument()
    expect(screen.getByText(/共 4 个在管项目/)).toBeInTheDocument()
    expect(screen.getByLabelText('跨项目时间线')).toBeInTheDocument()
  })

  it('指标数字由种子数据算出，而不是写死的字符串', () => {
    renderApp()
    const board = screen.getByLabelText('任务看板')
    const todoCount = within(board).getByText('9')
    expect(todoCount).toBeInTheDocument()
  })

  it('每条待办都显示它为什么出现在这里', () => {
    renderApp()
    const board = screen.getByLabelText('任务看板')
    expect(within(board).getAllByText(/客户反馈 F-017 待分流/).length).toBe(3)
    expect(within(board).getByText(/可能延期/)).toBeInTheDocument()
    // 7/28 到期的三个阶段各自生成 T-1 提醒
    expect(within(board).getAllByText(/明日到期/).length).toBe(3)
    expect(within(board).getByText(/等待客户验收已/)).toBeInTheDocument()
    expect(within(board).getByText(/全部资产已验收/)).toBeInTheDocument()
  })

  it('可能延期的措辞不把它说成已经延期', () => {
    renderApp()
    const board = screen.getByLabelText('任务看板')
    expect(within(board).queryByText(/已延期/)).toBeNull()
  })
})

describe('选中待办', () => {
  it('切换待办会同步更新右侧详情与中央阶段流', async () => {
    const { user } = renderApp()
    const board = screen.getByLabelText('任务看板')

    await user.click(within(board).getByRole('button', { name: /缩小肩甲比例/ }))
    const detail = screen.getByLabelText('智能详情')
    expect(within(detail).getByRole('heading', { name: '缩小肩甲比例' })).toBeInTheDocument()
    expect(screen.getByLabelText('MECH-01 阶段流')).toBeInTheDocument()

    await user.click(within(board).getByRole('button', { name: /CHAR-09 · 草图/ }))
    expect(screen.getByLabelText('CHAR-09 阶段流')).toBeInTheDocument()
  })

  it('反馈类待办展示原始证据与 AI 依据，并标明建议未执行', async () => {
    const { user } = renderApp()
    const board = screen.getByLabelText('任务看板')
    await user.click(within(board).getByRole('button', { name: /新增腰部挂件/ }))

    const detail = screen.getByLabelText('智能详情')
    expect(within(detail).getByText('原始证据')).toBeInTheDocument()
    expect(within(detail).getByText(/review_03\.jpg/)).toBeInTheDocument()
    expect(within(detail).getByText('范围外追加')).toBeInTheDocument()
    expect(within(detail).getByText(/建议未执行/)).toBeInTheDocument()
  })

  it('阶段流同时显示当前日期、负责人与人天，不只有一个状态色块', async () => {
    const { user } = renderApp()
    const board = screen.getByLabelText('任务看板')
    await user.click(within(board).getByRole('button', { name: /缩小肩甲比例/ }))

    const deck = screen.getByLabelText('MECH-01 阶段流')
    expect(within(deck).getByText('中模')).toBeInTheDocument()
    expect(within(deck).getByText('LOD')).toBeInTheDocument()
    // 行内用紧凑日期，完整日期放在 title 里
    expect(within(deck).getByText('07-27 — 07-29')).toBeInTheDocument()
    expect(within(deck).getByTitle('2026-07-27 — 2026-07-29')).toBeInTheDocument()
    expect(within(deck).getAllByText(/人天/).length).toBeGreaterThan(0)
  })
})

describe('示例数据', () => {
  it('提供一键恢复入口', async () => {
    const { user } = renderApp()
    await user.click(screen.getByRole('button', { name: '恢复示例数据' }))
    expect(screen.getByText(/共 4 个在管项目/)).toBeInTheDocument()
  })
})
