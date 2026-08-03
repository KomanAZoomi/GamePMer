import { describe, expect, it } from 'vitest'

import { createDemoState } from '../data/seed'
import { DEMO_TODAY } from './clock'
import {
  CLOSEOUT_GATE_ORDER,
  CloseoutBlocked,
  archiveCase,
  assetsApproved,
  billingPackage,
  closeoutCase,
  closeoutReadyProjects,
  completeGate,
  currentGate,
  gateBlockingIssues,
  gateState,
  openCloseout,
  reopenGate,
} from './closeout'
import type { CloseoutGateCode, DemoState, EvidenceRef } from './model'

const ACTOR = 'Brandon'
const NOW = `${DEMO_TODAY}T16:00:00+08:00`

const officialEmail = (label: string): EvidenceRef => ({
  id: `EV-${label}`,
  kind: 'email',
  label,
  locator: `RE: ${label}`,
  receivedAt: NOW,
  from: 'someone@studio.example',
})

const chatScreenshot: EvidenceRef = {
  id: 'EV-chat',
  kind: 'screenshot',
  label: '企微聊天截图',
  locator: 'wechat_20260727.png',
  receivedAt: NOW,
}

/** 正式业务数据指纹。结项流程只该改结项案件本身。 */
function formalFingerprint(state: DemoState): string {
  return JSON.stringify({
    projects: state.projects,
    quoteCases: state.quoteCases,
    quoteVersions: state.quoteVersions,
  })
}

describe('门禁串行，不能跳步', () => {
  it('五道门禁顺序固定', () => {
    expect(CLOSEOUT_GATE_ORDER).toEqual([
      'assets-approved',
      'final-package',
      'client-final',
      'it-backup',
      'billing-notified',
    ])
  })

  it('前置门禁没完成时，后面的门禁被阻断并指名道姓说缺哪一步', () => {
    const state = createDemoState()
    // CO-011 停在 IT 备份，出账那一步必须被前置卡住
    const issues = gateBlockingIssues(state, 'CO-011', 'billing-notified')
    expect(issues.some((issue) => issue.includes('IT 剪切备份'))).toBe(true)

    expect(() =>
      completeGate(state, 'CO-011', 'billing-notified', {
        actor: ACTOR,
        now: NOW,
        evidence: [officialEmail('出账通知')],
        note: '',
      }),
    ).toThrow(CloseoutBlocked)
  })

  it('跨两步更不行——不能从客户确认直接跳到出账', () => {
    const state = createDemoState()
    const issues = gateBlockingIssues(state, 'CO-024', 'billing-notified')
    expect(issues.length).toBeGreaterThan(0)
  })

  it('被阻断时正式业务数据一个字节都不变', () => {
    const state = createDemoState()
    const fingerprint = formalFingerprint(state)

    expect(() =>
      completeGate(state, 'CO-011', 'billing-notified', {
        actor: ACTOR,
        now: NOW,
        evidence: [],
        note: '',
      }),
    ).toThrow(CloseoutBlocked)

    expect(formalFingerprint(state)).toBe(fingerprint)
    expect(closeoutCase(state, 'CO-011')!.status).toBe('AwaitingIT')
  })
})

describe('资产验收门禁由事实推导，不靠手工打勾', () => {
  it('还有阶段没验收时，第一道门禁就过不去', () => {
    const state = createDemoState()
    const issues = gateBlockingIssues(state, 'CO-024', 'assets-approved')

    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some((issue) => /还有 \d+ 个阶段未验收/.test(issue))).toBe(true)
  })

  it('全部阶段已验收的项目，第一道门禁自动算完成', () => {
    const state = createDemoState()
    expect(gateState(state, 'CO-011', 'assets-approved')).toBe('done')
  })
})

