import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../../App'
import { LocalDemoRepository, type StorageLike } from '../../data/LocalDemoRepository'
import { createWorkspaceStore } from '../workspace/workspaceStore'

function memoryStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

async function renderFeedback() {
  const store = createWorkspaceStore(new LocalDemoRepository(memoryStorage()))
  const user = userEvent.setup()
  const result = render(<App store={store} />)
  const nav = screen.getByRole('navigation', { name: '全局导航' })
  await user.click(within(nav).getByRole('button', { name: /反馈中心/ }))
  return { user, store, ...result }
}

function stageOf(store: ReturnType<typeof createWorkspaceStore>, stageId: string) {
  return store
    .getState()
    .demo.projects.flatMap((project) => project.assets)
    .flatMap((asset) => asset.stages)
    .find((stage) => stage.id === stageId)
}

beforeEach(() => {
  window.location.hash = ''
})

describe('反馈批次与资产级拆分', () => {
  it('一次反馈拆成三项，各自可判定范围', async () => {
    await renderFeedback()
    const list = screen.getByLabelText('资产级反馈项')
    expect(within(list).getByText('缩小肩甲比例')).toBeInTheDocument()
    expect(within(list).getByText('新增腰部挂件')).toBeInTheDocument()
    expect(within(list).getByText('胸甲纹理走向调整')).toBeInTheDocument()
    expect(within(list).getAllByText('待分流')).toHaveLength(6) // 三项 × 范围列 + 状态列
  })

  it('详情给出原文、证据与 AI 依据，并标明建议未执行', async () => {
    await renderFeedback()
    const detail = screen.getByLabelText('反馈项详情')
    expect(within(detail).getByText(/肩甲比例明显大于设定身体比例/)).toBeInTheDocument()
    expect(within(detail).getByText(/review_03\.jpg/)).toBeInTheDocument()
    expect(within(detail).getByText(/建议未执行/)).toBeInTheDocument()
  })
})

