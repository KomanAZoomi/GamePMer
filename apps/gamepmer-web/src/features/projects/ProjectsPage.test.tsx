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

async function renderProjects() {
  const store = createWorkspaceStore(new LocalDemoRepository(memoryStorage()))
  const user = userEvent.setup()
  const result = render(<App store={store} />)
  await user.click(screen.getByRole('button', { name: /项目总览/ }))
  return { user, store, ...result }
}

beforeEach(() => {
  window.location.hash = ''
})

describe('项目详情甘特', () => {
  it('资产按分组展开到每个可验收阶段，不是一根项目进度条', async () => {
    await renderProjects()
    const gantt = screen.getByLabelText('项目排期甘特')
    expect(within(gantt).getByText('MECH-01 · 主角机甲')).toBeInTheDocument()
    expect(within(gantt).getByText('MECH-02 · 轻型载具')).toBeInTheDocument()
    // 3D PBR 六个阶段逐个成行
    for (const name of ['中模', '高模', '低模', '烘焙', '贴图', 'LOD']) {
      expect(within(gantt).getAllByText(name).length).toBeGreaterThan(0)
    }
  })

  it('时间轴逐日展开，标出今天、周末与公司休息日', async () => {
    await renderProjects()
    const gantt = screen.getByLabelText('项目排期甘特')
    expect(within(gantt).getByText('今天')).toBeInTheDocument()
    expect(within(gantt).getByTitle('2026-08-05 公司休息日')).toBeInTheDocument()
    expect(within(gantt).getByTitle('2026-08-01')).toBeInTheDocument()
  })

  it('偏离基准的阶段同时画出基准条与当前条', async () => {
    const { user } = await renderProjects()
    await user.click(screen.getByRole('button', { name: /HLC_B_2D_B18/ }))
    const gantt = screen.getByLabelText('项目排期甘特')
    // CHAR-08 完成稿因客户等待顺延，基准与当前并存
    expect(within(gantt).getByTitle(/完成稿 · 基准｜07-27 — 07-29/)).toBeInTheDocument()
    expect(within(gantt).getByTitle(/完成稿 · 完成稿｜07-28 — 07-30/)).toBeInTheDocument()
  })

  it('未完成的实际区间延伸到今天并标为开放', async () => {
    await renderProjects()
    const gantt = screen.getByLabelText('项目排期甘特')
    // MECH-02 中模 7/27 开工尚未完成
    const actual = within(gantt).getByTitle(/中模 · 实际｜07-27 — 07-27/)
    expect(actual.className).toContain('is-open')
  })

  it('等待客户区间独立成条，不与实际制作混在一起', async () => {
    await renderProjects()
    const gantt = screen.getByLabelText('项目排期甘特')
    expect(within(gantt).getByTitle(/高模 · 等待客户｜07-24 — 07-27/)).toBeInTheDocument()
  })

  it('切换时间轴粒度', async () => {
    const { user } = await renderProjects()
    const gantt = screen.getByLabelText('项目排期甘特')
    await user.click(within(gantt).getByRole('button', { name: '月' }))
    expect(within(gantt).getByText('2026 年 7 月')).toBeInTheDocument()
    expect(within(gantt).getByText('2026 年 8 月')).toBeInTheDocument()
  })
})

describe('阶段详情', () => {
  it('五组日期同屏可比，基准与当前分开显示', async () => {
    const { user } = await renderProjects()
    const gantt = screen.getByLabelText('项目排期甘特')
    await user.click(within(gantt).getByRole('button', { name: /低模.*Chen/ }))

    const inspector = screen.getByLabelText('阶段详情')
    expect(within(inspector).getByText('基准排期')).toBeInTheDocument()
    expect(within(inspector).getByText('当前排期')).toBeInTheDocument()
    expect(within(inspector).getByText('实际开工')).toBeInTheDocument()
    expect(within(inspector).getByText('提交客户')).toBeInTheDocument()
    expect(within(inspector).getByText('客户确认')).toBeInTheDocument()
  })

  it('前置未验收时说明开工日期只是计划值', async () => {
    const { user } = await renderProjects()
    const gantt = screen.getByLabelText('项目排期甘特')
    await user.click(within(gantt).getByRole('button', { name: /低模.*Chen/ }))

    const inspector = screen.getByLabelText('阶段详情')
    expect(within(inspector).getByText('前置未完成')).toBeInTheDocument()
    expect(within(inspector).getByText(/高模（等待客户）/)).toBeInTheDocument()
  })

  it('已修订的阶段显示偏移原因与工作日增量', async () => {
    const { user } = await renderProjects()
    await user.click(screen.getByRole('button', { name: /HLC_B_2D_B18/ }))
    const gantt = screen.getByLabelText('项目排期甘特')
    await user.click(within(gantt).getByRole('button', { name: /完成稿.*Yuki/ }))

    const inspector = screen.getByLabelText('阶段详情')
    expect(within(inspector).getByText('偏移原因')).toBeInTheDocument()
    expect(within(inspector).getByText(/客户等待/)).toBeInTheDocument()
    expect(within(inspector).getByText(/顺延 1 个工作日/)).toBeInTheDocument()
  })
})

