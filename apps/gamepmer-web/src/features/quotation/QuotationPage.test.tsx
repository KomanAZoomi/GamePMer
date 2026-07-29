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

/**
 * 从复核通过一路点到「可以发开工邮件」。
 *
 * 中间隔着 BD 报客户、客户回话两步——验收时用户指出真实流程是
 * 组长复核后给客户、BD 回传客户确认，才算正式接项目。
 */
async function throughClient(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /以组长兼BD身份复核通过/ }))
  await user.click(screen.getByRole('button', { name: 'BD 已把报价报给客户' }))
  await user.click(screen.getByRole('button', { name: '客户已确认接受' }))
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
    expect(within(detail).getByText(/复核通过不等于报给客户了/)).toBeInTheDocument()
  })

  it('复核前不给开工按钮，走完客户环节才出现', async () => {
    const { user } = renderQuotation()
    await goto(user)

    expect(screen.queryByRole('button', { name: /我已发出变更开工邮件/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: /以组长兼BD身份复核通过/ }))
    // 复核通过还不给开工：这一版还在公司内部，没报给客户
    expect(screen.queryByRole('button', { name: /我已发出变更开工邮件/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'BD 已把报价报给客户' }))
    // 报出去了也不给：客户没点头
    expect(screen.queryByRole('button', { name: /我已发出变更开工邮件/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: '客户已确认接受' }))
    expect(screen.getByRole('button', { name: /我已发出变更开工邮件/ })).toBeEnabled()
  })

  it('每一步「发出」都是人工声明，界面逐步写明工作台不发信', async () => {
    const { user } = renderQuotation()
    await goto(user)

    await user.click(screen.getByRole('button', { name: /以组长兼BD身份复核通过/ }))
    const detail = screen.getByLabelText('报价详情')
    expect(within(detail).getByText(/工作台不发送邮件/)).toBeInTheDocument()
    expect(within(detail).getByLabelText('BD 从哪里发给客户')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'BD 已把报价报给客户' }))
    expect(screen.getByLabelText('客户从哪里回的')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '客户已确认接受' }))
    expect(screen.getByLabelText('你从哪里发出的')).toBeInTheDocument()
  })

  /** 客户不接受是终止，不是退回重报——而且必须写清原因 */
  it('客户不接受要写原因才能终止案件', async () => {
    const { user } = renderQuotation()
    await goto(user)
    await user.click(screen.getByRole('button', { name: /以组长兼BD身份复核通过/ }))
    await user.click(screen.getByRole('button', { name: 'BD 已把报价报给客户' }))

    const decline = screen.getByRole('button', { name: '客户未接受 · 终止案件' })
    expect(decline).toBeDisabled()

    await user.type(screen.getByLabelText(/客户怎么说的/), '价格超预算 30%')
    expect(decline).toBeEnabled()
    await user.click(decline)

    expect(caseOf('CQ-004').status).toBe('Rejected')
    expect(caseOf('CQ-004').clientReplyNote).toBe('价格超预算 30%')
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

    await throughClient(user)
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

    await throughClient(user)
    await user.click(screen.getByRole('button', { name: /我已发出变更开工邮件/ }))

    expect(
      JSON.stringify(store.getState().demo.projects[0].assets.find((a) => a.id === 'MECH-02')),
    ).toBe(before)
  })

  it('开工生成的通知只是草稿，没有被标记为已发送', async () => {
    const { user } = renderQuotation()
    await goto(user)
    await throughClient(user)
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

  /**
   * 这条原来断言「项目没建出来所以开工被阻断」。
   * 现在建项就发生在开工那一刻——阻断变成了交付：点下去项目才出现。
   */
  it('客户确认后发开工通知，项目在这一刻才建出来', async () => {
    const { user } = renderQuotation()
    await goto(user)

    await user.click(screen.getByRole('button', { name: /客户环节/ }))
    const list = screen.getByLabelText('报价案件')
    await user.click(within(list).getByText(/Q-029/))

    // 点之前这个批次还不是正式项目
    expect(store.getState().demo.projects.some((p) => p.code === 'AUR_B_3D_B34')).toBe(false)
    const detail = screen.getByLabelText('报价详情')
    expect(within(detail).getByText(/才正式建项/)).toBeInTheDocument()

    await user.click(within(detail).getByRole('button', { name: /我已发出正式开工邮件/ }))

    const created = store.getState().demo.projects.find((p) => p.code === 'AUR_B_3D_B34')!
    expect(created).toBeDefined()
    expect(created.assets.flatMap((a) => a.stages).length).toBeGreaterThan(0)
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
    expect(within(drawer).getByText(/HLC_C_2D_B20 还不是正式项目/)).toBeInTheDocument()
    // 资产是自由文本，不是下拉——库里根本没有可选项
    await user.click(within(drawer).getByRole('button', { name: '按 2D 模板生成' }))
    expect(within(drawer).getAllByLabelText(/资产$/)[0].tagName).toBe('INPUT')
  })

  it('已开工的案件不再提供录入入口，改动要走新变更单', async () => {
    const { user } = renderQuotation()
    await goto(user)
    await throughClient(user)
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

    await throughClient(user)
    await user.click(screen.getByRole('button', { name: /我已发出变更开工邮件/ }))

    const initial = store.getState().demo.quoteVersions.find((v) => v.caseId === 'Q-021')!
    expect(initial.version).toBe(1)
    expect(initial.supersededAt).toBeUndefined()

    const detail = screen.getByLabelText('报价详情')
    expect(within(detail).getByText('¥ 51,000')).toBeInTheDocument()
  })
})