describe('范围内返修主路径', () => {
  it('判定范围内后才能生成草案，判定本身不改排期', async () => {
    const { user, store } = await renderFeedback()
    const detail = screen.getByLabelText('反馈项详情')
    await user.click(within(detail).getByRole('button', { name: '判为范围内' }))

    expect(stageOf(store, 'MECH-01/3D_LOW')?.currentStart).toBe('2026-07-27')
    expect(screen.queryByLabelText('排期修订草案')).toBeNull()
    expect(screen.getByRole('button', { name: '生成排期草案' })).toBeInTheDocument()
  })

  it('草案给出旧日期、新日期、工作日增量与未受影响资产', async () => {
    const { user } = await renderFeedback()
    const detail = screen.getByLabelText('反馈项详情')
    await user.click(within(detail).getByRole('button', { name: '判为范围内' }))
    await user.click(screen.getByRole('button', { name: '生成排期草案' }))

    const draft = screen.getByLabelText('排期修订草案')
    expect(within(draft).getByText('07-27 — 07-29')).toBeInTheDocument() // 低模原计划
    expect(within(draft).getByText('07-29 — 07-31')).toBeInTheDocument() // 低模新计划
    // 多个阶段各顺延 2 个工作日
    expect(within(draft).getAllByText('+2').length).toBeGreaterThan(0)
    expect(within(draft).getByText(/未受影响/)).toBeInTheDocument()
    expect(within(draft).getByText(/MECH-02/)).toBeInTheDocument()
  })

  it('草案生成后正式计划仍未改变', async () => {
    const { user, store } = await renderFeedback()
    const detail = screen.getByLabelText('反馈项详情')
    await user.click(within(detail).getByRole('button', { name: '判为范围内' }))
    await user.click(screen.getByRole('button', { name: '生成排期草案' }))

    expect(stageOf(store, 'MECH-01/3D_LOW')?.currentStart).toBe('2026-07-27')
    expect(store.getState().demo.revisions.filter((r) => r.projectCode === 'NST_A_3D_B24')).toHaveLength(0)
  })

  it('微调后后续阶段自动顺延，确认按钮不会被自己制造的冲突卡住', async () => {
    const { user } = await renderFeedback()
    const detail = screen.getByLabelText('反馈项详情')
    await user.click(within(detail).getByRole('button', { name: '判为范围内' }))
    await user.click(screen.getByRole('button', { name: '生成排期草案' }))

    const draft = screen.getByLabelText('排期修订草案')
    await user.click(within(draft).getByRole('button', { name: '低模 顺延一个工作日' }))

    // 7/29—7/31 再推一个工作日 → 7/30—8/3，跳过周末
    expect(within(draft).getByText('07-30 — 08-03')).toBeInTheDocument()
    // 烘焙原本 8/3 会与之相撞，自动让到 8/4
    expect(within(draft).getByText('08-04 — 08-04')).toBeInTheDocument()
    expect(within(draft).getByRole('button', { name: '确认重排' })).toBeEnabled()
  })

  it('取消草案后正式计划零变化', async () => {
    const { user, store } = await renderFeedback()
    const detail = screen.getByLabelText('反馈项详情')
    await user.click(within(detail).getByRole('button', { name: '判为范围内' }))
    await user.click(screen.getByRole('button', { name: '生成排期草案' }))

    const draft = screen.getByLabelText('排期修订草案')
    await user.click(within(draft).getByRole('button', { name: '低模 顺延一个工作日' }))
    await user.click(within(draft).getByRole('button', { name: '取消草案' }))

    expect(screen.queryByLabelText('排期修订草案')).toBeNull()
    expect(stageOf(store, 'MECH-01/3D_LOW')?.currentStart).toBe('2026-07-27')
    expect(stageOf(store, 'MECH-01/3D_LOW')?.currentFinish).toBe('2026-07-29')
    expect(store.getState().demo.revisions.filter((r) => r.projectCode === 'NST_A_3D_B24')).toHaveLength(0)
    expect(store.getState().demo.notificationDrafts.filter((n) => n.sourceKind === 'schedule-revision')).toHaveLength(0)
  })

  it('确认后写入修订、保留基准，并生成未发送通知草稿', async () => {
    const { user, store } = await renderFeedback()
    const detail = screen.getByLabelText('反馈项详情')
    await user.click(within(detail).getByRole('button', { name: '判为范围内' }))
    await user.click(screen.getByRole('button', { name: '生成排期草案' }))
    await user.click(within(screen.getByLabelText('排期修订草案')).getByRole('button', { name: '确认重排' }))

    const low = stageOf(store, 'MECH-01/3D_LOW')
    expect(low?.currentStart).toBe('2026-07-29')
    expect(low?.baselineStart).toBe('2026-07-27')

    const revision = store.getState().demo.revisions.find((r) => r.projectCode === 'NST_A_3D_B24')
    expect(revision?.version).toBe(1)
    expect(revision?.sourceFeedbackItemId).toBe('F-017/ITEM-01')

    const notifications = screen.getByLabelText('通知草稿')
    expect(within(notifications).getAllByText('待发出')).toHaveLength(2)
    // 工作台不发信，措辞必须让人一眼看出这一点
    expect(within(notifications).getByText(/工作台/)).toBeInTheDocument()
    expect(within(notifications).getByText(/不发送邮件/)).toBeInTheDocument()
  })

  it('刷新后已确认的修订仍在（走仓储持久化）', async () => {
    const storage = memoryStorage()
    const first = createWorkspaceStore(new LocalDemoRepository(storage))
    const user = userEvent.setup()
    const view = render(<App store={first} />)

    const nav = screen.getByRole('navigation', { name: '全局导航' })
    await user.click(within(nav).getByRole('button', { name: /反馈中心/ }))
    await user.click(screen.getByRole('button', { name: '判为范围内' }))
    await user.click(screen.getByRole('button', { name: '生成排期草案' }))
    await user.click(within(screen.getByLabelText('排期修订草案')).getByRole('button', { name: '确认重排' }))
    view.unmount()

    // 用同一份存储重建 Store，相当于刷新页面
    const second = createWorkspaceStore(new LocalDemoRepository(storage))
    expect(second.getState().demo.revisions.some((r) => r.projectCode === 'NST_A_3D_B24')).toBe(true)
    expect(stageOf(second, 'MECH-01/3D_LOW')?.currentStart).toBe('2026-07-29')
    // 草案本身不落盘
    expect(second.getState().draft).toBeUndefined()
  })
})

