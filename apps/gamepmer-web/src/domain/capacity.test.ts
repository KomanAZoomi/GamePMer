import { describe, expect, it } from 'vitest'
import { createDemoState } from '../data/seed'
import { DEMO_TODAY } from './clock'
import { capacityBreakdown, capacityMatrix, weekStartsFrom, weeklyLoad } from './capacity'

const state = createDemoState()
const calendar = state.calendars[0]

describe('weeklyLoad', () => {
  it('可用人天 = 每日容量 × 该周工作日数', () => {
    // 3D-A 组 1.5 人天/日，7/27 当周 5 个工作日
    const load = weeklyLoad(state, 'grp-3d-a', '2026-07-27', calendar)
    expect(load.available).toBe(7.5)
  })

  it('公司休息日减少该周可用人天', () => {
    // 8/3 当周有 8/5 休息日，只剩 4 个工作日
    const load = weeklyLoad(state, 'grp-3d-a', '2026-08-03', calendar)
    expect(load.available).toBe(6)
  })

  it('阶段人天按其区间内的工作日均摊，只计落在本周的部分', () => {
    // MECH-01 贴图 3 人天 / 7-31—8-04（工作日 7/31、8/3、8/4）→ 每个工作日 1 人天
    // 7/27 当周只包含 7/31，因此只计 1
    const breakdown = capacityBreakdown(state, 'grp-3d-a', '2026-07-27', calendar)
    const texture = breakdown.find((item) => item.stageId === 'MECH-01/3D_TEXTURE')
    expect(texture?.personDays).toBe(1)
  })

  it('已排人天是跨项目累加，不是单个项目的账', () => {
    const load = weeklyLoad(state, 'grp-3d-a', '2026-07-27', calendar)
    // MECH-01 低模 3 + 烘焙 1 + 贴图 1（跨周折算）+ PROP-03 中模 2
    expect(load.scheduled).toBe(7)
    const breakdown = capacityBreakdown(state, 'grp-3d-a', '2026-07-27', calendar)
    expect(new Set(breakdown.map((item) => item.projectCode)).size).toBe(2)
  })

  it('满载但未超出时不算超载', () => {
    const load = weeklyLoad(state, 'grp-3d-a', '2026-08-03', calendar)
    expect(load.scheduled).toBe(6)
    expect(load.available).toBe(6)
    expect(load.overBy).toBe(0)
    expect(load.utilization).toBe(1)
  })

  it('超出可用人天时给出差额', () => {
    const load = weeklyLoad(state, 'grp-3d-a', '2026-08-03', calendar, [
      { groupId: 'grp-3d-a', personDays: 2, label: '未确认返修' },
    ])
    expect(load.scheduled).toBe(8)
    expect(load.overBy).toBe(2)
  })

  it('等待客户的阶段不消耗制作人天', () => {
    // MECH-01 高模已提交客户，7/23—7/24 落在 7/20 当周
    const breakdown = capacityBreakdown(state, 'grp-3d-a', '2026-07-20', calendar)
    expect(breakdown.some((item) => item.stageId === 'MECH-01/3D_HIGH')).toBe(false)
  })

  it('已验收的阶段不再占用未来档期', () => {
    const breakdown = capacityBreakdown(state, 'grp-3d-a', '2026-07-20', calendar)
    expect(breakdown.some((item) => item.stageId === 'MECH-01/3D_MID')).toBe(false)
  })
})

describe('capacityMatrix', () => {
  const matrix = capacityMatrix(state, weekStartsFrom(DEMO_TODAY, 4, -1), calendar)

  it('覆盖全部制作组', () => {
    expect(matrix.map((row) => row.group.id)).toEqual(['grp-3d-a', 'grp-3d-b', 'grp-2d-a'])
  })

  it('每组给出请求的周数', () => {
    expect(matrix[0].weeks).toHaveLength(4)
    expect(matrix[0].weeks[0].weekStart).toBe('2026-07-20')
  })

  it('容量属于制作组而不是项目——同一组的负载来自多个项目', () => {
    const thisWeek = matrix[0].weeks.find((week) => week.weekStart === '2026-07-27')
    expect(thisWeek?.scheduled).toBe(7)
    expect(thisWeek?.available).toBe(7.5)
  })
})

describe('weekStartsFrom', () => {
  it('从今天所在周往前回溯，返回连续的周一', () => {
    expect(weekStartsFrom('2026-07-27', 3, -1)).toEqual(['2026-07-20', '2026-07-27', '2026-08-03'])
  })
})