describe('证据门禁：聊天截图不能替代正式邮件', () => {
  it('客户最终确认只认正式邮件，截图会被拒绝', () => {
    const state = createDemoState()
    // 先把 CO-011 退回到等待客户确认，用来验证证据类型门禁
    const rolled = reopenGate(state, 'CO-011', 'client-final', {
      actor: ACTOR,
      now: NOW,
      reason: '客户说要重新确认一次',
    })

    expect(() =>
      completeGate(rolled, 'CO-011', 'client-final', {
        actor: ACTOR,
        now: NOW,
        evidence: [chatScreenshot],
        note: '客户在群里说可以了',
      }),
    ).toThrow(CloseoutBlocked)

    // 门禁本身是开着的（前置都完成了），是这份证据不合格
    expect(gateBlockingIssues(rolled, 'CO-011', 'client-final')).toEqual([])
    const issues = gateBlockingIssues(rolled, 'CO-011', 'client-final', [chatScreenshot])
    expect(issues.some((issue) => issue.includes('正式邮件'))).toBe(true)
  })

  it('给了正式邮件就能完成，并留下证据', () => {
    const state = createDemoState()
    const rolled = reopenGate(state, 'CO-011', 'client-final', {
      actor: ACTOR,
      now: NOW,
      reason: '重新确认',
    })

    const next = completeGate(rolled, 'CO-011', 'client-final', {
      actor: ACTOR,
      now: NOW,
      evidence: [officialEmail('客户最终确认')],
      note: '客户邮件确认最终包',
    })

    const gate = closeoutCase(next, 'CO-011')!.gates.find((g) => g.code === 'client-final')!
    expect(gate.completedAt).toBe(NOW)
    expect(gate.completedBy).toBe(ACTOR)
    expect(gate.evidence.map((e) => e.kind)).toContain('email')
  })

  it('IT 备份同样只认 IT 的正式回执', () => {
    const state = createDemoState()
    expect(gateBlockingIssues(state, 'CO-011', 'it-backup')).toEqual([])

    expect(() =>
      completeGate(state, 'CO-011', 'it-backup', {
        actor: ACTOR,
        now: NOW,
        evidence: [chatScreenshot],
        note: 'IT 在群里说弄好了',
      }),
    ).toThrow(CloseoutBlocked)
  })
})

describe('IT 备份完成后解锁出账', () => {
  it('登记 IT 回执 → 状态进入可出账，出账门禁解禁', () => {
    const state = createDemoState()
    const next = completeGate(state, 'CO-011', 'it-backup', {
      actor: ACTOR,
      now: NOW,
      evidence: [officialEmail('IT 备份完成回执')],
      note: '归档目标 \\\\ARCHIVE\\2026\\AUR_A_3D_B11',
    })

    expect(closeoutCase(next, 'CO-011')!.status).toBe('ReadyToBill')
    expect(gateBlockingIssues(next, 'CO-011', 'billing-notified')).toEqual([])
    expect(currentGate(next, 'CO-011')?.code).toBe('billing-notified')
  })

  it('通知 BD 出账只生成草稿，不出现「已发送」', () => {
    const state = createDemoState()
    const backed = completeGate(state, 'CO-011', 'it-backup', {
      actor: ACTOR,
      now: NOW,
      evidence: [officialEmail('IT 回执')],
      note: '',
    })
    const notified = completeGate(backed, 'CO-011', 'billing-notified', {
      actor: ACTOR,
      now: NOW,
      evidence: [officialEmail('BD 出账通知')],
      note: '',
    })

    const drafts = notified.notificationDrafts.filter(
      (draft) => draft.sourceKind === 'closeout' && draft.sourceId === 'CO-011',
    )
    expect(drafts.length).toBeGreaterThan(0)
    expect(drafts.every((draft) => draft.status === 'draft')).toBe(true)
    expect(closeoutCase(notified, 'CO-011')!.status).toBe('BillingNotified')
  })

  it('每完成一道门禁写一条审计，带操作人与证据', () => {
    const state = createDemoState()
    const next = completeGate(state, 'CO-011', 'it-backup', {
      actor: ACTOR,
      now: NOW,
      evidence: [officialEmail('IT 回执')],
      note: '',
    })
    const audits = next.auditEvents.filter((event) => event.targetId === 'CO-011')
    expect(audits).toHaveLength(1)
    expect(audits[0].actor).toBe(ACTOR)
    expect(audits[0].after).toBe('it-backup')
  })
})

