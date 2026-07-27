import { describe, expect, it } from 'vitest'
import { createDemoState } from '../data/seed'
import { collectMilestones } from './milestones'
import { DEMO_TODAY } from './clock'
import {
  ScheduleEntryBlocked,
  buildStageRows,
  cascadeShift,
  confirmScheduleEntry,
  diffRows,
  updateRow,
} from './scheduleEntry'

function mech01(state = createDemoState()) {
  const project = state.projects.find((item) => item.code === 'P-3D-024')!
  return { state, project, asset: project.assets.find((item) => item.id === 'MECH-01')! }
}

const confirmInput = {
  projectCode: 'P-3D-024',
  assetId: 'MECH-01',
  reason: 'team-delay' as const,
  note: '低模顺延两个工作日',
  actor: 'Brandon',
  at: '2026-07-27T11:00:00+08:00',
}

describe('buildStageRows', () => {
  it('每个可验收阶段一行，带回制作组、人天与依赖', () => {
    const { asset } = mech01()
    const rows = buildStageRows(asset)
    expect(rows).toHaveLength(6)
    expect(rows[2]).toMatchObject({
      id: 'MECH-01/3D_LOW',
      stageName: '低模',
      productionGroupId: 'grp-3d-a',
      estimatedPersonDays: 3,
      dependsOn: ['MECH-01/3D_HIGH'],
    })
  })
})

describe('diffRows', () => {
  it('只报告真正改动的行', () => {
    const { asset } = mech01()
    const rows = buildStageRows(asset)
    expect(diffRows(asset, rows).changes).toHaveLength(0)
  })

  it('日期改动带上工作日增量', () => {
    const { state, asset } = mech01()
    const calendar = state.calendars[0]
    const rows = updateRow(buildStageRows(asset), 'MECH-01/3D_LOW', {
      start: '2026-07-29',
      finish: '2026-07-31',
    })
    const diff = diffRows(asset, rows, calendar)
    expect(diff.changes).toHaveLength(1)
    expect(diff.changes[0].shiftedWorkdays).toBe(2)
  })

  it('换组与改人天单独记为属性改动', () => {
    const { asset } = mech01()
    const rows = updateRow(buildStageRows(asset), 'MECH-01/3D_LOW', {
      productionGroupId: 'grp-3d-b',
      estimatedPersonDays: 4,
    })
    const diff = diffRows(asset, rows)
    expect(diff.changes).toHaveLength(0)
    expect(diff.attributeChanges.map((item) => item.field)).toEqual(['制作组', '预估人天'])
  })
})

