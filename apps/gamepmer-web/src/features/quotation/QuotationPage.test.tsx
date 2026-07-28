import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { App } from '../../App'
import { LocalDemoRepository } from '../../data/LocalDemoRepository'
import { createWorkspaceStore, type WorkspaceStore } from '../workspace/workspaceStore'

/**
 * 报价与变更的界面契约。
 *
 * 守的是三条最容易在界面上被糊掉的规则：报价必须带排期、批准不等于开工、
 * 同人兼两角只确认一次。这三条一旦在页面上说不清，PM 就会按错误的心智模型操作。
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

function renderQuotation() {
  store = createWorkspaceStore(new LocalDemoRepository(memoryStorage()))
  const user = userEvent.setup()
  render(<App store={store} />)
  return { user }
}

async function goto(user: ReturnType<typeof userEvent.setup>) {
  const nav = screen.getByLabelText('全局导航')
  await user.click(within(nav).getByRole('button', { name: /报价与变更/ }))
}

function caseOf(id: string) {
  return store.getState().demo.quoteCases.find((entry) => entry.id === id)!
}

function stageOf(id: string) {
  return store
    .getState()
    .demo.projects.flatMap((p) => p.assets)
    .flatMap((a) => a.stages)
    .find((s) => s.id === id)!
}

beforeEach(() => {
  window.location.hash = ''
})

describe('首次打开就有密度', () => {
  it('案件列表、报价单、审批链与待复核清单同屏可见', async () => {
    const { user } = renderQuotation()
    await goto(user)

    expect(screen.getByLabelText('报价案件')).toBeInTheDocument()
    expect(screen.getByLabelText('报价单')).toBeInTheDocument()
    expect(screen.getByLabelText('报价详情')).toBeInTheDocument()
    expect(screen.getByLabelText('待复核清单')).toBeInTheDocument()
    expect(screen.getByText('追加报价审批链')).toBeInTheDocument()
  })

  it('报价单展开到每个阶段，带人天、单价和节点——不是一个总金额', async () => {
    const { user } = renderQuotation()
    await goto(user)

    const table = screen.getByLabelText('报价工作项')
    expect(within(table).getByText('高模 · 能源模块结构')).toBeInTheDocument()
    expect(within(table).getByText('1.5')).toBeInTheDocument()
    expect(within(table).getByText('08-03 — 08-04')).toBeInTheDocument()
    // 合计按行累加：4.5 人天 × ¥2000
    expect(within(table).getByText('¥ 9,000')).toBeInTheDocument()
  })
})

describe('同人兼两角只确认一次', () => {
  it('待复核清单里 CQ-004 只有一条，但两个角色都写出来', async () => {
    const { user } = renderQuotation()
    await goto(user)

    const todos = screen.getByLabelText('待复核清单')
    const rows = within(todos).getAllByRole('row').slice(1) // 去掉表头
    const merged = rows.filter((row) => row.textContent?.includes('CQ-004'))

    expect(merged).toHaveLength(1)
    expect(merged[0].textContent).toContain('组长')
    expect(merged[0].textContent).toContain('BD')
    expect(merged[0].textContent).toContain('合并为 1 次确认')
  })

  it('复核按钮写明以什么身份确认', async () => {
    const { user } = renderQuotation()
    await goto(user)

    const detail = screen.getByLabelText('报价详情')
    expect(within(detail).getByText('组长与 BD 是同一个人')).toBeInTheDocument()
    expect(within(detail).getByRole('button', { name: /以组长兼BD身份复核通过/ })).toBeEnabled()
  })

  it('复核后审计里两个角色都在，但只写一条', async () => {
    const { user } = renderQuotation()
    await goto(user)

    await user.click(screen.getByRole('button', { name: /以组长兼BD身份复核通过/ }))

    const audits = store
      .getState()
      .demo.auditEvents.filter((event) => event.targetId === 'CQ-004' && event.action.includes('复核'))
    expect(audits).toHaveLength(1)
    expect(audits[0].actor).toContain('组长兼BD')
  })
})

describe('批准不等于开工', () => {
  it('复核通过后排期一个字节都没变，并明确写出来', async () => {
    const { user } = renderQuotation()
    await goto(user)

    const before = JSON.stringify(
      store.getState().demo.projects.flatMap((p) => p.assets).flatMap((a) => a.stages),
    )
    await user.click(screen.getByRole('button', { name: /以组长兼BD身份复核通过/ }))

    expect(JSON.stringify(
      store.getState().demo.projects.flatMap((p) => p.assets).flatMap((a) => a.stages),
    )).toBe(before)

    const detail = screen.getByLabelText('报价详情')
    expect(within(detail).getByText(/批准不等于开工/)).toBeInTheDocument()
  })

  it('复核前不给开工按钮，复核后才出现', async () => {
    const { user } = renderQuotation()
    await goto(user)

    expect(screen.queryByRole('button', { name: /我已发出变更开工邮件/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: /以组长兼BD身份复核通过/ }))
    expect(screen.getByRole('button', { name: /我已发出变更开工邮件/ })).toBeEnabled()
  })

  it('开工是人工声明，界面写明工作台不发信', async () => {
    const { user } = renderQuotation()
    await goto(user)
    await user.click(screen.getByRole('button', { name: /以组长兼BD身份复核通过/ }))

    const detail = screen.getByLabelText('报价详情')
    expect(within(detail).getByText(/工作台不发送邮件/)).toBeInTheDocument()
    expect(within(detail).getByLabelText('你从哪里发出的')).toBeInTheDocument()
  })
})

describe('开工后的业务落点', () => {
  it('受影响资产解冻、排期按报价单更新、基准不动', async () => {
    const { user } = renderQuotation()
    await goto(user)

    expect(stageOf('MECH-01/3D_BAKE').flags).toContain('WaitingChangeQuote')
    const baselineBefore = [
      stageOf('MECH-01/3D_HIGH').baselineStart,
      stageOf('MECH-01/3D_HIGH').baselineFinish,
    ]

    await user.click(screen.getByRole('button', { name: /以组长兼BD身份复核通过/ }))
    await user.click(screen.getByRole('button', { name: /我已发出变更开工邮件/ }))

    expect(stageOf('MECH-01/3D_BAKE').flags).not.toContain('WaitingChangeQuote')
    expect(stageOf('MECH-01/3D_HIGH').currentStart).toBe('2026-08-03')
    expect([
      stageOf('MECH-01/3D_HIGH').baselineStart,
      stageOf('MECH-01/3D_HIGH').baselineFinish,
    ]).toEqual(baselineBefore)
    expect(caseOf('CQ-004').status).toBe('KickoffSent')
  })

  it('未受影响的 MECH-02 从头到尾没被这次变更动过', async () => {
    const { user } = renderQuotation()
    await goto(user)
    const before = JSON.stringify(
      store.getState().demo.projects[0].assets.find((a) => a.id === 'MECH-02'),
    )

    await user.click(screen.getByRole('button', { name: /以组长兼BD身份复核通过/ }))
    await user.click(screen.getByRole('button', { name: /我已发出变更开工邮件/ }))

    expect(
      JSON.stringify(store.getState().demo.projects[0].assets.find((a) => a.id === 'MECH-02')),
    ).toBe(before)
  })

  it('开工生成的通知只是草稿，没有被标记为已发送', async () => {
    const { user } = renderQuotation()
    await goto(user)
    await user.click(screen.getByRole('button', { name: /以组长兼BD身份复核通过/ }))
    await user.click(screen.getByRole('button', { name: /我已发出变更开工邮件/ }))

    const kickoffDrafts = store
      .getState()
      .demo.notificationDrafts.filter((draft) => draft.sourceKind === 'kickoff')
    expect(kickoffDrafts.length).toBeGreaterThan(0)
    expect(kickoffDrafts.every((draft) => draft.status === 'draft')).toBe(true)
  })
})

describe('驳回与阻断', () => {
  it('退回总监后不能开工，状态回到总监报价中', async () => {
    const { user } = renderQuotation()
    await goto(user)

    await user.click(screen.getByRole('button', { name: '退回总监修改' }))
    expect(caseOf('CQ-004').status).toBe('DirectorQuoting')
    expect(screen.queryByRole('button', { name: /我已发出变更开工邮件/ })).toBeNull()
  })

  it('总监还没返回报价的案件说明缺什么，不给一个假的复核按钮', async () => {
    const { user } = renderQuotation()
    await goto(user)

    const list = screen.getByLabelText('报价案件')
    await user.click(within(list).getByText(/Q-030/))

    const detail = screen.getByLabelText('报价详情')
    expect(within(detail).getByText('等待总监返回')).toBeInTheDocument()
    expect(within(detail).getByText(/只有一个总金额的报价没法排产/)).toBeInTheDocument()
    expect(within(detail).queryByRole('button', { name: /复核通过/ })).toBeNull()
  })

  it('首次报价的项目还没创建时，开工被诚实阻断', async () => {
    const { user } = renderQuotation()
    await goto(user)

    await user.click(screen.getByRole('button', { name: /待开工/ }))
    const list = screen.getByLabelText('报价案件')
    await user.click(within(list).getByText(/Q-029/))

    const detail = screen.getByLabelText('报价详情')
    expect(within(detail).getByRole('button', { name: /标记开工（被阻断）/ })).toBeDisabled()
  })
})

describe('总监录入报价——每个状态都要能往下走', () => {
  it('「总监报价中」的案件有录入入口，不是一句「等待总监返回」就没了', async () => {
    const { user } = renderQuotation()
    await goto(user)
    await user.click(within(screen.getByLabelText('报价案件')).getByText(/Q-030/))

    expect(screen.getByRole('button', { name: '录入总监报价' })).toBeEnabled()
  })

  it('录入人天与节点后提交，案件进入待复核', async () => {
    const { user } = renderQuotation()
    await goto(user)
    await user.click(within(screen.getByLabelText('报价案件')).getByText(/Q-030/))
    await user.click(screen.getByRole('button', { name: '录入总监报价' }))

    const drawer = screen.getByLabelText('录入报价')
    await user.click(within(drawer).getByRole('button', { name: '按 2D 模板生成' }))

    // 模板给出三行，逐行填人天与节点
    const dayInputs = within(drawer).getAllByLabelText(/人天$/)
    expect(dayInputs.length).toBe(3)
    for (const input of dayInputs) {
      await user.clear(input)
      await user.type(input, '2')
    }
    for (const input of within(drawer).getAllByLabelText(/开始日$/)) {
      await user.type(input, '2026-08-17')
    }
    for (const input of within(drawer).getAllByLabelText(/结束日$/)) {
      await user.type(input, '2026-08-18')
    }

    await user.click(within(drawer).getByRole('button', { name: '提交给组长/BD 复核' }))

    expect(caseOf('Q-030').status).toBe('AwaitingReview')
    expect(store.getState().demo.quoteVersions.filter((v) => v.caseId === 'Q-030')).toHaveLength(1)
  })

  it('缺人天或缺节点时提交被阻断，并说明缺哪一行', async () => {
    const { user } = renderQuotation()
    await goto(user)
    await user.click(within(screen.getByLabelText('报价案件')).getByText(/Q-030/))
    await user.click(screen.getByRole('button', { name: '录入总监报价' }))

    const drawer = screen.getByLabelText('录入报价')
    await user.click(within(drawer).getByRole('button', { name: '按 2D 模板生成' }))

    expect(within(drawer).getByRole('button', { name: /提交（被阻断）/ })).toBeDisabled()
    expect(within(drawer).getAllByText(/缺人天/).length).toBeGreaterThan(0)
    expect(caseOf('Q-030').status).toBe('DirectorQuoting')
  })

  it('退回总监后能重新提交，产生 v2 且 v1 留档', async () => {
    const { user } = renderQuotation()
    await goto(user)

    await user.click(screen.getByRole('button', { name: '退回总监修改' }))
    expect(caseOf('CQ-004').status).toBe('DirectorQuoting')

    // 退回不是死胡同：同一张案件能重新录入
    await user.click(screen.getByRole('button', { name: '录入总监报价' }))
    const drawer = screen.getByLabelText('录入报价')
    // 上一版内容预填，总监只需改动，不用重打一遍
    expect(within(drawer).getAllByLabelText(/人天$/).length).toBe(5)

    const first = within(drawer).getAllByLabelText(/人天$/)[0]
    await user.clear(first)
    await user.type(first, '2')
    await user.click(within(drawer).getByRole('button', { name: '提交给组长/BD 复核' }))

    expect(caseOf('CQ-004').status).toBe('AwaitingReview')
    const versions = store.getState().demo.quoteVersions.filter((v) => v.caseId === 'CQ-004')
    expect(versions).toHaveLength(2)
    expect(versions.find((v) => v.version === 1)!.supersededAt).toBeTruthy()
    // v1 的内容一字未改
    expect(versions.find((v) => v.version === 1)!.lines[0].personDays).toBe(1.5)
  })

  it('项目还没创建时，资产与阶段可以自由填写并说明原因', async () => {
    const { user } = renderQuotation()
    await goto(user)
    await user.click(within(screen.getByLabelText('报价案件')).getByText(/Q-030/))
    await user.click(screen.getByRole('button', { name: '录入总监报价' }))

    const drawer = screen.getByLabelText('录入报价')
    expect(within(drawer).getByText(/P-2D-020 还不是正式项目/)).toBeInTheDocument()
    // 资产是自由文本，不是下拉——库里根本没有可选项
    await user.click(within(drawer).getByRole('button', { name: '按 2D 模板生成' }))
    expect(within(drawer).getAllByLabelText(/资产$/)[0].tagName).toBe('INPUT')
  })

  it('已开工的案件不再提供录入入口，改动要走新变更单', async () => {
    const { user } = renderQuotation()
    await goto(user)
    await user.click(screen.getByRole('button', { name: /以组长兼BD身份复核通过/ }))
    await user.click(screen.getByRole('button', { name: /我已发出变更开工邮件/ }))

    expect(screen.queryByRole('button', { name: '录入总监报价' })).toBeNull()
  })
})

describe('原报价永不覆盖', () => {
  it('应结汇总同时列出首次报价与追加报价', async () => {
    const { user } = renderQuotation()
    await goto(user)

    const detail = screen.getByLabelText('报价详情')
    expect(within(detail).getByText(/首次报价 Q-021/)).toBeInTheDocument()
    expect(within(detail).getByText(/追加报价 CQ-004/)).toBeInTheDocument()
    // 追加报价还没开工，不计入应结
    expect(within(detail).getByText('当前应结合计')).toBeInTheDocument()
  })

  it('追加开工后应结合计把追加金额加进来，首次报价版本不变', async () => {
    const { user } = renderQuotation()
    await goto(user)

    await user.click(screen.getByRole('button', { name: /以组长兼BD身份复核通过/ }))
    await user.click(screen.getByRole('button', { name: /我已发出变更开工邮件/ }))

    const initial = store.getState().demo.quoteVersions.find((v) => v.caseId === 'Q-021')!
    expect(initial.version).toBe(1)
    expect(initial.supersededAt).toBeUndefined()

    const detail = screen.getByLabelText('报价详情')
    expect(within(detail).getByText('¥ 51,000')).toBeInTheDocument()
  })
})