describe('出账资料包', () => {
  it('汇总首次报价与全部已开工的追加报价', () => {
    const state = createDemoState()
    const pack = billingPackage(state, 'CO-024')

    expect(pack.quoteRows.some((row) => row.quoteCase.id === 'Q-021')).toBe(true)
    // CQ-004 还没开工，不该计入应结
    expect(pack.total).toBe(42000)
    expect(pack.pendingRows.some((row) => row.quoteCase.id === 'CQ-004')).toBe(true)
  })

  it('列出还缺哪几份证据，缺一份就不算齐', () => {
    const state = createDemoState()
    const pack = billingPackage(state, 'CO-011')

    expect(pack.ready).toBe(false)
    expect(pack.missing.some((item) => item.includes('IT'))).toBe(true)
  })

  it('证据齐了才算可出账', () => {
    const state = createDemoState()
    const backed = completeGate(state, 'CO-011', 'it-backup', {
      actor: ACTOR,
      now: NOW,
      evidence: [officialEmail('IT 回执')],
      note: '',
    })
    const pack = billingPackage(backed, 'CO-011')
    expect(pack.ready).toBe(true)
    expect(pack.missing).toEqual([])
  })
})

describe('工作台不搬文件', () => {
  it('路径统一读「文件与归档」的登记簿，结项案件自己不存路径', () => {
    const state = createDemoState()
    const item = closeoutCase(state, 'CO-011')!

    // 两处各存一套路径迟早对不上，所以结项案件上根本没有 paths 字段
    expect(Object.keys(item)).not.toContain('paths')

    const registered = state.projectPaths.filter((entry) => entry.projectCode === item.projectCode)
    expect(registered.some((entry) => entry.kind === 'final')).toBe(true)
    expect(registered.some((entry) => entry.kind === 'archive')).toBe(true)
  })

  it('出账草稿里的最终包与归档路径来自登记簿', () => {
    const state = createDemoState()
    const backed = completeGate(state, 'CO-011', 'it-backup', {
      actor: ACTOR,
      now: NOW,
      evidence: [officialEmail('IT 回执')],
      note: '',
    })
    const notified = completeGate(backed, 'CO-011', 'billing-notified', {
      actor: ACTOR,
      now: NOW,
      evidence: [officialEmail('BD 出账通知')],
      note: '',
    })

    const draft = notified.notificationDrafts.find((entry) => entry.sourceId === 'CO-011')!
    const archive = state.projectPaths.find(
      (entry) => entry.projectCode === 'AUR_A_3D_B11' && entry.kind === 'archive',
    )!
    expect(draft.body).toContain(archive.path)
  })
})

describe('每个非终态都有出路', () => {
  const ALL: CloseoutGateCode[] = [...CLOSEOUT_GATE_ORDER]

  it('任意时刻都恰好有一道当前门禁，直到全部完成', () => {
    let state = createDemoState()
    const seen: CloseoutGateCode[] = []

    // 从 CO-011 的当前门禁一路推到底，每一步都必须有明确的下一步
    for (let guard = 0; guard < ALL.length + 1; guard += 1) {
      const gate = currentGate(state, 'CO-011')
      if (!gate) break
      seen.push(gate.code)
      state = completeGate(state, 'CO-011', gate.code, {
        actor: ACTOR,
        now: NOW,
        evidence: [officialEmail(gate.title)],
        note: '',
      })
    }

    expect(seen).toEqual(['it-backup', 'billing-notified'])
    expect(currentGate(state, 'CO-011')).toBeUndefined()
    // 门禁走完只是「已通知 BD」；归档是 PM 收到出账回执后的独立动作
    expect(closeoutCase(state, 'CO-011')!.status).toBe('BillingNotified')

    const archived = archiveCase(state, 'CO-011', { actor: ACTOR, now: NOW })
    expect(closeoutCase(archived, 'CO-011')!.status).toBe('Archived')
    expect(closeoutCase(archived, 'CO-011')!.archivedAt).toBe(NOW)
  })

  it('已归档的案件不再接受任何门禁操作', () => {
    let state = createDemoState()
    for (const code of ['it-backup', 'billing-notified'] as CloseoutGateCode[]) {
      state = completeGate(state, 'CO-011', code, {
        actor: ACTOR,
        now: NOW,
        evidence: [officialEmail(code)],
        note: '',
      })
    }
    state = archiveCase(state, 'CO-011', { actor: ACTOR, now: NOW })

    expect(() =>
      completeGate(state, 'CO-011', 'billing-notified', {
        actor: ACTOR,
        now: NOW,
        evidence: [officialEmail('再来一次')],
        note: '',
      }),
    ).toThrow(CloseoutBlocked)
    expect(() => archiveCase(state, 'CO-011', { actor: ACTOR, now: NOW })).toThrow(CloseoutBlocked)
  })
})