describe('范围外追加路径', () => {
  it('判为范围外创建变更单，并只冻结受影响资产', async () => {
    const { user, store } = await renderFeedback()
    const list = screen.getByLabelText('资产级反馈项')
    await user.click(within(list).getByRole('button', { name: '新增腰部挂件' }))

    const detail = screen.getByLabelText('反馈项详情')
    await user.click(within(detail).getByRole('button', { name: '判为范围外' }))

    expect(within(screen.getByLabelText('反馈项详情')).getByText('CQ-005')).toBeInTheDocument()
    expect(stageOf(store, 'MECH-01/3D_HIGH')?.flags).toContain('WaitingChangeQuote')

    // MECH-02 不被冻结
    const mech02 = store.getState().demo.projects[0].assets[1].stages
    expect(mech02.every((stage) => !stage.flags.includes('WaitingChangeQuote'))).toBe(true)
  })

  it('同一批次里两项可以走不同路径', async () => {
    const { user, store } = await renderFeedback()
    const list = screen.getByLabelText('资产级反馈项')

    await user.click(within(list).getByRole('button', { name: '缩小肩甲比例' }))
    await user.click(screen.getByRole('button', { name: '判为范围内' }))

    await user.click(within(list).getByRole('button', { name: '新增腰部挂件' }))
    await user.click(screen.getByRole('button', { name: '判为范围外' }))

    const items = store.getState().demo.feedbackBatches[0].items
    expect(items.find((i) => i.id === 'F-017/ITEM-01')?.scope).toBe('in-scope')
    expect(items.find((i) => i.id === 'F-017/ITEM-02')?.scope).toBe('out-of-scope')
  })
})

describe('范围判定可撤销', () => {
  it('判为范围内后可以重新判定，退回待分流', async () => {
    const { user, store } = await renderFeedback()
    await user.click(screen.getByRole('button', { name: '判为范围内' }))
    await user.click(screen.getByRole('button', { name: '重新判定' }))

    const item = store.getState().demo.feedbackBatches[0].items[0]
    expect(item.scope).toBe('unclassified')
    expect(screen.getByRole('button', { name: '判为范围外' })).toBeInTheDocument()
  })

  it('撤销范围外判定时变更单与冻结一并回收', async () => {
    const { user, store } = await renderFeedback()
    const list = screen.getByLabelText('资产级反馈项')
    await user.click(within(list).getByRole('button', { name: '新增腰部挂件' }))
    await user.click(screen.getByRole('button', { name: '判为范围外' }))
    // 种子里已有 CQ-004，这里断言的是增量
    expect(store.getState().demo.changeRequests).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: '重新判定' }))
    expect(store.getState().demo.changeRequests).toHaveLength(1)
    expect(stageOf(store, 'MECH-01/3D_HIGH')?.flags).not.toContain('WaitingChangeQuote')
  })

  it('重新判定会一并丢掉基于旧判定生成的草案', async () => {
    const { user, store } = await renderFeedback()
    await user.click(screen.getByRole('button', { name: '判为范围内' }))
    await user.click(screen.getByRole('button', { name: '生成排期草案' }))
    expect(screen.getByLabelText('排期修订草案')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重新判定' }))
    expect(screen.queryByLabelText('排期修订草案')).toBeNull()
    expect(store.getState().draft).toBeUndefined()
  })

  async function confirmReplanFlow(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: '判为范围内' }))
    await user.click(screen.getByRole('button', { name: '生成排期草案' }))
    await user.click(within(screen.getByLabelText('排期修订草案')).getByRole('button', { name: '确认重排' }))
  }

  it('通知没发出去时，已确认的修订可以整个撤销', async () => {
    const { user, store } = await renderFeedback()
    await confirmReplanFlow(user)

    expect(screen.getByText(/通知还没发出去/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '撤销修订并退回待分流' }))

    // 日期回滚
    expect(stageOf(store, 'MECH-01/3D_LOW')?.currentStart).toBe('2026-07-27')
    expect(stageOf(store, 'MECH-01/3D_LOW')?.currentFinish).toBe('2026-07-29')
    // 反馈项退回待分流
    expect(store.getState().demo.feedbackBatches[0].items[0].status).toBe('NeedsClassification')
    expect(screen.getByRole('button', { name: '判为范围外' })).toBeInTheDocument()
    // 未发送的草稿一并作废
    expect(
      store.getState().demo.notificationDrafts.filter((n) => n.sourceKind === 'schedule-revision'),
    ).toHaveLength(0)
  })

  it('撤销不是删除：修订历史里仍能看到 v1 已撤销', async () => {
    const { user, store } = await renderFeedback()
    await confirmReplanFlow(user)
    await user.click(screen.getByRole('button', { name: '撤销修订并退回待分流' }))

    const revision = store.getState().demo.revisions.find((r) => r.projectCode === 'NST_A_3D_B24')
    expect(revision?.version).toBe(1)
    expect(revision?.revokedBy).toBe('Brandon')

    const nav = screen.getByRole('navigation', { name: '全局导航' })
    await user.click(within(nav).getByRole('button', { name: /项目总览/ }))
    const history = screen.getByLabelText('排期修订历史')
    expect(within(history).getByText(/由 Brandon 撤销/)).toBeInTheDocument()
  })

  it('撤销后再次确认时版本号不复用', async () => {
    const { user, store } = await renderFeedback()
    await confirmReplanFlow(user)
    await user.click(screen.getByRole('button', { name: '撤销修订并退回待分流' }))
    await confirmReplanFlow(user)

    const versions = store
      .getState()
      .demo.revisions.filter((r) => r.projectCode === 'NST_A_3D_B24')
      .map((r) => r.version)
    expect(versions).toEqual([1, 2])
  })

  it('PM 标记通知已发出后，就不能再撤销这次修订', async () => {
    const { user, store } = await renderFeedback()
    await confirmReplanFlow(user)

    const notifications = screen.getByLabelText('通知草稿')
    await user.click(
      within(notifications).getAllByRole('button', { name: '我已发出，标记为已发送' })[0],
    )

    expect(screen.queryByRole('button', { name: '撤销修订并退回待分流' })).toBeNull()
    expect(screen.getByText(/通知已被标记为发出/)).toBeInTheDocument()

    // 记录的是人工声明，不是系统投递
    const marked = store.getState().demo.notificationDrafts.find((n) => n.status === 'markedSent')
    expect(marked?.markedSentBy).toBe('Brandon')
    expect(marked?.markedSentVia).toContain('Outlook')
  })

  it('标记错了可以撤回，撤回后修订重新可撤销', async () => {
    const { user } = await renderFeedback()
    await confirmReplanFlow(user)

    const notifications = screen.getByLabelText('通知草稿')
    await user.click(
      within(notifications).getAllByRole('button', { name: '我已发出，标记为已发送' })[0],
    )
    await user.click(within(notifications).getByRole('button', { name: '标错了，撤回标记' }))

    expect(screen.getByRole('button', { name: '撤销修订并退回待分流' })).toBeInTheDocument()
  })
})

