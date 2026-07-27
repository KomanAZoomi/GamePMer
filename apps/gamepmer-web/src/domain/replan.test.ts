import { describe, expect, it } from 'vitest'
import { createDemoState } from '../data/seed'
import { DEMO_TODAY } from './clock'
import {
  ReplanBlocked,
  classifyInScope,
  classifyOutOfScope,
  confirmReplan,
  generateReplanDraft,
  moveDraftStage,
} from './replan'

const AT = '2026-07-27T14:00:00+08:00'
const ITEM = 'F-017/ITEM-01' // 缩小肩甲比例，2 个工作日，影响 MECH-01 高模

function fresh() {
  return createDemoState()
}

describe('generateReplanDraft', () => {
  const state = fresh()
  const draft = generateReplanDraft(state, ITEM, DEMO_TODAY)

  it('草案不碰正式计划', () => {
    const stage = state.projects[0].assets[0].stages[2]
    expect(stage.currentStart).toBe('2026-07-27')
    expect(stage.currentFinish).toBe('2026-07-29')
    expect(state.revisions.filter((item) => item.projectCode === 'P-3D-024')).toHaveLength(0)
  })

  it('返修阶段与其后未验收阶段都在受影响范围内', () => {
    expect(draft.changes.map((change) => change.stageId)).toEqual([
      'MECH-01/3D_HIGH',
      'MECH-01/3D_LOW',
      'MECH-01/3D_BAKE',
      'MECH-01/3D_TEXTURE',
      'MECH-01/3D_LOD',
    ])
  })

  it('已获客户验收的阶段不被改写', () => {
    expect(draft.changes.some((change) => change.stageId === 'MECH-01/3D_MID')).toBe(false)
  })

  it('未受影响的资产完全不在草案里', () => {
    expect(draft.changes.every((change) => change.stageId.startsWith('MECH-01/'))).toBe(true)
    expect(draft.assetId).toBe('MECH-01')
  })

  it('后续阶段按工作日顺延，不是按自然日', () => {
    const low = draft.changes.find((change) => change.stageId === 'MECH-01/3D_LOW')
    expect(low?.oldStart).toBe('2026-07-27')
    expect(low?.newStart).toBe('2026-07-29')
    expect(low?.shiftedWorkdays).toBe(2)
  })

  it('跨过公司休息日：8/5 不被当作可用工作日', () => {
    const lod = draft.changes.find((change) => change.stageId === 'MECH-01/3D_LOD')
    // 原 8/6—8/7 顺延 2 个工作日 → 8/10—8/11，跳过 8/5 与周末
    expect(lod?.newStart).toBe('2026-08-10')
    expect(lod?.newFinish).toBe('2026-08-11')
  })

  it('草案标明来源反馈与原因', () => {
    expect(draft.sourceFeedbackItemId).toBe(ITEM)
    expect(draft.reason).toBe('client-feedback')
  })
})

describe('moveDraftStage', () => {
  it('按整工作日调整，落在周末时自动跳到下一个工作日', () => {
    const state = fresh()
    const draft = generateReplanDraft(state, ITEM, DEMO_TODAY)
    // 低模草案 7/29—7/31，再推 1 个工作日 → 7/30—8/3（跳过周末）
    const moved = moveDraftStage(draft, 'MECH-01/3D_LOW', 1, state.calendars[0])
    const low = moved.changes.find((change) => change.stageId === 'MECH-01/3D_LOW')
    expect(low?.newStart).toBe('2026-07-30')
    expect(low?.newFinish).toBe('2026-08-03')
    expect(low?.shiftedWorkdays).toBe(3)
  })

  it('只动指定阶段，其他阶段不受影响', () => {
    const state = fresh()
    const draft = generateReplanDraft(state, ITEM, DEMO_TODAY)
    const moved = moveDraftStage(draft, 'MECH-01/3D_LOW', 1, state.calendars[0])
    const bake = moved.changes.find((change) => change.stageId === 'MECH-01/3D_BAKE')
    const original = draft.changes.find((change) => change.stageId === 'MECH-01/3D_BAKE')
    expect(bake).toEqual(original)
  })
})

describe('取消草案', () => {
  it('丢掉草案后正式计划一个字节都没变', () => {
    const state = fresh()
    const before = structuredClone(state)

    const draft = generateReplanDraft(state, ITEM, DEMO_TODAY)
    moveDraftStage(draft, 'MECH-01/3D_LOW', 2, state.calendars[0])
    // 不调用 confirmReplan，草案直接丢弃

    expect(state).toEqual(before)
  })
})