describe('门禁可以退回重做', () => {
  it('退回某一道门禁会连带作废它后面的所有门禁', () => {
    const state = createDemoState()
    const rolled = reopenGate(state, 'CO-011', 'final-package', {
      actor: ACTOR,
      now: NOW,
      reason: '最终包漏了 LOD',
    })

    const item = closeoutCase(rolled, 'CO-011')!
    expect(item.gates.find((g) => g.code === 'final-package')!.completedAt).toBeUndefined()
    // 客户确认是在最终包之后做的，最终包被推翻，它也不能再算数
    expect(item.gates.find((g) => g.code === 'client-final')!.completedAt).toBeUndefined()
    expect(item.status).toBe('AwaitingFinalPackage')
  })

  it('退回写审计，留下痕迹', () => {
    const state = createDemoState()
    const rolled = reopenGate(state, 'CO-011', 'final-package', {
      actor: ACTOR,
      now: NOW,
      reason: '最终包漏了 LOD',
    })
    const event = rolled.auditEvents.at(-1)
    expect(event?.action).toContain('退回结项门禁')
    expect(event?.reason).toContain('LOD')
  })
})

/**
 * 「看板说可以进结项，结项中心却是空的」。
 *
 * CloseoutCase 以前只在种子数据里存在，运行时没有任何地方能新建——
 * 自己录进来的项目做完了也永远进不了结项，是条死路。
 */
describe('开启结项', () => {
  function allApproved(): DemoState {
    const state = createDemoState()
    const project = state.projects[1]
    for (const asset of project.assets) {
      for (const stage of asset.stages) stage.status = 'Approved'
    }
    return { ...state, closeoutCases: [] }
  }

  it('全部阶段验收后才出现在可开启列表里', () => {
    const state = allApproved()
    const ready = closeoutReadyProjects(state)

    expect(ready.length).toBeGreaterThan(0)
    for (const entry of ready) {
      expect(assetsApproved(state, entry.projectCode).done).toBe(true)
    }
    // 还有阶段没验收的项目不在列表里
    const unfinished = state.projects.filter((project) => !assetsApproved(state, project.code).done)
    expect(unfinished.length).toBeGreaterThan(0)
    for (const project of unfinished) {
      expect(ready.some((entry) => entry.projectCode === project.code)).toBe(false)
    }
  })

  it('开启后案件就在了，五道门一道都还没通过', () => {
    const state = allApproved()
    const target = closeoutReadyProjects(state)[0].projectCode
    const next = openCloseout(state, target, NOW, ACTOR)

    const item = next.closeoutCases.find((entry) => entry.projectCode === target)!
    expect(item.gates).toHaveLength(CLOSEOUT_GATE_ORDER.length)
    // 「全部资产验收」由阶段状态推导，其余四道必须有正式证据，一道都不能预先勾上
    expect(item.gates.every((gate) => gate.completedAt === undefined)).toBe(true)
    expect(gateState(next, item.id, 'final-package')).toBe('current')
    expect(gateState(next, item.id, 'it-backup')).toBe('blocked')
    expect(next.auditEvents.some((event) => event.targetId === item.id)).toBe(true)
  })

  it('开过就不能再开，否则同一个项目会有两张门禁清单', () => {
    const state = allApproved()
    const target = closeoutReadyProjects(state)[0].projectCode
    const next = openCloseout(state, target, NOW, ACTOR)

    expect(closeoutReadyProjects(next).some((entry) => entry.projectCode === target)).toBe(false)
    expect(() => openCloseout(next, target, NOW, ACTOR)).toThrow(CloseoutBlocked)
  })

  it('还有阶段没验收就开结项，等于给自己发一张假的完成证明', () => {
    const state = { ...createDemoState(), closeoutCases: [] }
    const unfinished = state.projects.find((project) => !assetsApproved(state, project.code).done)!

    expect(() => openCloseout(state, unfinished.code, NOW, ACTOR)).toThrow(/没通过客户验收/)
  })
})
