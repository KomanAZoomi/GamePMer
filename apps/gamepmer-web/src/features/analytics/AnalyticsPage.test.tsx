import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { App } from '../../App'
import { LocalDemoRepository } from '../../data/LocalDemoRepository'
import { createWorkspaceStore, type WorkspaceStore } from '../workspace/workspaceStore'

/**
 * 智能分析的界面契约。
 *
 * 守两条红线：客户等待与团队延期在界面上永远是两个数、
 * 页面任何地方都不出现制作人员姓名。
 */

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  }
}

let store: WorkspaceStore

function renderAnalytics() {
  store = createWorkspaceStore(new LocalDemoRepository(memoryStorage()))
  const user = userEvent.setup()
  render(<App store={store} />)
  return { user }
}

async function goto(user: ReturnType<typeof userEvent.setup>) {
  const nav = screen.getByLabelText('全局导航')
  await user.click(within(nav).getByRole('button', { name: /智能分析/ }))
}

/** 页签「报价与变更」与左侧导航同名，必须限定在页头的 chip 行里点。 */
async function switchTab(user: ReturnType<typeof userEvent.setup>, label: string) {
  const head = document.querySelector('.gp-analytics .gp-chip-row') as HTMLElement
  await user.click(within(head).getByRole('button', { name: label }))
}

beforeEach(() => {
  window.location.hash = ''
})

describe('首次打开就有密度', () => {
  it('五个指标、主区与 AI 洞察同屏可见', async () => {
    const { user } = renderAnalytics()
    await goto(user)

    expect(screen.getByLabelText('分析主区')).toBeInTheDocument()
    expect(screen.getByLabelText('AI 洞察')).toBeInTheDocument()
    expect(screen.getByLabelText('项目健康度')).toBeInTheDocument()
    expect(screen.getByText('阶段按期交付率')).toBeInTheDocument()
  })

  it('页头写明这一页不产生新数据', async () => {
    const { user } = renderAnalytics()
    await goto(user)
    expect(screen.getByText(/不产生任何新数据/)).toBeInTheDocument()
  })
})

describe('客户等待与团队延期分开', () => {
  it('两个指标各占一格，不合并成一个「延期率」', async () => {
    const { user } = renderAnalytics()
    await goto(user)

    expect(screen.getByText('客户等待占比')).toBeInTheDocument()
    expect(screen.getByText('团队延期占比')).toBeInTheDocument()
    expect(screen.getByText('不计入团队延期')).toBeInTheDocument()
    expect(screen.getByText('已扣除客户等待')).toBeInTheDocument()
  })

  it('归因页四类各一行，并说明各自是什么', async () => {
    const { user } = renderAnalytics()
    await goto(user)
    await switchTab(user, '延期归因')

    const table = screen.getByLabelText('归因明细')
    for (const label of ['客户等待', '范围内返修', '团队延期', '依赖阻塞']) {
      expect(within(table).getByText(label)).toBeInTheDocument()
    }
    expect(within(table).getByText(/不算团队的账/)).toBeInTheDocument()
  })

  it('逐阶段下钻能看到是哪个阶段、归到哪一类', async () => {
    const { user } = renderAnalytics()
    await goto(user)
    await switchTab(user, '延期归因')

    const drill = screen.getByLabelText('阶段下钻')
    expect(within(drill).getAllByRole('row').length).toBeGreaterThan(1)
  })
})

describe('不下钻到个人', () => {
  it('页面上不出现任何制作人员姓名', async () => {
    const { user } = renderAnalytics()
    await goto(user)

    const owners = [
      ...new Set(
        store
          .getState()
          .demo.projects.flatMap((p) => p.assets)
          .flatMap((a) => a.stages)
          .map((s) => s.ownerName),
      ),
    ]
    expect(owners.length).toBeGreaterThan(0)

    // 四个页签都看一遍
    for (const tab of ['交付表现', '延期归因', '产能与负载', '报价与变更']) {
      await switchTab(user, tab)
      const text = screen.getByLabelText('分析主区').textContent ?? ''
      for (const owner of owners) {
        expect(text.includes(owner)).toBe(false)
      }
    }
  })

  it('口径说明里明写不统计个人维度', async () => {
    const { user } = renderAnalytics()
    await goto(user)

    const side = screen.getByLabelText('AI 洞察')
    expect(within(side).getByText(/不统计任何个人维度/)).toBeInTheDocument()
    expect(within(side).getByText(/制作组内部谁做的哪一版，工作台不记录/)).toBeInTheDocument()
  })
})

describe('四个页签都是真视图', () => {
  it('切页签会换主区内容，不是摆设', async () => {
    const { user } = renderAnalytics()
    await goto(user)

    await switchTab(user, '产能与负载')
    expect(screen.getByLabelText('制作组负载')).toBeInTheDocument()

    await switchTab(user, '报价与变更')
    expect(screen.getByLabelText('报价统计')).toBeInTheDocument()

    await switchTab(user, '交付表现')
    expect(screen.getByLabelText('项目健康度')).toBeInTheDocument()
  })

  it('负载矩阵说明是跨项目共享，与筛选无关', async () => {
    const { user } = renderAnalytics()
    await goto(user)
    await switchTab(user, '产能与负载')

    expect(screen.getByText(/跨项目共享，与筛选无关/)).toBeInTheDocument()
    expect(screen.getByText(/不显示组内是谁做的/)).toBeInTheDocument()
  })
})

