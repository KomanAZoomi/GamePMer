import { describe, expect, it } from 'vitest'

import { createDemoState } from '../data/seed'
import { DEMO_TODAY } from './clock'
import type { DemoState, StagePlan } from './model'
import {
  STAGE_ACTION_LABEL,
  StageFlowBlocked,
  advanceStage,
  availableStageActions,
  findStageById,
  stageBlockingIssues,
} from './stageFlow'

const ACTOR = 'Brandon'
const NOW = `${DEMO_TODAY}T15:00:00+08:00`

function stage(state: DemoState, id: string): StagePlan {
  const found = findStageById(state, id)
  if (!found) throw new Error(`种子里没有阶段 ${id}`)
  return found
}

/** 正式排期指纹。推进阶段只写实际日期，不许碰计划和基准 */
function planFingerprint(state: DemoState): string {
  return JSON.stringify(
    state.projects
      .flatMap((p) => p.assets)
      .flatMap((a) =>
        a.stages.map((s) => [s.id, s.baselineStart, s.baselineFinish, s.currentStart, s.currentFinish]),
      ),
  )
}

/**
 * 阶段推进。
 *
 * 验收提问：反馈分流之后，高模怎么流转到低模？
 * 答案当时是「流转不了」——六个主状态里只有一条迁移是能走的（收件箱确认「阶段完成」
 * → 已交 PM），开工、提交客户、客户验收三个动作根本不存在。
 *
 * 两条已确认的规则：
 * 1. **下一阶段要等前一阶段客户验收**，不是等它交给 PM。
 * 2. **全部手动**：工作台只提示「可以开工了」，不替 PM 改状态。
 */