describe('confirmReplan', () => {
  const state = fresh()
  const draft = generateReplanDraft(state, ITEM, DEMO_TODAY)
  const next = confirmReplan(state, { draft, note: '客户要求缩小肩甲，返修 2 个工作日', actor: 'Brandon', at: AT })
  const asset = next.projects[0].assets[0]

  it('当前计划更新', () => {
    const low = asset.stages.find((stage) => stage.id === 'MECH-01/3D_LOW')
    expect(low?.currentStart).toBe('2026-07-29')
    expect(low?.currentFinish).toBe('2026-07-31')
  })

  it('基准日期保持不变', () => {
    const low = asset.stages.find((stage) => stage.id === 'MECH-01/3D_LOW')
    expect(low?.baselineStart).toBe('2026-07-27')
    expect(low?.baselineFinish).toBe('2026-07-29')
  })

  it('生成新的修订版本并关联来源反馈', () => {
    const revision = next.revisions.find((item) => item.projectCode === 'P-3D-024')
    expect(revision?.version).toBe(1)
    expect(revision?.sourceFeedbackItemId).toBe(ITEM)
    expect(revision?.reason).toBe('client-feedback')
    expect(revision?.confirmedBy).toBe('Brandon')
  })

  it('生成审计事件', () => {
    const event = next.auditEvents.filter((item) => item.action.startsWith('确认排期修订')).at(-1)
    expect(event?.after).toContain('2026-07-29')
    expect(event?.reason).toBe('client-feedback')
  })

  it('通知只到草稿为止，收件人是组长与艺术总监', () => {
    const drafts = next.notificationDrafts.filter((item) => item.sourceKind === 'schedule-revision')
    expect(drafts).toHaveLength(2)
    expect(drafts.map((item) => item.recipientRole).sort()).toEqual(['组长', '艺术总监'])
    expect(drafts.every((item) => item.status === 'draft')).toBe(true)
    expect(drafts[0].body).toContain('2026-07-29')
  })

  it('反馈项进入返修状态', () => {
    const item = next.feedbackBatches[0].items.find((entry) => entry.id === ITEM)
    expect(item?.status).toBe('InRework')
  })

  it('未受影响的资产与项目不被写入', () => {
    expect(next.projects[0].assets[1]).toEqual(state.projects[0].assets[1])
    expect(next.projects[1]).toEqual(state.projects[1])
    expect(next.projects[2]).toEqual(state.projects[2])
    expect(next.projects[3]).toEqual(state.projects[3])
  })

  it('确认后原 state 仍是原样——写入产生的是新对象', () => {
    expect(state.projects[0].assets[0].stages[2].currentStart).toBe('2026-07-27')
  })

  it('草案落在非工作日时整体拒绝，不做部分写入', () => {
    const dirty = fresh()
    const bad = generateReplanDraft(dirty, ITEM, DEMO_TODAY)
    const broken = {
      ...bad,
      changes: bad.changes.map((change) =>
        change.stageId === 'MECH-01/3D_LOW'
          ? { ...change, newStart: '2026-08-01', newFinish: '2026-08-01' }
          : change,
      ),
    }
    const before = structuredClone(dirty)

    expect(() => confirmReplan(dirty, { draft: broken, note: '', actor: 'Brandon', at: AT })).toThrow(
      ReplanBlocked,
    )
    expect(dirty).toEqual(before)
  })
})

describe('范围分流', () => {
  it('判为范围内只改分类，不动排期', () => {
    const state = fresh()
    const next = classifyInScope(state, ITEM, AT, 'Brandon')
    const item = next.feedbackBatches[0].items.find((entry) => entry.id === ITEM)

    expect(item?.scope).toBe('in-scope')
    expect(item?.status).toBe('Confirmed')
    expect(next.projects[0].assets[0].stages[2].currentStart).toBe('2026-07-27')
    expect(next.revisions.filter((entry) => entry.projectCode === 'P-3D-024')).toHaveLength(0)
  })

  it('判为范围外创建变更单并冻结受影响阶段', () => {
    const state = fresh()
    const next = classifyOutOfScope(state, 'F-017/ITEM-02', AT, 'Brandon')
    const item = next.feedbackBatches[0].items.find((entry) => entry.id === 'F-017/ITEM-02')

    expect(item?.scope).toBe('out-of-scope')
    expect(item?.status).toBe('WaitingChangeQuote')
    expect(next.changeRequests).toHaveLength(1)
    expect(next.changeRequests[0].id).toBe('CQ-004')
    expect(next.changeRequests[0].sourceFeedbackItemId).toBe('F-017/ITEM-02')

    const high = next.projects[0].assets[0].stages.find((stage) => stage.id === 'MECH-01/3D_HIGH')
    expect(high?.flags).toContain('WaitingChangeQuote')
  })

  it('冻结只作用于受影响资产，其他资产继续制作', () => {
    const state = fresh()
    const next = classifyOutOfScope(state, 'F-017/ITEM-02', AT, 'Brandon')

    // MECH-02 与其他项目不带任何等待变更报价标记
    const others = next.projects
      .flatMap((project) => project.assets)
      .filter((asset) => asset.id !== 'MECH-01')
      .flatMap((asset) => asset.stages)
    expect(others.every((stage) => !stage.flags.includes('WaitingChangeQuote'))).toBe(true)
  })

  it('分流写审计，留下判定痕迹', () => {
    const state = fresh()
    const next = classifyOutOfScope(state, 'F-017/ITEM-02', AT, 'Brandon')
    const event = next.auditEvents.at(-1)
    expect(event?.action).toContain('创建变更单')
    expect(event?.after).toContain('CQ-004')
  })
})
