import { describe, expect, it } from 'vitest'
import { createDemoState } from '../data/seed'
import { DEMO_TODAY } from './clock'
import { checkSchedule, checkStageRows, type StageRow } from './conflicts'

const state = createDemoState()
const calendar = state.calendars[0]

describe('checkSchedule（对已确认排期的静态检查）', () => {
  const conflicts = checkSchedule(state, DEMO_TODAY)

  it('种子排期本身没有数据错误，因此没有阻断项', () => {
    // 阻断项留给录入时的错误数据，不是给正常排期扣帽子
    expect(conflicts.filter((item) => item.severity === 'blocking')).toHaveLength(0)
  })

  it('前置未获验收但计划已到开工日时给出预警，并说明是哪个前置', () => {
    const conflict = conflicts.find((item) => item.kind === 'dependency-not-approved')
    expect(conflict?.targetId).toBe('MECH-01/3D_LOW')
    expect(conflict?.detail).toContain('高模')
    expect(conflict?.severity).toBe('warning')
  })

  it('制作组满载且没有缓冲时预警', () => {
    const conflict = conflicts.find(
      (item) => item.kind === 'group-overload' && item.targetId === 'grp-3d-a',
    )
    expect(conflict).toBeDefined()
    expect(conflict?.detail).toContain('8-03')
  })

  it('待分流反馈会吃掉容量时提前预警，但不把它算进已排人天', () => {
    const conflict = conflicts.find((item) => item.kind === 'pending-feedback-capacity')
    expect(conflict?.detail).toContain('F-017')
    expect(conflict?.detail).toContain('尚未分流')
  })
})

describe('checkStageRows（对录入草案的逐行校验）', () => {
  function row(overrides: Partial<StageRow> = {}): StageRow {
    return {
      id: 'MECH-01/3D_LOW',
      assetId: 'MECH-01',
      stageName: '低模',
      productionGroupId: 'grp-3d-a',
      ownerName: 'Chen',
      estimatedPersonDays: 3,
      start: '2026-07-27',
      finish: '2026-07-29',
      dependsOn: [],
      requiresClientApproval: true,
      ...overrides,
    }
  }

  it('干净的一行没有任何问题', () => {
    expect(checkStageRows([row()], calendar)).toHaveLength(0)
  })

  it('结束日早于开始日是阻断', () => {
    const found = checkStageRows([row({ start: '2026-07-29', finish: '2026-07-27' })], calendar)
    expect(found[0].kind).toBe('date-order')
    expect(found[0].severity).toBe('blocking')
  })

  it('开始日落在周末是阻断，并给出最近的有效工作日', () => {
    const found = checkStageRows([row({ start: '2026-08-01', finish: '2026-08-04' })], calendar)
    const conflict = found.find((item) => item.kind === 'non-workday')
    expect(conflict?.severity).toBe('blocking')
    expect(conflict?.detail).toContain('2026-08-03')
  })

  it('日期落在公司休息日同样是阻断', () => {
    const found = checkStageRows([row({ start: '2026-08-05', finish: '2026-08-06' })], calendar)
    expect(found.some((item) => item.kind === 'non-workday')).toBe(true)
  })

  it('预估人天多于区间工作日时预警，提示需要并行', () => {
    const found = checkStageRows([row({ estimatedPersonDays: 6 })], calendar)
    const conflict = found.find((item) => item.kind === 'person-days-mismatch')
    expect(conflict?.severity).toBe('warning')
    expect(conflict?.detail).toContain('3 个工作日')
  })

  it('同一资产的两个阶段区间重叠是阻断', () => {
    const found = checkStageRows(
      [
        row({ id: 'MECH-01/3D_LOW', stageName: '低模', start: '2026-07-27', finish: '2026-07-30' }),
        row({ id: 'MECH-01/3D_BAKE', stageName: '烘焙', start: '2026-07-29', finish: '2026-07-31' }),
      ],
      calendar,
    )
    const conflict = found.find((item) => item.kind === 'stage-overlap')
    expect(conflict?.severity).toBe('blocking')
    expect(conflict?.detail).toContain('烘焙')
  })

  it('依赖的阶段排在自己之后是阻断', () => {
    const found = checkStageRows(
      [
        row({ id: 'MECH-01/3D_LOW', stageName: '低模', start: '2026-07-27', finish: '2026-07-29' }),
        row({
          id: 'MECH-01/3D_BAKE',
          stageName: '烘焙',
          start: '2026-07-28',
          finish: '2026-07-28',
          dependsOn: ['MECH-01/3D_LOW'],
        }),
      ],
      calendar,
    )
    const conflict = found.find((item) => item.kind === 'dependency-inversion')
    expect(conflict?.severity).toBe('blocking')
  })

  it('缺少制作组或负责人是阻断', () => {
    const found = checkStageRows([row({ productionGroupId: '', ownerName: '' })], calendar)
    expect(found.filter((item) => item.kind === 'missing-field')).toHaveLength(2)
    expect(found.every((item) => item.severity === 'blocking')).toBe(true)
  })

  it('一次返回全部问题，不是遇到第一个就停', () => {
    const found = checkStageRows(
      [row({ start: '2026-08-01', finish: '2026-07-30', productionGroupId: '' })],
      calendar,
    )
    expect(found.length).toBeGreaterThanOrEqual(3)
  })
})