/**
 * 审批链画几步，实际就得走几步。
 *
 * 原来链上只有四步，复核通过直接跳到开工——等于把公司内部认可当成了客户认可。
 * 这条测试把「链上的步数」和「真实要点几下」绑在一起：
 * 少画一步，或者多画一步不能点，都会当场失败。
 */
describe('审批链与真实流转一一对应', () => {
  it('六步全在，且每一步都对应一次真实动作', async () => {
    const { user } = renderQuotation()
    await goto(user)

    const track = document.querySelector('.gp-approval-track')!
    const steps = track.querySelectorAll('li')
    expect(steps).toHaveLength(6)

    expect(within(track as HTMLElement).getByText('BD 报给客户')).toBeInTheDocument()
    expect(within(track as HTMLElement).getByText('客户确认')).toBeInTheDocument()

    // 逐步点下去，链上对应节点依次变成已完成
    const doneCount = () => track.querySelectorAll('li.is-done').length
    const before = doneCount()

    await user.click(screen.getByRole('button', { name: /以组长兼BD身份复核通过/ }))
    expect(doneCount()).toBe(before + 1)

    await user.click(screen.getByRole('button', { name: 'BD 已把报价报给客户' }))
    expect(doneCount()).toBe(before + 2)

    await user.click(screen.getByRole('button', { name: '客户已确认接受' }))
    expect(doneCount()).toBe(before + 3)

    await user.click(screen.getByRole('button', { name: /我已发出变更开工邮件/ }))
    expect(doneCount()).toBe(6)
  })

  it('客户未接受时那一步标红，开工那步保持关闭', async () => {
    const { user } = renderQuotation()
    await goto(user)

    await user.click(screen.getByRole('button', { name: /以组长兼BD身份复核通过/ }))
    await user.click(screen.getByRole('button', { name: 'BD 已把报价报给客户' }))
    await user.type(screen.getByLabelText(/客户怎么说的/), '预算不够')
    await user.click(screen.getByRole('button', { name: '客户未接受 · 终止案件' }))

    const track = document.querySelector('.gp-approval-track')!
    expect(within(track as HTMLElement).getByText(/客户未接受 · 预算不够/)).toBeInTheDocument()
    expect(track.querySelectorAll('li.is-done')).toHaveLength(4)
  })
})