describe('AI 洞察', () => {
  it('每条都带依据，并标明工作台不会代做', async () => {
    const { user } = renderAnalytics()
    await goto(user)

    const side = screen.getByLabelText('AI 洞察')
    const cards = side.querySelectorAll('.gp-insight')
    expect(cards.length).toBeGreaterThan(0)
    expect(within(side).getAllByText('仅建议 · 工作台不代做')).toHaveLength(cards.length)
    expect(within(side).getAllByText(/^依据：/)).toHaveLength(cards.length)
  })

  /**
   * 验收时被问到「建议 · 未执行在什么情况下会变」。
   * 答案是它不会变——那是承诺不是状态。会变的是下面的处置，两者必须在界面上分得开。
   */
  it('卡点型和结论型分得开，各自说清会不会自己消失', async () => {
    const { user } = renderAnalytics()
    await goto(user)

    const side = screen.getByLabelText('AI 洞察')
    expect(within(side).getAllByText('卡点').length).toBeGreaterThan(0)
    expect(within(side).getAllByText('结论').length).toBeGreaterThan(0)
    expect(within(side).getAllByText(/办完了这张卡自己就没了/).length).toBeGreaterThan(0)
    expect(within(side).getAllByText(/不会自己消失/).length).toBeGreaterThan(0)
  })

  it('卡点型不给处置按钮——点一下不等于把事办了', async () => {
    const { user } = renderAnalytics()
    await goto(user)

    const side = screen.getByLabelText('AI 洞察')
    const blocker = within(side).getAllByText('卡点')[0].closest('.gp-insight')!
    expect(within(blocker as HTMLElement).queryByRole('button')).toBeNull()
  })

  it('采纳留痕，并且不动任何正式数据', async () => {
    const { user } = renderAnalytics()
    await goto(user)

    const before = store.getState().demo
    const side = screen.getByLabelText('AI 洞察')
    const finding = within(side).getAllByText('结论')[0].closest('.gp-insight')! as HTMLElement
    await user.click(within(finding).getByRole('button', { name: '采纳' }))

    expect(within(finding).getByText('已采纳')).toBeInTheDocument()
    // 时钟给的是完整 ISO 时间戳，界面上不该漏出 `T09:00:00.000Z` 这种东西
    expect(within(finding).getByText(/^2026-07-27 · Brandon$/)).toBeInTheDocument()
    const after = store.getState().demo
    expect(after.insightDispositions).toHaveLength(1)
    expect(after.projects).toEqual(before.projects)
    expect(after.quoteCases).toEqual(before.quoteCases)
  })

  it('暂不采纳要写理由，不写就按不下去，并说明为什么要写', async () => {
    const { user } = renderAnalytics()
    await goto(user)

    const side = screen.getByLabelText('AI 洞察')
    const finding = within(side).getAllByText('结论')[0].closest('.gp-insight')! as HTMLElement
    await user.click(within(finding).getByRole('button', { name: '暂不采纳' }))

    const submit = within(finding).getByRole('button', { name: '记下不采纳' })
    expect(submit).toBeDisabled()
    expect(within(finding).getByText(/没人知道为什么否过/)).toBeInTheDocument()

    await user.type(within(finding).getByLabelText('暂不采纳的理由'), '本季度报价已经报出去了')
    expect(submit).toBeEnabled()
    await user.click(submit)

    expect(within(finding).getByText('暂不采纳')).toBeInTheDocument()
    expect(within(finding).getByText(/本季度报价已经报出去了/)).toBeInTheDocument()
    expect(store.getState().demo.insightDispositions[0].reason).toBe('本季度报价已经报出去了')
  })

  it('改主意留全历史，界面显示最新一次', async () => {
    const { user } = renderAnalytics()
    await goto(user)

    const side = screen.getByLabelText('AI 洞察')
    const finding = within(side).getAllByText('结论')[0].closest('.gp-insight')! as HTMLElement
    await user.click(within(finding).getByRole('button', { name: '采纳' }))
    await user.click(within(finding).getByRole('button', { name: '改为暂不采纳' }))
    await user.type(within(finding).getByLabelText('暂不采纳的理由'), '先放一放')
    await user.click(within(finding).getByRole('button', { name: '记下不采纳' }))

    expect(store.getState().demo.insightDispositions).toHaveLength(2)
    expect(within(finding).getByText('暂不采纳')).toBeInTheDocument()
    expect(within(finding).queryByText('已采纳')).toBeNull()
  })

  it('处置写进审计', async () => {
    const { user } = renderAnalytics()
    await goto(user)

    const before = store.getState().demo.auditEvents.length
    const side = screen.getByLabelText('AI 洞察')
    const finding = within(side).getAllByText('结论')[0].closest('.gp-insight')! as HTMLElement
    await user.click(within(finding).getByRole('button', { name: '采纳' }))

    const events = store.getState().demo.auditEvents
    expect(events).toHaveLength(before + 1)
    expect(events.at(-1)?.targetKind).toBe('Insight')
  })
})

describe('口径与报价页一致', () => {
  it('只有已开工的追加报价计入项目的变更金额', async () => {
    const { user } = renderAnalytics()
    await goto(user)

    const table = screen.getByLabelText('项目健康度')
    const row = within(table).getByText('NST_A_3D_B24').closest('tr')!
    // CQ-004 还没开工
    expect(within(row).getAllByText('—').length).toBeGreaterThan(0)
  })
})