describe('草案在甘特上可见', () => {
  it('未确认草案以独立的草案条叠加，确认后消失', async () => {
    const { user } = await renderFeedback()
    await user.click(screen.getByRole('button', { name: '判为范围内' }))
    await user.click(screen.getByRole('button', { name: '生成排期草案' }))

    const nav = screen.getByRole('navigation', { name: '全局导航' })
    await user.click(within(nav).getByRole('button', { name: /项目总览/ }))

    const gantt = screen.getByLabelText('项目排期甘特')
    expect(within(gantt).getByText('未确认草案')).toBeInTheDocument()
    expect(within(gantt).getByTitle(/草案（未确认）｜07-29 — 07-31/)).toBeInTheDocument()
  })
})

/**
 * 第三条路：无需修改。
 *
 * 验收时指出：反馈判定完只有范围内/范围外两条路。
 * 可现实里一批反馈常夹着「这个可以」——逼 PM 二选一，
 * 等于往正式数据里塞一条假的返修或一张假的变更单。
 */
describe('判为无需修改', () => {
  it('分流时给出三条路，不是两条', async () => {
    await renderFeedback()
    const detail = screen.getByLabelText('反馈项详情')

    expect(within(detail).getByRole('button', { name: /无需修改/ })).toBeInTheDocument()
    expect(within(detail).getByRole('button', { name: '判为范围内' })).toBeInTheDocument()
    expect(within(detail).getByRole('button', { name: '判为范围外' })).toBeInTheDocument()
  })

  it('判完当场了结，不生成变更单也不动排期', async () => {
    const { user, store } = await renderFeedback()
    const detail = screen.getByLabelText('反馈项详情')
    const changeRequests = store.getState().demo.changeRequests.length

    await user.click(within(detail).getByRole('button', { name: /无需修改/ }))

    const item = store.getState().demo.feedbackBatches[0].items[0]
    expect(item.status).toBe('Closed')
    expect(item.scope).toBe('no-change')
    expect(store.getState().demo.changeRequests).toHaveLength(changeRequests)
    expect(stageOf(store, 'MECH-01/3D_LOW')?.currentStart).toBe('2026-07-27')
  })

  it('判错了能退回待分流', async () => {
    const { user, store } = await renderFeedback()
    const detail = screen.getByLabelText('反馈项详情')

    await user.click(within(detail).getByRole('button', { name: /无需修改/ }))
    await user.click(within(detail).getByRole('button', { name: '重新判定' }))

    expect(store.getState().demo.feedbackBatches[0].items[0].status).toBe('NeedsClassification')
  })
})

