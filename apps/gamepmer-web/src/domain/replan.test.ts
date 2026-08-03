import { describe, expect, it } from 'vitest'
import { createDemoState } from '../data/seed'
import { DEMO_TODAY } from './clock'
import {
  FEEDBACK_NEXT_STOP,
  ReclassifyBlocked,
  ReplanBlocked,
  classifyInScope,
  classifyNoChange,
  classifyOutOfScope,
  confirmReplan,
  draftBlockingIssues,
  generateReplanDraft,
  moveDraftStage,
  reclassifyFeedback,
  stageFeedbackSummary,
} from './replan'
import type { DemoState, FeedbackItem } from './model'
import { advanceStage } from './stageFlow'

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
    expect(state.revisions.filter((item) => item.projectCode === 'NST_A_3D_B24')).toHaveLength(0)
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

  it('后续阶段排不开时自动跟着顺延，不留下依赖倒置让 PM 收拾', () => {
    const state = fresh()
    const draft = generateReplanDraft(state, ITEM, DEMO_TODAY)
    const moved = moveDraftStage(draft, 'MECH-01/3D_LOW', 1, state.calendars[0])
    const at = (id: string) => moved.changes.find((change) => change.stageId === id)

    expect(at('MECH-01/3D_LOW')).toMatchObject({ newStart: '2026-07-30', newFinish: '2026-08-03' })
    expect(at('MECH-01/3D_BAKE')).toMatchObject({ newStart: '2026-08-04', newFinish: '2026-08-04' })
    // 贴图跨过 8/5 公司休息日
    expect(at('MECH-01/3D_TEXTURE')).toMatchObject({ newStart: '2026-08-06', newFinish: '2026-08-10' })
    expect(at('MECH-01/3D_LOD')).toMatchObject({ newStart: '2026-08-11', newFinish: '2026-08-12' })
  })

  it('级联后的草案本身不含阻断', () => {
    const state = fresh()
    const draft = generateReplanDraft(state, ITEM, DEMO_TODAY)
    const moved = moveDraftStage(draft, 'MECH-01/3D_LOW', 1, state.calendars[0])
    expect(draftBlockingIssues(state, moved)).toHaveLength(0)
  })

  it('前置挡着时不能再往前提', () => {
    const state = fresh()
    const draft = generateReplanDraft(state, ITEM, DEMO_TODAY)
    // 低模已经紧接在高模之后，再提前应当被钳制住
    const moved = moveDraftStage(draft, 'MECH-01/3D_LOW', -1, state.calendars[0])
    expect(moved.changes.find((change) => change.stageId === 'MECH-01/3D_LOW')?.newStart).toBe(
      '2026-07-29',
    )
  })

  it('上游没被推动时后续保持原样', () => {
    const state = fresh()
    const draft = generateReplanDraft(state, ITEM, DEMO_TODAY)
    const moved = moveDraftStage(draft, 'MECH-01/3D_LOD', 1, state.calendars[0])
    // LOD 是最后一个阶段，动它不该波及任何其他行
    for (const id of ['MECH-01/3D_HIGH', 'MECH-01/3D_LOW', 'MECH-01/3D_BAKE', 'MECH-01/3D_TEXTURE']) {
      expect(moved.changes.find((c) => c.stageId === id)).toEqual(
        draft.changes.find((c) => c.stageId === id),
      )
    }
  })
})

