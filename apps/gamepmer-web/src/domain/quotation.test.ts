import { describe, expect, it } from 'vitest'

import { createDemoState } from '../data/seed'
import { DEMO_TODAY } from './clock'
import {
  QuoteBlocked,
  TERMINAL_QUOTE_STATUSES,
  activeVersion,
  availableActions,
  createQuoteCase,
  frozenSummary,
  pendingChangeRequests,
  quoteTodoList,
  quoteWaitingOn,
  kickoffBlockingIssues,
  quoteTotals,
  reviewBlockingIssues,
  recordClientReply,
  reviewQuote,
  reviewTodos,
  sendKickoff,
  sendToClient,
  submitQuoteVersion,
} from './quotation'
import { classifyOutOfScope, reclassifyFeedback } from './replan'
import type { DemoState, QuoteLine } from './model'

const ACTOR = 'Brandon'
const NOW = `${DEMO_TODAY}T15:00:00+08:00`

/**
 * 走完「复核通过 → BD 报客户 → 客户确认」，把案件推到可以开工的位置。
 *
 * 这三步以前是不存在的：复核通过就直接能开工。验收时用户指出真实流程是
 * 总监报价 → 组长复核 → 报给客户 → BD 回传客户确认 → 才算正式接项目。
 */
function throughClient(state: DemoState, caseId: string): DemoState {
  const approved = reviewQuote(state, caseId, {
    decision: 'approve',
    actor: 'Leo',
    now: NOW,
    note: '人天与节点合理',
  })
  const sent = sendToClient(approved, caseId, { actor: 'Leo（BD）', now: NOW, via: 'Outlook' })
  return recordClientReply(sent, caseId, 'accept', { actor: 'Leo（BD）', now: NOW, via: 'Outlook' })
}

/** 正式排期的指纹。开工之前，报价流程不许动它。 */
function scheduleFingerprint(state: DemoState): string {
  return JSON.stringify(
    state.projects.flatMap((p) => p.assets).flatMap((a) =>
      a.stages.map((s) => [s.id, s.currentStart, s.currentFinish, s.baselineStart, s.baselineFinish]),
    ),
  )
}

function findCase(state: DemoState, id: string) {
  const found = state.quoteCases.find((entry) => entry.id === id)
  if (!found) throw new Error(`种子里没有报价案件 ${id}`)
  return found
}

const NEW_LINES: QuoteLine[] = [
  {
    id: 'L-1',
    assetId: 'MECH-01',
    stageCode: '3D_HIGH',
    title: '高模 · 能源模块结构',
    note: '新增结构设计与细化',
    personDays: 1.5,
    unitPrice: 2000,
    plannedStart: '2026-08-03',
    plannedFinish: '2026-08-04',
  },
  {
    id: 'L-2',
    assetId: 'MECH-01',
    stageCode: '3D_LOW',
    title: '低模',
    note: '拓扑与结构适配',
    personDays: 0.8,
    unitPrice: 2000,
    plannedStart: '2026-08-05',
    plannedFinish: '2026-08-05',
  },
]

describe('每个非终态都要有出路', () => {
  /**
   * 这一组是 C8 验收时发现「总监报价中」没有录入入口后补的。
   * 当时 Q-030 卡死，「退回总监修改」也成了死胡同——测试全绿，产品走不通。
   */
  const ALL_STATUSES = [
    'Received',
    'Assigned',
    'DirectorQuoting',
    'AwaitingReview',
    'Approved',
    'KickoffSent',
    'Rejected',
  ] as const

  for (const status of ALL_STATUSES) {
    it(`${status} 状态下${TERMINAL_QUOTE_STATUSES.includes(status) ? '是终态，没有后续动作' : '至少有一个可用动作'}`, () => {
      const state = createDemoState()
      const patched: DemoState = {
        ...state,
        quoteCases: state.quoteCases.map((entry) =>
          entry.id === 'CQ-004' ? { ...entry, status } : entry,
        ),
      }
      const actions = availableActions(patched, 'CQ-004')
      if (TERMINAL_QUOTE_STATUSES.includes(status)) {
        expect(actions).toEqual([])
      } else {
        expect(actions.length).toBeGreaterThan(0)
      }
    })
  }

  it('被退回总监之后仍然能重新提交——退回不是死胡同', () => {
    const state = createDemoState()
    const rejected = reviewQuote(state, 'CQ-004', {
      decision: 'reject',
      actor: 'Leo',
      now: NOW,
      note: '人天偏高',
    })
    expect(availableActions(rejected, 'CQ-004')).toContain('quote')

    const resubmitted = submitQuoteVersion(rejected, 'CQ-004', {
      lines: NEW_LINES,
      scheduleImpactWorkdays: 2,
      submittedBy: 'Evan',
      actor: 'Evan',
      now: NOW,
    })
    expect(findCase(resubmitted, 'CQ-004').status).toBe('AwaitingReview')
    expect(activeVersion(resubmitted, 'CQ-004')!.version).toBe(2)
  })
})

