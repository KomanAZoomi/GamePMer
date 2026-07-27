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

async function renderSchedule() {
  const store = createWorkspaceStore(new LocalDemoRepository(memoryStorage()))
  const user = userEvent.setup()
  const result = render(<App store={store} />)
  // 首页时间线也有一个「打开排期管理」按钮，这里限定在全局导航内
  const nav = screen.getByRole('navigation', { name: '全局导航' })
  await user.click(within(nav).getByRole('button', { name: /排期管理/ }))
  return { user, store, ...result }
}

beforeEach(() => {
  window.location.hash = ''
})

describe('组合排期', () => {
  it('按制作组分组，同组跨项目的阶段排在一起', async () => {
    await renderSchedule()
    const combo = screen.getByLabelText('组合排期')
    expect(within(combo).getByText(/3D 角色 A 组 · Leo/)).toBeInTheDocument()

    // 3D-A 组同时承接 P-3D-024 和 P-3D-031
    const rows = within(combo).getAllByRole('button', { name: /MECH-01|PROP-03/ })
    expect(rows.length).toBeGreaterThanOrEqual(2)
  })

  it('满载或超载的周在时间轴上有区间标记', async () => {
    await renderSchedule()
    const combo = screen.getByLabelText('组合排期')
    expect(within(combo).getByTitle('3D 角色 A 组 2026-08-03 当周 6/6 人天')).toBeInTheDocument()
  })
})

describe('团队档期', () => {
  it('周 × 制作组矩阵给出可用、已排与余量', async () => {
    const { user } = await renderSchedule()
    await user.click(screen.getByRole('tab', { name: '团队档期' }))

    const capacity = screen.getByLabelText('团队档期')
    const thisWeek = within(capacity).getByRole('button', {
      name: '3D 角色 A 组 2026-07-27 当周占用明细',
    })
    expect(within(thisWeek).getByText('7 / 7.5')).toBeInTheDocument()
    expect(within(thisWeek).getByText(/余 0.5 人天/)).toBeInTheDocument()
  })

  it('公司休息日让该周可用人天变少，并标出工作日数', async () => {
    const { user } = await renderSchedule()
    await user.click(screen.getByRole('tab', { name: '团队档期' }))

    const cell = screen.getByRole('button', { name: '3D 角色 A 组 2026-08-03 当周占用明细' })
    expect(within(cell).getByText('6 / 6')).toBeInTheDocument()
    expect(within(cell).getByText(/满载 · 无缓冲 · 4 个工作日/)).toBeInTheDocument()
  })

  it('点开某一周能看到超载来自哪个项目哪个阶段', async () => {
    const { user } = await renderSchedule()
    await user.click(screen.getByRole('tab', { name: '团队档期' }))
    await user.click(screen.getByRole('button', { name: '3D 角色 A 组 2026-07-27 当周占用明细' }))

    const capacity = screen.getByLabelText('团队档期')
    expect(within(capacity).getByText('MECH-01 · 低模')).toBeInTheDocument()
    expect(within(capacity).getByText('PROP-03 · 中模')).toBeInTheDocument()
    expect(within(capacity).getByText(/不记录具体制作人员/)).toBeInTheDocument()
  })
})

describe('节点清单', () => {
  it('计划开工、阶段交付、客户反馈分开成行', async () => {
    const { user } = await renderSchedule()
    await user.click(screen.getByRole('tab', { name: '节点清单' }))

    const list = screen.getByLabelText('节点清单')
    expect(within(list).getAllByText('计划开工').length).toBeGreaterThan(0)
    expect(within(list).getAllByText('阶段交付').length).toBeGreaterThan(0)
    expect(within(list).getByText('客户反馈')).toBeInTheDocument()
    expect(within(list).getByText('3 项待分流')).toBeInTheDocument()
  })
})

describe('冲突检查', () => {
  it('区分阻断与预警，正常排期不被扣阻断的帽子', async () => {
    await renderSchedule()
    expect(screen.getByText(/0 项阻断/)).toBeInTheDocument()
    const panel = screen.getByLabelText('冲突检查')
    expect(within(panel).getByText('前置未获验收')).toBeInTheDocument()
    expect(within(panel).getByText('制作组满载无缓冲')).toBeInTheDocument()
  })

  it('待分流反馈的容量影响只作提示，不计入已排人天', async () => {
    await renderSchedule()
    const panel = screen.getByLabelText('冲突检查')
    expect(within(panel).getByText('待分流反馈可能超出容量')).toBeInTheDocument()
    expect(within(panel).getByText(/范围判定完成前不计入已排人天/)).toBeInTheDocument()
  })
})

