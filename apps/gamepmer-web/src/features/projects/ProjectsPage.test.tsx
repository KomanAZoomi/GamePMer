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