describe('报价合计', () => {
  it('人天与金额按行累加，不是手填的总额', () => {
    const totals = quoteTotals({
      id: 'V',
      caseId: 'C',
      version: 1,
      submittedBy: 'Evan',
      submittedAt: NOW,
      lines: NEW_LINES,
      scheduleImpactWorkdays: 3,
    })
    expect(totals.personDays).toBeCloseTo(2.3, 5)
    expect(totals.amount).toBe(1.5 * 2000 + 0.8 * 2000)
  })
})

describe('版本机制', () => {
  it('总监再次提交产生新版本，旧版本作废但不删除', () => {
    const state = createDemoState()
    const before = activeVersion(state, 'CQ-004')!
    expect(before.version).toBe(1)

    const next = submitQuoteVersion(state, 'CQ-004', {
      lines: NEW_LINES,
      scheduleImpactWorkdays: 2,
      submittedBy: 'Evan',
      actor: 'Evan',
      now: NOW,
    })

    const after = activeVersion(next, 'CQ-004')!
    expect(after.version).toBe(2)
    // v1 还在，标记为已被取代——已复核的版本不允许静默覆盖
    const old = next.quoteVersions.find((entry) => entry.id === before.id)!
    expect(old.supersededAt).toBe(NOW)
    expect(old.lines).toEqual(before.lines)
  })

  it('新版本重新回到待复核，之前的复核结论不继承', () => {
    const state = createDemoState()
    const approved = reviewQuote(state, 'CQ-004', {
      decision: 'approve',
      actor: 'Leo',
      now: NOW,
      note: '同意',
    })
    expect(findCase(approved, 'CQ-004').status).toBe('Approved')

    const resubmitted = submitQuoteVersion(approved, 'CQ-004', {
      lines: NEW_LINES,
      scheduleImpactWorkdays: 2,
      submittedBy: 'Evan',
      actor: 'Evan',
      now: NOW,
    })
    expect(findCase(resubmitted, 'CQ-004').status).toBe('AwaitingReview')
    expect(activeVersion(resubmitted, 'CQ-004')!.review).toBeUndefined()
  })
})

describe('复核门禁', () => {
  it('缺人天或缺节点的报价行阻止进入复核', () => {
    const state = createDemoState()
    const broken: QuoteLine[] = [
      { ...NEW_LINES[0], personDays: 0 },
      { ...NEW_LINES[1], plannedFinish: undefined },
    ]

    const issues = reviewBlockingIssues({
      id: 'V',
      caseId: 'CQ-004',
      version: 9,
      submittedBy: 'Evan',
      submittedAt: NOW,
      lines: broken,
      scheduleImpactWorkdays: 1,
    })

    expect(issues.some((issue) => issue.includes('人天'))).toBe(true)
    expect(issues.some((issue) => issue.includes('节点'))).toBe(true)
  })

  it('没有报价行时不允许复核——空报价不是报价', () => {
    const issues = reviewBlockingIssues({
      id: 'V',
      caseId: 'CQ-004',
      version: 9,
      submittedBy: 'Evan',
      submittedAt: NOW,
      lines: [],
      scheduleImpactWorkdays: 0,
    })
    expect(issues.length).toBeGreaterThan(0)
  })

  it('被阻断时复核整体拒绝，案件状态不变', () => {
    const state = createDemoState()
    const broken = submitQuoteVersion(state, 'CQ-004', {
      lines: [{ ...NEW_LINES[0], personDays: 0 }],
      scheduleImpactWorkdays: 1,
      submittedBy: 'Evan',
      actor: 'Evan',
      now: NOW,
    })

    expect(() =>
      reviewQuote(broken, 'CQ-004', { decision: 'approve', actor: 'Leo', now: NOW, note: '' }),
    ).toThrow(QuoteBlocked)
    expect(findCase(broken, 'CQ-004').status).toBe('AwaitingReview')
  })
})

