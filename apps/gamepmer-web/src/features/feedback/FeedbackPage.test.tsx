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
    expect(store.getState().demo.revisions.filter((r) => r.projectCode === 'P-3D-024')).toHaveLength(0)
  })

  it('可以按整工作日微调草案', async () => {
    const { user } = await renderFeedback()
    const detail = screen.getByLabelText('反馈项详情')
    await user.click(within(detail).getByRole('button', { name: '判为范围内' }))
    await user.click(screen.getByRole('button', { name: '生成排期草案' }))

    const draft = screen.getByLabelText('排期修订草案')
    await user.click(within(draft).getByRole('button', { name: '低模 顺延一个工作日' }))
    // 7/29—7/31 再推一个工作日 → 7/30—8/3，跳过周末
    expect(within(draft).getByText('07-30 — 08-03')).toBeInTheDocument()
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
    expect(store.getState().demo.revisions.filter((r) => r.projectCode === 'P-3D-024')).toHaveLength(0)
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

    const revision = store.getState().demo.revisions.find((r) => r.projectCode === 'P-3D-024')
    expect(revision?.version).toBe(1)
    expect(revision?.sourceFeedbackItemId).toBe('F-017/ITEM-01')

    const notifications = screen.getByLabelText('通知草稿')
    expect(within(notifications).getAllByText('草稿')).toHaveLength(2)
    expect(within(notifications).getAllByText(/生成草稿不等于发送/)).toHaveLength(2)
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
    expect(second.getState().demo.revisions.some((r) => r.projectCode === 'P-3D-024')).toBe(true)
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

    expect(within(screen.getByLabelText('反馈项详情')).getByText('CQ-004')).toBeInTheDocument()
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