describe('修订历史', () => {
  it('已确认修订可查看版本与新旧日期', async () => {
    const { user } = await renderProjects()
    await user.click(screen.getByRole('button', { name: /HLC_B_2D_B18/ }))

    const history = screen.getByLabelText('排期修订历史')
    expect(within(history).getByText('v1')).toBeInTheDocument()
    expect(within(history).getByText(/07-27 — 07-29 → 07-28 — 07-30/)).toBeInTheDocument()
  })

  it('没有修订的项目说明修订从哪里来，而不是显示空白', async () => {
    await renderProjects()
    const history = screen.getByLabelText('排期修订历史')
    expect(within(history).getByText(/尚无已确认的排期修订/)).toBeInTheDocument()
  })
})

/**
 * 阶段推进。
 *
 * 验收提问：反馈分流之后高模怎么流转到低模？当时答案是「流转不了」——
 * 六个主状态里只有一条迁移能走，开工、提交客户、客户验收根本不存在。
 */
describe('在阶段详情里推进阶段', () => {
  it('未开始的第一个阶段给「标记开工」，点完状态变制作中', async () => {
    const { user, store } = await renderProjects()
    await user.click(screen.getByRole('button', { name: /NST_C_3D_B31/ }))

    const gantt = screen.getByLabelText('项目排期甘特')
    // PROP-02 的中模是资产第一个阶段，没有前置
    await user.click(within(gantt).getAllByRole('button', { name: /中模/ })[1])

    const inspector = screen.getByLabelText('阶段详情')
    await user.click(within(inspector).getByRole('button', { name: '标记开工' }))

    const stage = store
      .getState()
      .demo.projects.flatMap((p) => p.assets)
      .flatMap((a) => a.stages)
      .find((s) => s.id === 'PROP-02/3D_MID')!
    expect(stage.status).toBe('InProduction')
    expect(stage.actualStart).toBeTruthy()
  })

  /** 动不了时不给一个点了没反应的按钮，而是把原因写出来 */
  it('前置没客户验收时不给开工按钮，改为逐条说明原因', async () => {
    const { user } = await renderProjects()
    const gantt = screen.getByLabelText('项目排期甘特')
    // MECH-01 低模：前置高模还在等待客户
    await user.click(within(gantt).getByRole('button', { name: /低模.*Chen/ }))

    const inspector = screen.getByLabelText('阶段详情')
    expect(within(inspector).queryByRole('button', { name: '标记开工' })).toBeNull()
    expect(within(inspector).getByText(/还没客户验收/)).toBeInTheDocument()
  })

  it('推进只写实际日期，计划与基准一个字节都没动', async () => {
    const { user, store } = await renderProjects()
    await user.click(screen.getByRole('button', { name: /NST_C_3D_B31/ }))

    const plan = () =>
      JSON.stringify(
        store
          .getState()
          .demo.projects.flatMap((p) => p.assets)
          .flatMap((a) => a.stages)
          .map((s) => [s.id, s.baselineStart, s.baselineFinish, s.currentStart, s.currentFinish]),
      )
    const before = plan()

    const gantt = screen.getByLabelText('项目排期甘特')
    await user.click(within(gantt).getAllByRole('button', { name: /中模/ })[1])
    await user.click(
      within(screen.getByLabelText('阶段详情')).getByRole('button', { name: '标记开工' }),
    )

    expect(plan()).toBe(before)
  })

  it('已验收的阶段没有推进区，它是终态', async () => {
    const { user } = await renderProjects()
    const gantt = screen.getByLabelText('项目排期甘特')
    await user.click(within(gantt).getAllByRole('button', { name: /中模/ })[0])

    const inspector = screen.getByLabelText('阶段详情')
    expect(within(inspector).queryByText('推进这个阶段')).toBeNull()
  })
})