describe('组长与 BD 同人只确认一次', () => {
  it('待办按人合并，不因两个角色生成两条', () => {
    const state = createDemoState()
    const todos = reviewTodos(state)
    const forCase = todos.filter((todo) => todo.caseId === 'CQ-004')

    expect(forCase.length).toBe(1)
    // 但两个角色都要留在待办上，审计才说得清是谁以什么身份批的
    expect(forCase[0].roles).toEqual(expect.arrayContaining(['组长', 'BD']))
  })

  it('一次复核写一条审计，但审计里两个角色都在', () => {
    const state = createDemoState()
    const next = reviewQuote(state, 'CQ-004', {
      decision: 'approve',
      actor: 'Leo',
      now: NOW,
      note: '同意追加',
    })

    const audits = next.auditEvents.filter(
      (event) => event.targetId === 'CQ-004' && event.action.includes('复核'),
    )
    expect(audits.length).toBe(1)
    expect(audits[0].actor).toContain('组长')
    expect(audits[0].actor).toContain('BD')

    const review = activeVersion(next, 'CQ-004')!.review!
    expect(review.roles).toEqual(expect.arrayContaining(['组长', 'BD']))
  })

  it('复核人只担任一个角色时，审计里也只写一个角色', () => {
    const state = createDemoState()
    const todos = reviewTodos(state).filter((todo) => todo.caseId === 'Q-031')
    expect(todos.length).toBe(1)
    expect(todos[0].roles).toEqual(['BD'])
  })
})

describe('开工门禁', () => {
  it('未复核通过不允许发开工邮件', () => {
    const state = createDemoState()
    const issues = kickoffBlockingIssues(state, 'CQ-004')
    expect(issues.some((issue) => issue.includes('复核'))).toBe(true)

    expect(() => sendKickoff(state, 'CQ-004', { actor: ACTOR, now: NOW, via: 'Outlook' })).toThrow(
      QuoteBlocked,
    )
  })

  /**
   * 复核通过之后还隔着两步：BD 报给客户、客户回话。
   * 这两步以前不存在，复核通过就能开工——那是把公司内部认可当成了客户认可。
   */
  it('复核通过还不能开工，要先报客户、再等客户点头', () => {
    const state = createDemoState()
    const fingerprint = scheduleFingerprint(state)

    const approved = reviewQuote(state, 'CQ-004', {
      decision: 'approve',
      actor: 'Leo',
      now: NOW,
      note: '同意',
    })
    expect(kickoffBlockingIssues(approved, 'CQ-004')).toContain('复核通过了，但还没报给客户')

    const sent = sendToClient(approved, 'CQ-004', { actor: 'Leo（BD）', now: NOW, via: 'Outlook' })
    expect(kickoffBlockingIssues(sent, 'CQ-004')).toContain('还在等客户确认，客户没点头不能开工')

    const accepted = recordClientReply(sent, 'CQ-004', 'accept', {
      actor: 'Leo（BD）',
      now: NOW,
      via: 'Outlook',
    })
    expect(kickoffBlockingIssues(accepted, 'CQ-004')).toEqual([])

    // 走完这三步，排期依然一个字节都没动——真正改排期的只有开工那一下
    expect(scheduleFingerprint(accepted)).toBe(fingerprint)
  })

  it('复核驳回后不能开工，且退回总监重报', () => {
    const state = createDemoState()
    const rejected = reviewQuote(state, 'CQ-004', {
      decision: 'reject',
      actor: 'Leo',
      now: NOW,
      note: '人天偏高，重新评估',
    })

    expect(findCase(rejected, 'CQ-004').status).toBe('DirectorQuoting')
    expect(kickoffBlockingIssues(rejected, 'CQ-004').length).toBeGreaterThan(0)
  })
})