describe('撤销范围判定', () => {
  it('判为范围内后可以退回待分流', () => {
    const state = fresh()
    const classified = classifyInScope(state, ITEM, AT, 'Brandon')
    const reset = reclassifyFeedback(classified, ITEM, AT, 'Brandon')
    const item = reset.feedbackBatches[0].items.find((entry) => entry.id === ITEM)

    expect(item?.scope).toBe('unclassified')
    expect(item?.status).toBe('NeedsClassification')
  })

  it('撤销范围外判定时一并回收变更单与冻结标记', () => {
    const state = fresh()
    // 种子里已有一张 CQ-004（背部能源模块），断言只看这次分流带来的增量
    const base = state.changeRequests.length
    const classified = classifyOutOfScope(state, 'F-017/ITEM-02', AT, 'Brandon')
    expect(classified.changeRequests).toHaveLength(base + 1)

    const reset = reclassifyFeedback(classified, 'F-017/ITEM-02', AT, 'Brandon')
    expect(reset.changeRequests).toHaveLength(base)
    const high = reset.projects[0].assets[0].stages.find((s) => s.id === 'MECH-01/3D_HIGH')
    expect(high?.flags).not.toContain('WaitingChangeQuote')
  })

  it('同阶段还有别的范围外反馈时不解除冻结', () => {
    const state = fresh()
    let next = classifyOutOfScope(state, 'F-017/ITEM-02', AT, 'Brandon')
    next = classifyOutOfScope(next, 'F-017/ITEM-03', AT, 'Brandon')
    next = reclassifyFeedback(next, 'F-017/ITEM-02', AT, 'Brandon')

    const high = next.projects[0].assets[0].stages.find((s) => s.id === 'MECH-01/3D_HIGH')
    expect(high?.flags).toContain('WaitingChangeQuote')
    expect(next.changeRequests).toHaveLength(state.changeRequests.length + 1)
  })

  it('已确认排期修订后不允许直接撤销判定', () => {
    const state = fresh()
    const draft = generateReplanDraft(state, ITEM, DEMO_TODAY)
    const confirmed = confirmReplan(state, { draft, note: '', actor: 'Brandon', at: AT })

    expect(() => reclassifyFeedback(confirmed, ITEM, AT, 'Brandon')).toThrow(ReclassifyBlocked)
  })

  it('撤销写审计，留下判定被改过的痕迹', () => {
    const state = fresh()
    const classified = classifyInScope(state, ITEM, AT, 'Brandon')
    const reset = reclassifyFeedback(classified, ITEM, AT, 'Brandon')
    const event = reset.auditEvents.at(-1)

    expect(event?.action).toBe('撤销反馈范围判定')
    expect(event?.before).toBe('in-scope')
    expect(event?.after).toBe('unclassified')
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
    const revision = next.revisions.find((item) => item.projectCode === 'NST_A_3D_B24')
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
    expect(next.revisions.filter((entry) => entry.projectCode === 'NST_A_3D_B24')).toHaveLength(0)
  })

  it('判为范围外创建变更单并冻结受影响阶段', () => {
    const state = fresh()
    const next = classifyOutOfScope(state, 'F-017/ITEM-02', AT, 'Brandon')
    const item = next.feedbackBatches[0].items.find((entry) => entry.id === 'F-017/ITEM-02')

    expect(item?.scope).toBe('out-of-scope')
    expect(item?.status).toBe('WaitingChangeQuote')
    expect(next.changeRequests).toHaveLength(state.changeRequests.length + 1)
    // 编号接着种子里的 CQ-004 往后排
    expect(next.changeRequests.at(-1)!.id).toBe('CQ-005')
    expect(next.changeRequests.at(-1)!.sourceFeedbackItemId).toBe('F-017/ITEM-02')

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
    expect(event?.after).toContain(next.changeRequests.at(-1)!.id)
  })
})

/**
 * 第三种判定：这条不用改。
 *
 * 验收时指出：反馈来了只能判范围内或范围外，没有「通过」。
 * 可现实里一批反馈往往夹着「这个可以」「没问题」——它既不返修也不追加报价，
 * 逼 PM 二选一，等于往正式数据里塞一条假的返修或假的变更单。
 */
describe('判为无需修改', () => {
  const NOW = `${DEMO_TODAY}T15:00:00+08:00`
  const ACTOR = 'Brandon'

  function firstPending(state: DemoState) {
    return state.feedbackBatches[0].items.find(
      (item: FeedbackItem) => item.status === 'NeedsClassification',
    )!
  }

  it('直接关闭该反馈项，不返修也不建变更单', () => {
    const state = createDemoState()
    const item = firstPending(state)
    const changeRequestsBefore = state.changeRequests.length

    const next = classifyNoChange(state, item.id, NOW, ACTOR)
    const closed = next.feedbackBatches
      .flatMap((batch) => batch.items)
      .find((entry) => entry.id === item.id)!

    expect(closed.scope).toBe('no-change')
    expect(closed.status).toBe('Closed')
    expect(next.changeRequests).toHaveLength(changeRequestsBefore)
  })

  it('不动排期：没有返修就没有要顺延的东西', () => {
    const state = createDemoState()
    const before = JSON.stringify(
      state.projects
        .flatMap((p) => p.assets)
        .flatMap((a) => a.stages.map((s) => [s.id, s.currentStart, s.currentFinish])),
    )

    const next = classifyNoChange(state, firstPending(state).id, NOW, ACTOR)

    expect(
      JSON.stringify(
        next.projects.flatMap((p) => p.assets).flatMap((a) => a.stages.map((s) => [s.id, s.currentStart, s.currentFinish])),
      ),
    ).toBe(before)
  })

  it('写审计，说明是谁在什么时候判的', () => {
    const state = createDemoState()
    const next = classifyNoChange(state, firstPending(state).id, NOW, ACTOR)
    const audit = next.auditEvents.at(-1)!
    expect(audit.actor).toBe(ACTOR)
    expect(audit.after).toBe('Closed')
  })

  it('判错了能退回待分流——和另外两种判定一样可逆', () => {
    const state = createDemoState()
    const item = firstPending(state)
    let next = classifyNoChange(state, item.id, NOW, ACTOR)
    next = reclassifyFeedback(next, item.id, NOW, ACTOR)

    const back = next.feedbackBatches
      .flatMap((batch) => batch.items)
      .find((entry) => entry.id === item.id)!
    expect(back.status).toBe('NeedsClassification')
    expect(back.scope).toBe('unclassified')
  })
})