describe('阶段推进的动作集', () => {
  /**
   * 「没有可用动作」本身不是 bug——低模在高模验收前就是不该能开工。
   * 真正不能出现的是**没有动作、也说不出为什么**：那种才是死胡同。
   */
  it('每个非终态要么有动作，要么说得出为什么不能动', () => {
    const state = createDemoState()
    for (const project of state.projects) {
      for (const asset of project.assets) {
        for (const row of asset.stages) {
          if (row.status === 'Approved') continue
          const actions = availableStageActions(state, row.id)
          if (actions.length > 0) continue

          const reasons = (['start', 'hand-to-pm', 'submit-to-client', 'client-approve'] as const)
            .flatMap((action) => stageBlockingIssues(state, row.id, action))
          expect(reasons.length, `${row.id}（${row.status}）既没动作也没给理由`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('每个资产至少有一个阶段动得了，整条链不会全卡死', () => {
    const state = createDemoState()
    for (const project of state.projects) {
      for (const asset of project.assets) {
        if (asset.stages.every((row) => row.status === 'Approved')) continue
        const movable = asset.stages.filter((row) => availableStageActions(state, row.id).length > 0)
        expect(movable.length, `${asset.id} 整个资产没有任何阶段动得了`).toBeGreaterThan(0)
      }
    }
  })

  it('已验收是终态，没有后续动作', () => {
    const state = createDemoState()
    const approved = state.projects
      .flatMap((p) => p.assets)
      .flatMap((a) => a.stages)
      .find((s) => s.status === 'Approved')!
    expect(availableStageActions(state, approved.id)).toEqual([])
  })

  it('每个动作都有中文名，界面不显示内部动作名', () => {
    const state = createDemoState()
    const all = state.projects
      .flatMap((p) => p.assets)
      .flatMap((a) => a.stages)
      .flatMap((s) => availableStageActions(state, s.id))
    for (const action of new Set(all)) {
      expect(STAGE_ACTION_LABEL[action]).toBeTruthy()
    }
  })
})

describe('依赖门禁：下一阶段要等前一阶段客户验收', () => {
  const MID = 'MECH-02/3D_MID'
  const HIGH = 'MECH-02/3D_HIGH'

  it('前一阶段还没验收时，后一阶段开工被阻断并点名是哪一阶段', () => {
    const state = createDemoState()
    expect(stage(state, MID).status).not.toBe('Approved')

    const issues = stageBlockingIssues(state, HIGH, 'start')
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.join()).toContain('中模')
  })

  /** 「交给 PM」不等于「客户认了」——这两件事合并过一次就再也拆不回来 */
  it('前一阶段只是交给 PM，仍然不够', () => {
    const base = createDemoState()
    const state = withStage(base, MID, { status: 'HandedToPm', actualFinish: '2026-07-28' })
    expect(stageBlockingIssues(state, HIGH, 'start').length).toBeGreaterThan(0)
  })

  it('前一阶段客户验收后，后一阶段才可以开工', () => {
    const base = createDemoState()
    const state = withStage(base, MID, { status: 'Approved', clientApprovedAt: '2026-07-28' })
    expect(stageBlockingIssues(state, HIGH, 'start')).toEqual([])
    expect(availableStageActions(state, HIGH)).toContain('start')
  })

  it('资产的第一个阶段没有前置，随时可以开工', () => {
    const state = createDemoState()
    expect(stageBlockingIssues(state, 'PROP-02/3D_MID', 'start')).toEqual([])
  })
})

describe('逐步推进', () => {
  // PROP-02 的中模是资产的第一个阶段且未开始，适合走完整条链
  const MID = 'PROP-02/3D_MID'

  it('开工写实际开始日，且不碰计划与基准', () => {
    const state = createDemoState()
    const before = planFingerprint(state)

    const next = advanceStage(state, MID, 'start', { actor: ACTOR, now: NOW })
    expect(stage(next, MID).status).toBe('InProduction')
    expect(stage(next, MID).actualStart).toBe(DEMO_TODAY)
    expect(planFingerprint(next)).toBe(before)
  })

  it('制作中 → 已交 PM 写实际完成日', () => {
    const state = advanceStage(createDemoState(), MID, 'start', { actor: ACTOR, now: NOW })
    const next = advanceStage(state, MID, 'hand-to-pm', { actor: ACTOR, now: NOW })

    expect(stage(next, MID).status).toBe('HandedToPm')
    expect(stage(next, MID).actualFinish).toBe(DEMO_TODAY)
  })

  /**
   * 「完成制作」「已交 PM」「已提交客户」「客户确认」是四件不同的事。
   * 每步用不同的日期推，四个字段就必须各记各的——合并过一次就再也拆不回来。
   */
  it('四个时间点各记各的，不共用一个完成日', () => {
    const steps = [
      ['start', '2026-07-27'],
      ['hand-to-pm', '2026-07-28'],
      ['submit-to-client', '2026-07-29'],
      ['client-approve', '2026-07-31'],
    ] as const

    let next = createDemoState()
    for (const [action, day] of steps) {
      next = advanceStage(next, MID, action, { actor: ACTOR, now: `${day}T10:00:00+08:00` })
    }

    const done = stage(next, MID)
    expect(done.status).toBe('Approved')
    expect(done.actualStart).toBe('2026-07-27')
    expect(done.actualFinish).toBe('2026-07-28')
    expect(done.submittedToClientAt).toBe('2026-07-29')
    expect(done.clientApprovedAt).toBe('2026-07-31')
  })

  it('提交客户后状态是等待客户，客户等待期在这里开始计', () => {
    let next = createDemoState()
    next = advanceStage(next, MID, 'start', { actor: ACTOR, now: NOW })
    next = advanceStage(next, MID, 'hand-to-pm', { actor: ACTOR, now: NOW })
    next = advanceStage(next, MID, 'submit-to-client', { actor: ACTOR, now: NOW })

    expect(stage(next, MID).status).toBe('AwaitingClient')
    expect(stage(next, MID).submittedToClientAt).toBe(DEMO_TODAY)
  })

  it('跳步会被阻断，且不留任何副作用', () => {
    const state = createDemoState()
    expect(() => advanceStage(state, MID, 'client-approve', { actor: ACTOR, now: NOW })).toThrow(
      StageFlowBlocked,
    )
    expect(stage(state, MID).status).toBe('NotStarted')
    expect(stage(state, MID).clientApprovedAt).toBeUndefined()
  })

  it('每一步都写审计，说清是谁在什么时候推的', () => {
    const state = createDemoState()
    const next = advanceStage(state, MID, 'start', { actor: ACTOR, now: NOW })

    const audit = next.auditEvents.at(-1)!
    expect(audit.targetKind).toBe('StagePlan')
    expect(audit.targetId).toBe(MID)
    expect(audit.actor).toBe(ACTOR)
    expect(audit.before).toBe('NotStarted')
    expect(audit.after).toBe('InProduction')
  })
})

describe('冻结与返修不能被推进绕过', () => {
  it('等待变更报价的阶段不能开工——冻结就是冻结', () => {
    const state = createDemoState()
    const frozen = state.projects
      .flatMap((p) => p.assets)
      .flatMap((a) => a.stages)
      .find((s) => s.flags.includes('WaitingChangeQuote'))!

    expect(stageBlockingIssues(state, frozen.id, 'start').join()).toContain('变更报价')
    expect(availableStageActions(state, frozen.id)).not.toContain('start')
  })
})

/** 全部资产验收后，结项第一道门禁自己就通了——它本来就是从阶段状态推导的 */
describe('推进到底之后结项门禁自己会开', () => {
  it('把一个项目的阶段全部推到已验收，assets-approved 变成已完成', async () => {
    const { assetsApproved } = await import('./closeout')
    let state = createDemoState()
    const code = 'NST_C_3D_B31'

    expect(assetsApproved(state, code).done).toBe(false)

    // 按依赖顺序逐个推到底
    for (let round = 0; round < 200; round += 1) {
      const project = state.projects.find((p) => p.code === code)!
      const next = project.assets
        .flatMap((asset) => asset.stages)
        .find((row) => row.status !== 'Approved' && availableStageActions(state, row.id).length > 0)
      if (!next) break
      const action = availableStageActions(state, next.id)[0]
      state = advanceStage(state, next.id, action, { actor: ACTOR, now: NOW })
    }

    expect(assetsApproved(state, code).done).toBe(true)
  })
})

function withStage(state: DemoState, stageId: string, patch: Partial<StagePlan>): DemoState {
  return {
    ...state,
    projects: state.projects.map((project) => ({
      ...project,
      assets: project.assets.map((asset) => ({
        ...asset,
        stages: asset.stages.map((row) => (row.id === stageId ? { ...row, ...patch } : row)),
      })),
    })),
  }
}

/**
 * 等客户的两个出口。
 *
 * 验收指出：已提交客户之后，下一步应该是「客户已验收」**或**「返修」。
 * 原来只做了验收那一条，客户回话说要改就没地方走了。
 */
describe('等客户之后有两条路', () => {
  const MID = 'PROP-02/3D_MID'

  function toAwaitingClient(state: DemoState): DemoState {
    let next = state
    for (const action of ['start', 'hand-to-pm', 'submit-to-client'] as const) {
      next = advanceStage(next, MID, action, { actor: ACTOR, now: NOW })
    }
    return next
  }

  it('等客户时同时给得出验收和返修两个动作', () => {
    const state = toAwaitingClient(createDemoState())
    const actions = availableStageActions(state, MID)
    expect(actions).toContain('client-approve')
    expect(actions).toContain('client-rework')
  })

  it('客户要返修 → 回到制作中并打上返修标记', () => {
    const state = toAwaitingClient(createDemoState())
    const next = advanceStage(state, MID, 'client-rework', {
      actor: ACTOR,
      now: NOW,
      note: '发光面积再大一圈',
    })

    expect(stage(next, MID).status).toBe('InProduction')
    expect(stage(next, MID).flags).toContain('Rework')
  })

  /** 客户并没有确认，那个日期不能留着——留着分析里就成了「已验收」 */
  it('返修会清掉客户确认日，但保留提交客户的时间', () => {
    let state = toAwaitingClient(createDemoState())
    state = advanceStage(state, MID, 'client-approve', { actor: ACTOR, now: NOW })
    expect(stage(state, MID).clientApprovedAt).toBeTruthy()

    // 验收之后又反悔的情况走反馈中心，这里只验状态机本身
    const reset = advanceStage(
      { ...state, projects: withStage(state, MID, { status: 'AwaitingClient' }).projects },
      MID,
      'client-rework',
      { actor: ACTOR, now: NOW, note: '还要再改' },
    )
    expect(reset.projects.flatMap((p) => p.assets).flatMap((a) => a.stages).find((s) => s.id === MID)!
      .clientApprovedAt).toBeUndefined()
    expect(stage(reset, MID).submittedToClientAt).toBeTruthy()
  })

  it('返修后可以重新走完一轮，交回客户再验收', () => {
    let state = toAwaitingClient(createDemoState())
    state = advanceStage(state, MID, 'client-rework', { actor: ACTOR, now: NOW, note: '改一版' })

    for (const action of ['hand-to-pm', 'submit-to-client', 'client-approve'] as const) {
      state = advanceStage(state, MID, action, { actor: ACTOR, now: NOW })
    }
    expect(stage(state, MID).status).toBe('Approved')
    // 验收时返修标记清掉
    expect(stage(state, MID).flags).not.toContain('Rework')
  })

  it('没提交客户时不能说客户要返修', () => {
    const state = createDemoState()
    expect(() => advanceStage(state, MID, 'client-rework', { actor: ACTOR, now: NOW })).toThrow(
      StageFlowBlocked,
    )
  })

  /** 冻结既不能开工，也不能把它做完交上去——否则「只冻受影响资产」形同虚设 */
  it('等待变更报价的阶段也不能交给 PM', () => {
    const base = createDemoState()
    const frozen = base.projects
      .flatMap((p) => p.assets)
      .flatMap((a) => a.stages)
      .find((s) => s.flags.includes('WaitingChangeQuote'))!
    const state = withStage(base, frozen.id, { status: 'InProduction' })

    expect(stageBlockingIssues(state, frozen.id, 'hand-to-pm').join()).toContain('变更报价')
  })
})

/**
 * 返修与反馈中心打通。
 *
 * 直接改个状态就完事，等于绕过整条反馈线：范围内返修与范围外追加报价的分岔
 * 就在分流那一步，没有反馈项就没有那个分岔，客户到底说了什么也没留下。
 */
describe('返修要留下客户说了什么', () => {
  const MID = 'PROP-02/3D_MID'
  const SAID = '灯柱顶部的发光面积再大一圈'

  function toAwaitingClient(state: DemoState): DemoState {
    let next = state
    for (const action of ['start', 'hand-to-pm', 'submit-to-client'] as const) {
      next = advanceStage(next, MID, action, { actor: ACTOR, now: NOW })
    }
    return next
  }

  it('不写客户原话就不许标返修', () => {
    const state = toAwaitingClient(createDemoState())
    expect(() => advanceStage(state, MID, 'client-rework', { actor: ACTOR, now: NOW })).toThrow(
      StageFlowBlocked,
    )
  })

  it('返修会生成一条待分流的资产级反馈项，范围留给 PM 判', () => {
    const state = toAwaitingClient(createDemoState())
    const before = state.feedbackBatches.flatMap((batch) => batch.items).length

    const next = advanceStage(state, MID, 'client-rework', {
      actor: ACTOR,
      now: NOW,
      note: SAID,
    })

    const items = next.feedbackBatches.flatMap((batch) => batch.items)
    expect(items).toHaveLength(before + 1)
    const created = items.find((item) => item.stageId === MID)!
    expect(created.status).toBe('NeedsClassification')
    expect(created.scope).toBe('unclassified')
    // 客户原话原样留着，不重新措辞
    expect(created.originalText).toBe(SAID)
  })

  it('同一天同一项目的客户回话归到一个批次里', () => {
    let state = toAwaitingClient(createDemoState())
    state = advanceStage(state, MID, 'client-rework', { actor: ACTOR, now: NOW, note: SAID })
    const batches = state.feedbackBatches.length

    // 另一个阶段当天也被打回
    let other = state
    for (const action of ['hand-to-pm', 'submit-to-client'] as const) {
      other = advanceStage(other, MID, action, { actor: ACTOR, now: NOW })
    }
    other = advanceStage(other, MID, 'client-rework', { actor: ACTOR, now: NOW, note: '再改一版' })

    expect(other.feedbackBatches).toHaveLength(batches)
  })
})

describe('反馈项能走完，不再停在返修中', () => {
  const STAGE = 'MECH-01/3D_HIGH'

  it('交回客户 → 已重提；客户验收 → 已关闭', () => {
    const base = createDemoState()
    // 种子里 MECH-01 高模正在等待客户，先造一条返修中的反馈项
    const state: DemoState = {
      ...base,
      feedbackBatches: base.feedbackBatches.map((batch) => ({
        ...batch,
        items: batch.items.map((item) =>
          item.stageId === STAGE ? { ...item, status: 'InRework' as const } : item,
        ),
      })),
      projects: withStage(base, STAGE, { status: 'HandedToPm' }).projects,
    }

    const submitted = advanceStage(state, STAGE, 'submit-to-client', { actor: ACTOR, now: NOW })
    const resubmitted = submitted.feedbackBatches
      .flatMap((batch) => batch.items)
      .filter((item) => item.stageId === STAGE)
    expect(resubmitted.every((item) => item.status === 'Resubmitted')).toBe(true)

    const approved = advanceStage(submitted, STAGE, 'client-approve', { actor: ACTOR, now: NOW })
    const closed = approved.feedbackBatches
      .flatMap((batch) => batch.items)
      .filter((item) => item.stageId === STAGE)
    expect(closed.every((item) => item.status === 'Closed')).toBe(true)
  })

  it('没在返修的反馈项不会被顺手改掉', () => {
    const base = createDemoState()
    const state = withStage(base, STAGE, { status: 'HandedToPm' })
    const before = state.feedbackBatches.flatMap((b) => b.items).map((i) => [i.id, i.status])

    const next = advanceStage(state, STAGE, 'submit-to-client', { actor: ACTOR, now: NOW })
    const after = next.feedbackBatches.flatMap((b) => b.items).map((i) => [i.id, i.status])
    expect(after).toEqual(before)
  })
})