describe('追加报价开工的业务落点', () => {
  it('开工前只冻结受影响资产，其余资产照常制作', () => {
    const state = createDemoState()
    const stages = state.projects.flatMap((p) => p.assets).flatMap((a) => a.stages)

    const frozen = stages.filter((stage) => stage.flags.includes('WaitingChangeQuote'))
    expect(frozen.length).toBeGreaterThan(0)
    expect(frozen.every((stage) => stage.assetId === 'MECH-01')).toBe(true)

    // 同项目下的 MECH-02 与其他项目都不许被冻
    expect(stages.filter((s) => s.assetId === 'MECH-02').every((s) => !s.flags.includes('WaitingChangeQuote'))).toBe(true)
    expect(stages.filter((s) => s.assetId.startsWith('PROP')).every((s) => !s.flags.includes('WaitingChangeQuote'))).toBe(true)
  })

  it('发出变更开工邮件后：受影响资产解冻、排期更新、基准不动', () => {
    const state = createDemoState()
    const baselineBefore = state.projects
      .flatMap((p) => p.assets)
      .flatMap((a) => a.stages)
      .map((s) => [s.id, s.baselineStart, s.baselineFinish])

    const accepted = throughClient(state, 'CQ-004')
    const started = sendKickoff(accepted, 'CQ-004', { actor: ACTOR, now: NOW, via: 'Outlook' })

    const stages = started.projects.flatMap((p) => p.assets).flatMap((a) => a.stages)
    expect(stages.every((stage) => !stage.flags.includes('WaitingChangeQuote'))).toBe(true)

    // 报价行给出的节点写入当前计划
    const high = stages.find((s) => s.id === 'MECH-01/3D_HIGH')!
    const line = activeVersion(started, 'CQ-004')!.lines.find((l) => l.stageCode === '3D_HIGH')!
    expect(high.currentStart).toBe(line.plannedStart)
    expect(high.currentFinish).toBe(line.plannedFinish)

    // 基准从头到尾没被写过
    const baselineAfter = stages.map((s) => [s.id, s.baselineStart, s.baselineFinish])
    expect(baselineAfter).toEqual(baselineBefore)

    expect(findCase(started, 'CQ-004').status).toBe('KickoffSent')
    expect(findCase(started, 'CQ-004').kickoffSentBy).toBe(ACTOR)
  })

  it('开工同时生成一条排期修订，能在甘特的修订历史里查到', () => {
    const state = createDemoState()
    const accepted = throughClient(state, 'CQ-004')
    const started = sendKickoff(accepted, 'CQ-004', { actor: ACTOR, now: NOW, via: 'Outlook' })

    const revision = started.revisions.at(-1)!
    expect(revision.reason).toBe('scope-change')
    expect(revision.changes.length).toBeGreaterThan(0)
    expect(revision.changes.every((change) => change.stageId.startsWith('MECH-01/'))).toBe(true)
  })

  it('开工邮件只能发一次，重复发送被拒绝', () => {
    const state = createDemoState()
    const accepted = throughClient(state, 'CQ-004')
    const started = sendKickoff(accepted, 'CQ-004', { actor: ACTOR, now: NOW, via: 'Outlook' })

    expect(() => sendKickoff(started, 'CQ-004', { actor: ACTOR, now: NOW, via: 'Outlook' })).toThrow(
      QuoteBlocked,
    )
  })

  it('开工是原子事务：报价行指向不存在的阶段时整体拒绝', () => {
    const state = createDemoState()
    const broken = submitQuoteVersion(state, 'CQ-004', {
      lines: [
        {
          ...NEW_LINES[0],
          assetId: 'MECH-01',
          // MECH-01 没有这个阶段编码的资产组合是不存在的组合
          stageCode: '2D_SKETCH',
        },
      ],
      scheduleImpactWorkdays: 1,
      submittedBy: 'Evan',
      actor: 'Evan',
      now: NOW,
    })
    const approved = reviewQuote(broken, 'CQ-004', {
      decision: 'approve',
      actor: 'Leo',
      now: NOW,
      note: '同意',
    })
    const fingerprint = scheduleFingerprint(approved)

    expect(() => sendKickoff(approved, 'CQ-004', { actor: ACTOR, now: NOW, via: 'Outlook' })).toThrow(
      QuoteBlocked,
    )
    expect(scheduleFingerprint(approved)).toBe(fingerprint)
    expect(findCase(approved, 'CQ-004').status).toBe('Approved')
  })
})

describe('原报价永不覆盖', () => {
  it('结项汇总 = 首次报价 + 全部已开工的追加报价', () => {
    const state = createDemoState()
    const accepted = throughClient(state, 'CQ-004')
    const started = sendKickoff(accepted, 'CQ-004', { actor: ACTOR, now: NOW, via: 'Outlook' })

    const initial = started.quoteCases.find((c) => c.projectCode === 'NST_A_3D_B24' && c.kind === 'initial')!
    const initialAmount = quoteTotals(activeVersion(started, initial.id)!).amount
    const changeAmount = quoteTotals(activeVersion(started, 'CQ-004')!).amount

    expect(initialAmount).toBeGreaterThan(0)
    expect(changeAmount).toBeGreaterThan(0)
    // 首次报价的版本没有被追加报价改写
    expect(activeVersion(started, initial.id)!.version).toBe(1)
    expect(activeVersion(started, initial.id)!.supersededAt).toBeUndefined()
  })
})

/**
 * 客户环节与建项。
 *
 * 验收时用户把真实流程讲清楚了：
 * BD 需求 → 需求入库 → 总监报价 → 组长复核 → **给客户** → **BD 回复客户确认**
 * → 才算正式接入项目，发开工通知。
 *
 * 原实现缺了中间两步，「正式接入项目」也从来没真发生过。
 */