describe('一个阶段的反馈全部了结之后', () => {
  const NOW = `${DEMO_TODAY}T15:00:00+08:00`
  const ACTOR = 'Brandon'

  it('还有待分流的项时，说得出还剩几条', () => {
    const state = createDemoState()
    const item = state.feedbackBatches[0].items.find(
      (entry) => entry.status === 'NeedsClassification',
    )!
    const summary = stageFeedbackSummary(state, item.stageId)

    expect(summary.open).toBeGreaterThan(0)
    expect(summary.allSettled).toBe(false)
  })

  it('全部判为无需修改后，这个阶段就没有未了结的反馈了', () => {
    let state = createDemoState()
    const stageId = state.feedbackBatches[0].items[0].stageId
    for (const item of state.feedbackBatches.flatMap((batch) => batch.items)) {
      if (item.stageId === stageId && item.status === 'NeedsClassification') {
        state = classifyNoChange(state, item.id, NOW, ACTOR)
      }
    }

    const summary = stageFeedbackSummary(state, stageId)
    expect(summary.open).toBe(0)
    expect(summary.allSettled).toBe(true)
  })
})

/**
 * 「还剩 1 条没了结」必须说清这条卡在哪、去哪办。
 *
 * 反馈项不是在反馈中心手工勾完成的：返修中要靠阶段推进「已提交客户」，
 * 已重提要靠「客户已验收」。只报一个数字等于让 PM 自己去翻。
 */
describe('阶段反馈了结的卡点', () => {
  it('把没了结的反馈按状态归类，并各自指向出口', () => {
    const state = createDemoState()
    const item = state.feedbackBatches[0].items[0]
    const after = classifyInScope(state, item.id, '2026-07-27', 'PM')
    const summary = stageFeedbackSummary(after, item.stageId)

    expect(summary.allSettled).toBe(false)
    const confirmed = summary.blocking.find((row) => row.status === 'Confirmed')
    expect(confirmed?.count).toBe(1)
    expect(FEEDBACK_NEXT_STOP.InRework.where).toBe('项目总览')
    expect(FEEDBACK_NEXT_STOP.InRework.action).toContain('已提交客户')
    expect(FEEDBACK_NEXT_STOP.Resubmitted.action).toContain('客户已验收')
  })

  it('返修完提交客户、客户验收之后才算了结——出口在阶段推进上', () => {
    const stageId = 'MECH-01/3D_HIGH'
    let next = fresh()

    // 走完整回路：范围内 → 确认排期修订 → 返修中
    const draft = generateReplanDraft(next, ITEM, DEMO_TODAY)
    next = confirmReplan(next, { draft, note: '客户要求缩小肩甲', actor: 'Brandon', at: AT })
    expect(itemOf(next, ITEM).status).toBe('InRework')

    // 同阶段其余反馈判为无需修改，好把观察点收敛到这一条
    for (const row of itemsOn(next, stageId)) {
      if (row.status !== 'NeedsClassification') continue
      next = classifyNoChange(next, row.id, DEMO_TODAY, 'Brandon')
    }
    expect(stageFeedbackSummary(next, stageId).blocking).toEqual([
      { status: 'InRework', count: 1 },
    ])

    // 反馈中心里没有「手工勾完成」这个动作，出口在阶段推进上
    next = advanceStage(next, stageId, 'client-rework', {
      actor: 'Brandon',
      now: '2026-07-28T09:00:00+08:00',
      note: '肩甲还要再收一点',
    })
    next = advanceStage(next, stageId, 'hand-to-pm', { actor: 'Chen', now: '2026-07-29T18:00:00+08:00' })
    next = advanceStage(next, stageId, 'submit-to-client', { actor: 'Brandon', now: '2026-07-30T10:00:00+08:00' })
    expect(itemOf(next, ITEM).status).toBe('Resubmitted')

    next = advanceStage(next, stageId, 'client-approve', { actor: 'Brandon', now: '2026-07-31T10:00:00+08:00' })
    expect(itemOf(next, ITEM).status).toBe('Closed')
  })
})

function itemsOn(state: DemoState, stageId: string) {
  return state.feedbackBatches.flatMap((batch) => batch.items).filter((row) => row.stageId === stageId)
}

function itemOf(state: DemoState, itemId: string) {
  return state.feedbackBatches.flatMap((batch) => batch.items).find((row) => row.id === itemId)!
}