describe('confirmScheduleEntry', () => {
  it('确认后写入当前计划，基准原封不动', () => {
    const { state, asset } = mech01()
    const rows = cascadeShift(
      updateRow(buildStageRows(asset), 'MECH-01/3D_LOW', {
        start: '2026-07-29',
        finish: '2026-07-31',
      }),
      state.calendars[0],
    )

    const next = confirmScheduleEntry(state, { ...confirmInput, rows })
    const stage = next.projects[0].assets[0].stages[2]

    expect(stage.currentStart).toBe('2026-07-29')
    expect(stage.currentFinish).toBe('2026-07-31')
    expect(stage.baselineStart).toBe('2026-07-27')
    expect(stage.baselineFinish).toBe('2026-07-29')
    expect(stage.revisionReason).toBe('team-delay')
  })

  it('生成新的修订版本，版本号在项目内递增', () => {
    const { state, asset } = mech01()
    const rows = cascadeShift(
      updateRow(buildStageRows(asset), 'MECH-01/3D_LOW', {
        start: '2026-07-29',
        finish: '2026-07-31',
      }),
      state.calendars[0],
    )

    const next = confirmScheduleEntry(state, { ...confirmInput, rows })
    const revision = next.revisions.find((item) => item.projectCode === 'P-3D-024')

    expect(revision?.version).toBe(1)
    expect(revision?.confirmedBy).toBe('Brandon')
    expect(revision?.changes[0].shiftedWorkdays).toBe(2)
    // P-2D-018 已有 v1，互不干扰
    expect(next.revisions.filter((item) => item.projectCode === 'P-2D-018')).toHaveLength(1)
  })

  it('确认时间来自注入的时钟，不是反馈接收日', () => {
    const { state, asset } = mech01()
    const rows = cascadeShift(
      updateRow(buildStageRows(asset), 'MECH-01/3D_LOW', { finish: '2026-07-30' }),
      state.calendars[0],
    )
    const next = confirmScheduleEntry(state, { ...confirmInput, rows })
    expect(next.revisions.at(-1)?.confirmedAt).toBe('2026-07-27T11:00:00+08:00')
  })

  it('生成审计事件，含原值与新值', () => {
    const { state, asset } = mech01()
    const rows = cascadeShift(
      updateRow(buildStageRows(asset), 'MECH-01/3D_LOW', {
        start: '2026-07-29',
        finish: '2026-07-31',
      }),
      state.calendars[0],
    )
    const next = confirmScheduleEntry(state, { ...confirmInput, rows })
    // 种子里已有 P-2D-018 的 v1 审计，这里要取本次新生成的那条
    const event = next.auditEvents.filter((item) => item.action.startsWith('确认排期修订')).at(-1)

    expect(event?.before).toContain('2026-07-27')
    expect(event?.after).toContain('2026-07-29')
    expect(event?.actor).toBe('Brandon')
  })

  it('有阻断时抛错，且原状态一个字节都没改', () => {
    const { state, asset } = mech01()
    const before = structuredClone(state)
    // 8/1 是周六
    const rows = updateRow(buildStageRows(asset), 'MECH-01/3D_LOW', {
      start: '2026-08-01',
      finish: '2026-08-04',
    })

    expect(() => confirmScheduleEntry(state, { ...confirmInput, rows })).toThrow(ScheduleEntryBlocked)
    expect(state).toEqual(before)
  })

  it('阻断错误带回全部阻断项供界面逐行标注', () => {
    const { state, asset } = mech01()
    const rows = updateRow(buildStageRows(asset), 'MECH-01/3D_LOW', {
      start: '2026-08-01',
      finish: '2026-07-30',
    })

    try {
      confirmScheduleEntry(state, { ...confirmInput, rows })
      expect.unreachable('应当抛出阻断错误')
    } catch (error) {
      expect(error).toBeInstanceOf(ScheduleEntryBlocked)
      expect((error as ScheduleEntryBlocked).conflicts.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('没有任何改动时不生成空修订', () => {
    const { state, asset } = mech01()
    const next = confirmScheduleEntry(state, { ...confirmInput, rows: buildStageRows(asset) })
    expect(next).toBe(state)
    expect(next.revisions.filter((item) => item.projectCode === 'P-3D-024')).toHaveLength(0)
  })

  it('只改属性不改日期时记审计但不产生修订版本', () => {
    const { state, asset } = mech01()
    const rows = updateRow(buildStageRows(asset), 'MECH-01/3D_LOW', { estimatedPersonDays: 4 })
    const next = confirmScheduleEntry(state, { ...confirmInput, rows })

    expect(next.revisions.filter((item) => item.projectCode === 'P-3D-024')).toHaveLength(0)
    expect(next.auditEvents.some((item) => item.action === '修改预估人天')).toBe(true)
  })

  it('未受影响的其他资产与项目不被写入', () => {
    const { state, asset } = mech01()
    const rows = cascadeShift(
      updateRow(buildStageRows(asset), 'MECH-01/3D_LOW', {
        start: '2026-07-29',
        finish: '2026-07-31',
      }),
      state.calendars[0],
    )
    const next = confirmScheduleEntry(state, { ...confirmInput, rows })

    expect(next.projects[0].assets[1]).toEqual(state.projects[0].assets[1])
    expect(next.projects[1]).toEqual(state.projects[1])
    expect(next.projects[2]).toEqual(state.projects[2])
  })
})

describe('collectMilestones', () => {
  const state = createDemoState()
  const milestones = collectMilestones(state, DEMO_TODAY, 14)

  it('按日期排序并落在窗口内', () => {
    const dates = milestones.map((item) => item.date)
    expect([...dates].sort()).toEqual(dates)
    expect(dates.every((date) => date >= DEMO_TODAY)).toBe(true)
  })

  it('客户反馈作为节点出现，并标出待分流数', () => {
    const feedback = milestones.find((item) => item.kind === 'client-feedback')
    expect(feedback?.status).toBe('3 项待分流')
    expect(feedback?.tone).toBe('risk')
  })

  it('计划开工与阶段交付分开成节点', () => {
    expect(milestones.some((item) => item.kind === 'kickoff')).toBe(true)
    expect(milestones.some((item) => item.kind === 'stage-delivery')).toBe(true)
  })

  it('资产最后一个阶段标为最终交付', () => {
    const final = milestones.find(
      (item) => item.assetId === 'MECH-01' && item.kind === 'final-delivery',
    )
    expect(final?.stageName).toBe('LOD')
  })

  it('已验收的阶段不再作为待交付节点出现', () => {
    expect(
      milestones.some((item) => item.stageId === 'MECH-01/3D_MID' && item.kind === 'stage-delivery'),
    ).toBe(false)
  })
})