describe('报给客户与客户答复', () => {
  it('没复核就报客户会被拒绝', () => {
    const state = createDemoState()
    expect(() =>
      sendToClient(state, 'CQ-004', { actor: 'Leo（BD）', now: NOW, via: 'Outlook' }),
    ).toThrow(QuoteBlocked)
  })

  it('还没报客户就谈客户答复，同样被拒绝', () => {
    const state = createDemoState()
    const approved = reviewQuote(state, 'CQ-004', {
      decision: 'approve',
      actor: 'Leo',
      now: NOW,
      note: '同意',
    })
    expect(() =>
      recordClientReply(approved, 'CQ-004', 'accept', { actor: 'Leo（BD）', now: NOW, via: 'Outlook' }),
    ).toThrow(QuoteBlocked)
  })

  it('报客户与客户答复都写审计，并写明工作台没发信', () => {
    const state = createDemoState()
    const accepted = throughClient(state, 'CQ-004')
    const actions = accepted.auditEvents.slice(-2).map((entry) => entry.action)

    expect(actions).toEqual(['BD 已将报价报给客户', '客户确认接受报价'])
    expect(accepted.auditEvents.at(-2)?.reason).toContain('工作台未执行发送')
  })

  /** 客户不接受是**终止**，不是退回总监重报——重报是另一件事 */
  it('客户不接受必须写原因，写了才终止案件', () => {
    const state = createDemoState()
    const approved = reviewQuote(state, 'CQ-004', {
      decision: 'approve',
      actor: 'Leo',
      now: NOW,
      note: '同意',
    })
    const sent = sendToClient(approved, 'CQ-004', { actor: 'Leo（BD）', now: NOW, via: 'Outlook' })

    expect(() =>
      recordClientReply(sent, 'CQ-004', 'decline', { actor: 'Leo（BD）', now: NOW, via: 'Outlook' }),
    ).toThrow(QuoteBlocked)

    const declined = recordClientReply(sent, 'CQ-004', 'decline', {
      actor: 'Leo（BD）',
      now: NOW,
      via: 'Outlook',
      note: '价格超预算 30%',
    })
    expect(findCase(declined, 'CQ-004').status).toBe('Rejected')
    expect(findCase(declined, 'CQ-004').clientReplyNote).toBe('价格超预算 30%')
  })

  /** `Rejected` 以前在类型里存在却永远到不了，这条路径是它唯一的入口 */
  it('每个非终态都有出路，Rejected 现在真的可达', () => {
    const state = createDemoState()
    for (const quoteCase of state.quoteCases) {
      if (TERMINAL_QUOTE_STATUSES.includes(quoteCase.status)) continue
      expect(
        availableActions(state, quoteCase.id).length,
        `${quoteCase.id}（${quoteCase.status}）没有任何可用动作`,
      ).toBeGreaterThan(0)
    }

    const approved = reviewQuote(state, 'CQ-004', {
      decision: 'approve',
      actor: 'Leo',
      now: NOW,
      note: '同意',
    })
    const sent = sendToClient(approved, 'CQ-004', { actor: 'Leo（BD）', now: NOW, via: 'Outlook' })
    const declined = recordClientReply(sent, 'CQ-004', 'decline', {
      actor: 'Leo（BD）',
      now: NOW,
      via: 'Outlook',
      note: '预算不够',
    })
    expect(findCase(declined, 'CQ-004').status).toBe('Rejected')
  })
})