describe('阶段上的反馈全部了结之后', () => {
  it('还有没了结的，说清还剩几条', async () => {
    await renderFeedback()

    expect(screen.getByText(/条反馈没了结/)).toBeInTheDocument()
  })

  it('全部了结后指向客户验收——那才是流转下一阶段的动作', async () => {
    const { user, store } = await renderFeedback()
    const stageId = store.getState().demo.feedbackBatches[0].items[0].stageId
    const list = screen.getByLabelText('资产级反馈项')

    for (const item of store.getState().demo.feedbackBatches.flatMap((batch) => batch.items)) {
      if (item.stageId !== stageId || item.status !== 'NeedsClassification') continue
      await user.click(within(list).getByText(item.title))
      await user.click(
        within(screen.getByLabelText('反馈项详情')).getByRole('button', { name: /无需修改/ }),
      )
    }

    expect(screen.getByText(/已全部了结/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /客户已验收/ })).toBeInTheDocument()
  })
})

/**
 * 「还剩 N 条没了结」不能是死路。
 *
 * 反馈项没有「手工勾完成」这个动作：返修中要靠阶段推进「已提交客户」，
 * 已重提要靠「客户已验收」。提示必须说清卡在哪、去哪办。
 */
describe('没了结的反馈要指出下一站', () => {
  it('待分流的卡点指回本页', async () => {
    await renderFeedback()

    const blockers = screen.getByRole('list', { name: '反馈了结卡点' })
    expect(within(blockers).getByText(/待分流/)).toBeInTheDocument()
    expect(within(blockers).getByText(/就在这一页·判定范围/)).toBeInTheDocument()
  })

  it('确认排期修订后卡点变成返修中，并给出去阶段推进的入口', async () => {
    const { user } = await renderFeedback()
    const detail = screen.getByLabelText('反馈项详情')

    await user.click(within(detail).getByRole('button', { name: '判为范围内' }))
    await user.click(screen.getByRole('button', { name: '生成排期草案' }))
    await user.click(
      within(screen.getByLabelText('排期修订草案')).getByRole('button', { name: '确认重排' }),
    )

    const blockers = screen.getByRole('list', { name: '反馈了结卡点' })
    expect(within(blockers).getByText(/返修中/)).toBeInTheDocument()
    expect(within(blockers).getByText(/阶段推进「已提交客户」/)).toBeInTheDocument()
  })
})

/**
 * 反馈卡片上要能把这条反馈推下去。
 *
 * 判为范围内、确认排期修订之后，反馈项停在「返修中」。PM 想说一句
 * 「东西已经交给客户了，等二次反馈」，却得跳去项目总览找同一个阶段——
 * 一条反馈的处理被切成两页。
 */
describe('在反馈卡片上推进阶段', () => {
  async function toRework() {
    const handle = await renderFeedback()
    const detail = screen.getByLabelText('反馈项详情')
    await handle.user.click(within(detail).getByRole('button', { name: '判为范围内' }))
    await handle.user.click(screen.getByRole('button', { name: '生成排期草案' }))
    await handle.user.click(
      within(screen.getByLabelText('排期修订草案')).getByRole('button', { name: '确认重排' }),
    )
    return handle
  }

  it('返修中就能在本页交 PM、提交客户，不用跳页', async () => {
    const { user, store } = await toRework()
    const flow = screen.getByLabelText('推进这条反馈所在阶段')

    await user.click(within(flow).getByRole('button', { name: '已交 PM' }))
    await user.click(
      within(screen.getByLabelText('推进这条反馈所在阶段')).getByRole('button', {
        name: '已提交客户',
      }),
    )

    expect(stageOf(store, 'MECH-01/3D_HIGH')?.status).toBe('AwaitingClient')
    // 提交客户 = 已重提，等客户二次反馈
    expect(
      store.getState().demo.feedbackBatches.flatMap((b) => b.items).find((i) => i.id === 'F-017/ITEM-01')
        ?.status,
    ).toBe('Resubmitted')
  })

  it('等客户时两个出口都在：验收通过，或客户又要改', async () => {
    const { user } = await toRework()
    await user.click(
      within(screen.getByLabelText('推进这条反馈所在阶段')).getByRole('button', { name: '已交 PM' }),
    )
    await user.click(
      within(screen.getByLabelText('推进这条反馈所在阶段')).getByRole('button', {
        name: '已提交客户',
      }),
    )

    const flow = screen.getByLabelText('推进这条反馈所在阶段')
    expect(within(flow).getByRole('button', { name: '客户已验收' })).toBeInTheDocument()
    expect(within(flow).getByRole('button', { name: '客户要返修' })).toBeInTheDocument()
  })

  it('二次反馈当场记下，变成同一阶段上的新待分流项', async () => {
    const { user, store } = await toRework()
    await user.click(
      within(screen.getByLabelText('推进这条反馈所在阶段')).getByRole('button', { name: '已交 PM' }),
    )
    await user.click(
      within(screen.getByLabelText('推进这条反馈所在阶段')).getByRole('button', {
        name: '已提交客户',
      }),
    )
    await user.click(
      within(screen.getByLabelText('推进这条反馈所在阶段')).getByRole('button', {
        name: '客户要返修',
      }),
    )
    await user.type(screen.getByLabelText('客户原话'), '肩甲还要再收一点')
    await user.click(screen.getByRole('button', { name: '记下并去分流' }))

    const fresh = store
      .getState()
      .demo.feedbackBatches.flatMap((batch) => batch.items)
      .filter((item) => item.stageId === 'MECH-01/3D_HIGH' && item.status === 'NeedsClassification')
    expect(fresh.some((item) => item.originalText === '肩甲还要再收一点')).toBe(true)
  })
})