describe('批量录入', () => {
  async function openEntry() {
    const context = await renderSchedule()
    const combo = screen.getByLabelText('组合排期')
    await context.user.click(within(combo).getAllByRole('button', { name: /MECH-01 低模/ })[0])
    return context
  }

  it('每个可验收阶段一行，不是几个日期文本框', async () => {
    await openEntry()
    const entry = screen.getByLabelText('批量录入计划')
    // 阶段名同时出现在「阶段」列和后一行的「依赖」列，这里只要求每个阶段都在
    for (const name of ['中模', '高模', '低模', '烘焙', '贴图', 'LOD']) {
      expect(within(entry).getAllByText(name).length).toBeGreaterThan(0)
    }
    expect(within(entry).getByLabelText('低模 制作组')).toBeInTheDocument()
    expect(within(entry).getByLabelText('低模 预估人天')).toBeInTheDocument()
    expect(within(entry).getByLabelText('低模 开始日')).toBeInTheDocument()
  })

  it('已验收的阶段锁定不可编辑', async () => {
    await openEntry()
    const entry = screen.getByLabelText('批量录入计划')
    expect(within(entry).getByLabelText('中模 开始日')).toBeDisabled()
    expect(within(entry).getByText('已验收 · 锁定')).toBeInTheDocument()
  })

  it('改成非工作日立刻标为阻断，并给出最近的工作日', async () => {
    const { user } = await openEntry()
    const entry = screen.getByLabelText('批量录入计划')
    await user.clear(within(entry).getByLabelText('低模 开始日'))
    await user.type(within(entry).getByLabelText('低模 开始日'), '2026-08-01')

    expect(within(entry).getByText(/日期落在非工作日/)).toBeInTheDocument()
    expect(within(entry).getByText(/2026-08-03/)).toBeInTheDocument()
    expect(within(entry).getByRole('button', { name: '确认写入（被阻断）' })).toBeDisabled()
  })

  it('顺延后续阶段一键把依赖链推下去，而不是逐行手动挪', async () => {
    const { user } = await openEntry()
    const entry = screen.getByLabelText('批量录入计划')

    await user.clear(within(entry).getByLabelText('低模 结束日'))
    await user.type(within(entry).getByLabelText('低模 结束日'), '2026-07-31')
    // 此时烘焙 7/30 与低模重叠，属阻断
    expect(within(entry).getByRole('button', { name: '确认写入（被阻断）' })).toBeDisabled()

    await user.click(within(entry).getByRole('button', { name: '顺延后续阶段' }))
    expect(within(entry).getByLabelText('烘焙 开始日')).toHaveValue('2026-08-03')
    expect(within(entry).getByRole('button', { name: '确认写入' })).toBeEnabled()
  })

  it('确认前显示这次改动会把制作组推到什么程度', async () => {
    const { user } = await openEntry()
    const entry = screen.getByLabelText('批量录入计划')
    await user.clear(within(entry).getByLabelText('低模 预估人天'))
    await user.type(within(entry).getByLabelText('低模 预估人天'), '6')

    // 每行的制作组下拉里也有同名选项，这里断言的是底部影响摘要那句
    expect(within(entry).getByText(/本周已排/)).toBeInTheDocument()
    expect(within(entry).getAllByText('3D 角色 A 组').length).toBeGreaterThan(1)
  })

  it('确认写入后生成修订、保留基准，草案关闭', async () => {
    const { user, store } = await openEntry()
    const entry = screen.getByLabelText('批量录入计划')

    await user.clear(within(entry).getByLabelText('低模 结束日'))
    await user.type(within(entry).getByLabelText('低模 结束日'), '2026-07-31')
    await user.click(within(entry).getByRole('button', { name: '顺延后续阶段' }))
    await user.click(within(entry).getByRole('button', { name: '确认写入' }))

    expect(screen.queryByLabelText('批量录入计划')).toBeNull()

    const stage = store
      .getState()
      .demo.projects[0].assets[0].stages.find((item) => item.id === 'MECH-01/3D_LOW')
    expect(stage?.currentFinish).toBe('2026-07-31')
    expect(stage?.baselineFinish).toBe('2026-07-29')
    expect(store.getState().demo.revisions.some((item) => item.projectCode === 'P-3D-024')).toBe(true)
  })

  it('放弃草案不改变正式计划', async () => {
    const { user, store } = await openEntry()
    const entry = screen.getByLabelText('批量录入计划')

    await user.clear(within(entry).getByLabelText('低模 结束日'))
    await user.type(within(entry).getByLabelText('低模 结束日'), '2026-07-31')
    await user.click(within(entry).getByRole('button', { name: '放弃草案' }))

    const stage = store
      .getState()
      .demo.projects[0].assets[0].stages.find((item) => item.id === 'MECH-01/3D_LOW')
    expect(stage?.currentFinish).toBe('2026-07-29')
    expect(store.getState().demo.revisions.some((item) => item.projectCode === 'P-3D-024')).toBe(false)
  })
})