describe('客户确认后才正式建项', () => {
  const CASE = 'Q-029'

  it('种子里 Q-029 的项目此刻还不存在——它只是个提议的批次编号', () => {
    const state = createDemoState()
    expect(findCase(state, CASE).status).toBe('ClientAccepted')
    expect(state.projects.some((p) => p.code === 'AUR_B_3D_B34')).toBe(false)
    // 客户已经点头，所以开工没有任何阻断
    expect(kickoffBlockingIssues(state, CASE)).toEqual([])
  })

  it('发出开工通知 → 项目、资产、阶段一次性建出来', () => {
    const state = createDemoState()
    const before = state.projects.length
    const started = sendKickoff(state, CASE, { actor: ACTOR, now: NOW, via: 'Outlook' })

    expect(started.projects).toHaveLength(before + 1)
    const project = started.projects.find((p) => p.code === 'AUR_B_3D_B34')!
    expect(project.client).toBe('Aurora Interactive')
    expect(project.status).toBe('InProduction')
    expect(project.assets.length).toBeGreaterThan(0)

    // 阶段就是报价行——报的是什么，做的就是什么
    const stages = project.assets.flatMap((asset) => asset.stages)
    const lines = activeVersion(started, CASE)!.lines
    expect(stages).toHaveLength(lines.length)
  })

  it('报价节点同时成为基准和当前计划，基准从此不再被改写', () => {
    const state = createDemoState()
    const started = sendKickoff(state, CASE, { actor: ACTOR, now: NOW, via: 'Outlook' })

    const project = started.projects.find((p) => p.code === 'AUR_B_3D_B34')!
    const lines = activeVersion(started, CASE)!.lines
    for (const stage of project.assets.flatMap((asset) => asset.stages)) {
      const line = lines.find((entry) => entry.stageCode === stage.code && entry.assetId === stage.assetId)!
      expect(stage.baselineStart).toBe(line.plannedStart)
      expect(stage.baselineFinish).toBe(line.plannedFinish)
      expect(stage.currentStart).toBe(stage.baselineStart)
      expect(stage.currentFinish).toBe(stage.baselineFinish)
      // 新建项目的阶段都还没开工
      expect(stage.status).toBe('NotStarted')
    }
  })

  /**
   * 新项目**不该有排期修订**。修订记的是「相对基准改了什么」，
   * 而新项目的基准就是这份报价单自己，没有前一版可比——
   * 硬记一条会出现 `08-17 → 08-17（+15 工作日）` 这种自己改自己的假修订。
   */
  it('新建的项目没有排期修订，只有建项审计', () => {
    const state = createDemoState()
    const before = state.revisions.length
    const started = sendKickoff(state, CASE, { actor: ACTOR, now: NOW, via: 'Outlook' })

    expect(started.revisions).toHaveLength(before)
    expect(started.revisions.some((entry) => entry.projectCode === 'AUR_B_3D_B34')).toBe(false)
  })

  it('首次开工的通知草稿不叫「变更开工」', () => {
    const state = createDemoState()
    const started = sendKickoff(state, CASE, { actor: ACTOR, now: NOW, via: 'Outlook' })

    const draft = started.notificationDrafts.at(-1)!
    expect(draft.subject).toContain('正式开工')
    expect(draft.subject).not.toContain('变更开工')
    expect(draft.status).toBe('draft')
  })

  it('建项写审计，说清是哪张报价单生出来的', () => {
    const state = createDemoState()
    const started = sendKickoff(state, CASE, { actor: ACTOR, now: NOW, via: 'Outlook' })

    const audit = started.auditEvents.find((entry) => entry.action === '客户确认后正式建项')!
    expect(audit.targetId).toBe('AUR_B_3D_B34')
    expect(audit.reason).toContain('Q-029')
  })

  it('客户还没确认时不建项，且整体不留任何副作用', () => {
    const base = createDemoState()
    const state: DemoState = {
      ...base,
      quoteCases: base.quoteCases.map((entry) =>
        entry.id !== CASE ? entry : { ...entry, status: 'SentToClient' as const },
      ),
    }

    expect(() => sendKickoff(state, CASE, { actor: ACTOR, now: NOW, via: 'Outlook' })).toThrow(
      QuoteBlocked,
    )
    expect(state.projects.some((p) => p.code === 'AUR_B_3D_B34')).toBe(false)
  })
})

/**
 * 直接录入需求。
 *
 * 需求不是只能从收件箱进来——BD 当面说一句、电话里谈定的，PM 就该能直接录。
 * 验收时指出：报价与变更模块里没有任何新建入口，只有案件内部的「录入总监报价」。
 */