/**
 * 「现在在等谁」看板。
 *
 * 反馈中心的主视图：资产提交后就进这条循环，卡片在三栏之间来回走，
 * 客户验收通过才离场。看板是投影，点动作要真的推动底层状态。
 */
describe('在等谁看板', () => {
  it('三栏都在，等我处理排在最左', async () => {
    await renderFeedback()
    const board = screen.getByLabelText('在等谁看板')

    expect(within(board).getByLabelText('等我处理')).toBeInTheDocument()
    expect(within(board).getByLabelText('等团队提交')).toBeInTheDocument()
    expect(within(board).getByLabelText('等客户反馈')).toBeInTheDocument()
  })

  it('待分流的卡片点「去判范围」会选中那条反馈', async () => {
    const { user, store } = await renderFeedback()
    store.selectFeedbackItem('F-017/ITEM-04')

    await user.click(
      within(screen.getByLabelText('等我处理')).getByRole('button', { name: '去判范围' }),
    )

    expect(store.getState().selectedFeedbackItemId).toBe('F-017/ITEM-01')
  })

  it('标记反馈已发给团队后，卡片从「等我」挪到「等团队」', async () => {
    const { user, store } = await renderFeedback()
    const detail = screen.getByLabelText('反馈项详情')

    // 先把这个阶段上的反馈判完，走到「返修通知待发出」
    await user.click(within(detail).getByRole('button', { name: '判为范围内' }))
    await user.click(screen.getByRole('button', { name: '生成排期草案' }))
    await user.click(
      within(screen.getByLabelText('排期修订草案')).getByRole('button', { name: '确认重排' }),
    )
    for (const title of ['新增腰部挂件', '胸甲纹理走向调整']) {
      await user.click(within(screen.getByLabelText('资产级反馈项')).getByText(title))
      await user.click(
        within(screen.getByLabelText('反馈项详情')).getByRole('button', { name: /无需修改/ }),
      )
    }

    const me = screen.getByLabelText('等我处理')
    expect(within(me).getByText('返修通知待发出')).toBeInTheDocument()

    await user.click(within(me).getByRole('button', { name: '反馈已发给团队' }))

    // 组长和艺术总监两封都要标记，只标一封卡片会赖着不走
    expect(
      store.getState().demo.notificationDrafts.filter((n) => n.sourceKind === 'schedule-revision'),
    ).toSatisfy((drafts: { status: string }[]) => drafts.every((d) => d.status === 'markedSent'))
    expect(within(screen.getByLabelText('等团队提交')).getByText('团队返修中')).toBeInTheDocument()
    expect(within(screen.getByLabelText('等我处理')).queryByText('返修通知待发出')).toBeNull()
  })

  it('全部资产验收的项目在看板底部指向结项中心', async () => {
    await renderFeedback()
    const board = screen.getByLabelText('在等谁看板')

    expect(within(board).getByText(/全部资产已验收/)).toBeInTheDocument()
    expect(within(board).getByRole('button', { name: '去结项中心' })).toBeInTheDocument()
  })
})