describe('直接录入报价需求', () => {
  const BASE = { actor: ACTOR, now: NOW }

  it('录首次需求：建出停在总监报价中的案件，且不带任何报价版本', () => {
    const state = createDemoState()
    const before = state.quoteCases.length

    const next = createQuoteCase(state, {
      ...BASE,
      kind: 'initial',
      client: 'Northstar Studio',
      projectCode: 'NST_E_3D_B40',
      title: '守卫兵种 3 套',
      requirement: 'BD 当面确认：3 套守卫兵种，含中模到 LOD。',
    })

    expect(next.quoteCases).toHaveLength(before + 1)
    const created = next.quoteCases.at(-1)!
    expect(created.status).toBe('DirectorQuoting')
    expect(created.kind).toBe('initial')
    expect(created.activeVersionId).toBeUndefined()
    // 录需求 ≠ 建项目：批次编号此刻只是个提议
    expect(next.projects.some((p) => p.code === 'NST_E_3D_B40')).toBe(false)
  })

  it('批次编号不合规范时说清规范，不含糊地拒绝', () => {
    const state = createDemoState()
    expect(() =>
      createQuoteCase(state, {
        ...BASE,
        kind: 'initial',
        client: 'Northstar Studio',
        projectCode: 'LYS_X',
        title: '随手写的',
        requirement: '随手写的',
      }),
    ).toThrow(/不符合规范/)
  })

  it('同一个批次编号不能开两张首次报价', () => {
    const state = createDemoState()
    expect(() =>
      createQuoteCase(state, {
        ...BASE,
        kind: 'initial',
        client: 'Northstar Studio',
        // 种子里已经有一张 Q-030 占着这个编号
        projectCode: 'HLC_C_2D_B20',
        title: '重复立案',
        requirement: '重复立案',
      }),
    ).toThrow(QuoteBlocked)
  })

  it('已经是正式项目的编号不能再走首次报价', () => {
    const state = createDemoState()
    expect(() =>
      createQuoteCase(state, {
        ...BASE,
        kind: 'initial',
        client: 'Northstar Studio',
        projectCode: 'NST_A_3D_B24',
        title: '追加需求走错门',
        requirement: '追加需求走错门',
      }),
    ).toThrow(/已经是正式项目/)
  })

  it('客户与需求描述都不能空——空着的案件总监没法报价', () => {
    const state = createDemoState()
    for (const patch of [{ client: '  ' }, { requirement: '  ' }, { title: ' ' }]) {
      expect(() =>
        createQuoteCase(state, {
          ...BASE,
          kind: 'initial',
          client: 'Northstar Studio',
          projectCode: 'NST_E_3D_B40',
          title: '守卫兵种 3 套',
          requirement: '3 套守卫兵种',
          ...patch,
        }),
      ).toThrow(QuoteBlocked)
    }
  })

  it('录追加报价：必须挂在已存在的项目上，并指明受影响资产', () => {
    const state = createDemoState()

    expect(() =>
      createQuoteCase(state, {
        ...BASE,
        kind: 'change',
        projectCode: 'NST_E_3D_B40',
        title: '挂在不存在的项目上',
        requirement: '挂在不存在的项目上',
        affectedAssetIds: ['MECH-01'],
      }),
    ).toThrow(/不是正式项目/)

    expect(() =>
      createQuoteCase(state, {
        ...BASE,
        kind: 'change',
        projectCode: 'NST_A_3D_B24',
        title: '没说改哪个资产',
        requirement: '没说改哪个资产',
        affectedAssetIds: [],
      }),
    ).toThrow(QuoteBlocked)

    const next = createQuoteCase(state, {
      ...BASE,
      kind: 'change',
      projectCode: 'NST_A_3D_B24',
      title: '载具加一套涂装',
      requirement: '客户想给 MECH-02 加一套涂装。',
      affectedAssetIds: ['MECH-02'],
    })
    const created = next.quoteCases.at(-1)!
    expect(created.kind).toBe('change')
    // 客户从项目上取，不用人再填一遍
    expect(created.client).toBe('Northstar Studio')
    expect(created.affectedAssetIds).toEqual(['MECH-02'])
  })

  it('受影响资产必须真的属于那个项目', () => {
    const state = createDemoState()
    expect(() =>
      createQuoteCase(state, {
        ...BASE,
        kind: 'change',
        projectCode: 'NST_A_3D_B24',
        title: '资产写串了',
        requirement: '资产写串了',
        affectedAssetIds: ['RELAY-01'],
      }),
    ).toThrow(/不属于/)
  })

  it('录入写审计，且不动任何正式排期', () => {
    const state = createDemoState()
    const fingerprint = scheduleFingerprint(state)
    const next = createQuoteCase(state, {
      ...BASE,
      kind: 'initial',
      client: 'Northstar Studio',
      projectCode: 'NST_E_3D_B40',
      title: '守卫兵种 3 套',
      requirement: '3 套守卫兵种',
    })

    expect(scheduleFingerprint(next)).toBe(fingerprint)
    const audit = next.auditEvents.at(-1)!
    expect(audit.targetKind).toBe('QuoteCase')
    expect(audit.action).toContain('录入')
  })

  /** 新案件停在「总监报价中」，availableActions 必须给得出下一步 */
  it('新建的案件不是死胡同', () => {
    const state = createDemoState()
    const next = createQuoteCase(state, {
      ...BASE,
      kind: 'initial',
      client: 'Northstar Studio',
      projectCode: 'NST_E_3D_B40',
      title: '守卫兵种 3 套',
      requirement: '3 套守卫兵种',
    })
    const created = next.quoteCases.at(-1)!
    expect(availableActions(next, created.id)).toContain('quote')
  })
})

/**
 * 待立案的变更单。
 *
 * 反馈判为范围外时创建变更单并冻结阶段，但**不会自动建报价案件**。
 * 原来左侧列表只读 `quoteCases`，于是出现「阶段冻着、指标数到了它、
 * 列表里却没有一行能点」——验收时正是这么问的：冻结中的具体去哪看。
 */
describe('待立案的变更单要能看见', () => {
  it('判为范围外后，它出现在待立案清单里', () => {
    const state = createDemoState()
    const item = state.feedbackBatches
      .flatMap((batch) => batch.items)
      .find((entry) => entry.status === 'NeedsClassification')!

    const next = classifyOutOfScope(state, item.id, NOW, ACTOR)
    const pending = pendingChangeRequests(next)

    expect(pending.some((row) => row.request.sourceFeedbackItemId === item.id)).toBe(true)
    const row = pending.find((entry) => entry.request.sourceFeedbackItemId === item.id)!
    // 冻了哪个阶段要一起给出来，不然还得自己去甘特上找
    expect(row.frozenStages.length).toBeGreaterThan(0)
    expect(row.frozenStages[0].assetId).toBe(item.assetId)
    // **只认这条变更单冻的那个阶段**。按「项目 + 资产」筛会把同资产上
    // 别的变更单冻的阶段也算进来，界面上就成了张冠李戴
    expect(row.frozenStages.map((stage) => stage.stageId)).toEqual([item.stageId])
  })

  it('已经立了案的变更单不再出现在待立案里', () => {
    const state = createDemoState()
    // 种子里的 CQ-004 已经有配对的报价案件
    expect(pendingChangeRequests(state).some((row) => row.request.id === 'CQ-004')).toBe(false)
  })

  it('撤销范围外判定后，它从待立案里消失', () => {
    const state = createDemoState()
    const item = state.feedbackBatches
      .flatMap((batch) => batch.items)
      .find((entry) => entry.status === 'NeedsClassification')!

    const classified = classifyOutOfScope(state, item.id, NOW, ACTOR)
    expect(pendingChangeRequests(classified)).toHaveLength(1)

    const undone = reclassifyFeedback(classified, item.id, NOW, ACTOR)
    expect(pendingChangeRequests(undone)).toHaveLength(0)
  })

  /** 指标数的是阶段，标题却写「资产」——同一资产冻两个阶段时就对不上 */
  it('冻结统计按资产去重，与按阶段计数区分开', () => {
    const state = createDemoState()
    const summary = frozenSummary(state)

    const stages = state.projects
      .flatMap((p) => p.assets)
      .flatMap((a) => a.stages)
      .filter((s) => s.flags.includes('WaitingChangeQuote'))

    expect(summary.stages).toBe(stages.length)
    expect(summary.assets).toBe(new Set(stages.map((s) => s.assetId)).size)
    expect(summary.assets).toBeLessThanOrEqual(summary.stages)
  })
})

/**
 * 「等谁」。
 *
 * 验收指出：把案件推过复核之后「处理中」就空了，而真正等 PM 动手的
 * （报给客户、发开工通知）跑到了「客户环节」——那个名字读不出「该我做」。
 * 按状态区间分桶天然会漏，改成按**责任在谁**分。
 */
describe('每条待办都说清等谁', () => {
  it('每个未终结的案件都给得出等谁和下一步', () => {
    const state = createDemoState()
    for (const quoteCase of state.quoteCases) {
      if (TERMINAL_QUOTE_STATUSES.includes(quoteCase.status)) continue
      const waiting = quoteWaitingOn(state, quoteCase.id)!
      expect(waiting.label, `${quoteCase.id} 没说等谁`).toBeTruthy()
      expect(waiting.next, `${quoteCase.id} 没说下一步`).toBeTruthy()
    }
  })

  it('终态不再等任何人', () => {
    const base = createDemoState()
    const started = base.quoteCases.find((entry) => entry.status === 'KickoffSent')!
    expect(quoteWaitingOn(base, started.id)).toBeUndefined()
  })

  it('责任在 PM 的几步都标成等我', () => {
    const state = createDemoState()
    const accepted = state.quoteCases.find((entry) => entry.status === 'ClientAccepted')!
    expect(quoteWaitingOn(state, accepted.id)?.mine).toBe(true)
  })

  it('等总监、等复核、等客户都不算等我', () => {
    const state = createDemoState()
    for (const status of ['DirectorQuoting', 'AwaitingReview', 'SentToClient'] as const) {
      const found = state.quoteCases.find((entry) => entry.status === status)
      if (!found) continue
      expect(quoteWaitingOn(state, found.id)?.mine, `${status} 不该算等我`).toBe(false)
    }
  })

  /** 待办清单必须**跨全部状态**收集，按状态区间分桶就是上次漏掉的原因 */
  it('待我处理汇总了全部责任在我的事，含待立案的变更单', () => {
    const state = createDemoState()
    const item = state.feedbackBatches
      .flatMap((batch) => batch.items)
      .find((entry) => entry.status === 'NeedsClassification')!
    const next = classifyOutOfScope(state, item.id, NOW, ACTOR)

    const mine = quoteTodoList(next).filter((row) => row.mine)
    expect(mine.some((row) => row.kind === 'change-request')).toBe(true)
    expect(mine.every((row) => row.next)).toBe(true)
  })

  it('待办清单不含已终结的案件', () => {
    const rows = quoteTodoList(createDemoState())
    for (const row of rows) {
      if (row.kind !== 'quote-case') continue
      expect(TERMINAL_QUOTE_STATUSES).not.toContain(row.quoteCase!.status)
    }
  })

  /** 冻结的解法要说得出来，否则「资产冻结中 1」就是个没人知道怎么消的告警 */
  it('冻结的阶段能指回让它解冻的那条待办', () => {
    const state = createDemoState()
    const summary = frozenSummary(state)
    expect(summary.stages).toBeGreaterThan(0)
    expect(summary.unfreezeVia.length).toBeGreaterThan(0)
    for (const row of summary.unfreezeVia) {
      expect(row.caseId || row.changeRequestId).toBeTruthy()
      expect(row.next).toBeTruthy()
    }
  })
})
