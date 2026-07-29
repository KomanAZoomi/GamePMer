import { describe, expect, it } from 'vitest'

import { createDemoState } from '../data/seed'
import { DEMO_TODAY } from './clock'
import {
  CandidateBlocked,
  blockingIssues,
  canConfirm,
  confirmCandidate,
  contentHash,
  fieldValue,
  ignoreCandidate,
  ingestText,
  markDuplicate,
  overallConfidence,
  updateCandidateField,
} from './inbox'
import type { DemoState, InboxCandidate } from './model'

const ACTOR = 'Brandon'
const NOW = `${DEMO_TODAY}T15:00:00+08:00`

function pick(state: DemoState, id: string): InboxCandidate {
  const found = state.candidates.find((entry) => entry.id === id)
  if (!found) throw new Error(`种子里没有候选 ${id}`)
  return found
}

/** 正式数据的指纹。确认之外的任何操作都不许让它变。 */
function formalFingerprint(state: DemoState): string {
  return JSON.stringify({
    projects: state.projects,
    feedbackBatches: state.feedbackBatches,
    revisions: state.revisions,
    changeRequests: state.changeRequests,
  })
}

describe('候选去重', () => {
  it('同一段原文二次导入判为重复，不生成第二条候选', () => {
    const state = createDemoState()
    const text = '客户来信：肩甲比例请缩小，外侧结构向身体收拢。'

    const first = ingestText(state, { text, channel: 'paste', now: NOW, actor: ACTOR })
    expect(first.candidate.status).not.toBe('Duplicate')
    const afterFirst = first.state.candidates.length

    const second = ingestText(first.state, { text, channel: 'paste', now: NOW, actor: ACTOR })
    expect(second.candidate.status).toBe('Duplicate')
    expect(second.candidate.duplicateOfId).toBe(first.candidate.id)
    // 重复的那条仍然入库（证据不丢），但不占用待确认队列
    expect(second.state.candidates.length).toBe(afterFirst + 1)
    expect(second.state.candidates.filter((c) => c.status === 'NeedsReview').length).toBe(
      first.state.candidates.filter((c) => c.status === 'NeedsReview').length,
    )
  })

  it('哈希忽略空白与大小写差异，但不同内容不会误判', () => {
    expect(contentHash('  Hello  World \n')).toBe(contentHash('hello world'))
    expect(contentHash('肩甲缩小')).not.toBe(contentHash('肩甲放大'))
  })

  it('换渠道重发同一段内容仍然算重复——同一条消息不该确认两次', () => {
    const state = createDemoState()
    const text = 'MECH-02 高模已完成，路径 \\\\NAS-ART\\Production\\NST_A_3D_B24\\MECH-02'
    const first = ingestText(state, { text, channel: 'paste', now: NOW, actor: ACTOR })
    const second = ingestText(first.state, { text, channel: 'email', now: NOW, actor: ACTOR })
    expect(second.candidate.status).toBe('Duplicate')
  })
})

describe('字段门禁', () => {
  it('缺必填字段时不允许确认，并指名道姓说缺哪个', () => {
    const state = createDemoState()
    const candidate = pick(state, 'C-20260727-019') // 种子里缺关联资产的那条

    const issues = blockingIssues(candidate)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some((issue) => issue.includes('关联资产'))).toBe(true)
    expect(canConfirm(candidate)).toBe(false)
  })

  it('PM 补全字段后解除阻断，且该字段标记为人工填写', () => {
    const state = createDemoState()
    const candidate = pick(state, 'C-20260727-019')

    const filled = updateCandidateField(candidate, 'assetId', 'MECH-02')
    const field = filled.fields.find((entry) => entry.key === 'assetId')
    expect(field?.value).toBe('MECH-02')
    expect(field?.editedByPm).toBe(true)
    // 人工填写就是确定的，不该再显示成 62% 置信度
    expect(field?.confidence).toBe(1)
    expect(canConfirm(filled)).toBe(true)
  })

  it('综合置信度取最低的必填字段——一项没谱就整条没谱', () => {
    const state = createDemoState()
    const candidate = pick(state, 'C-20260727-017')
    const required = candidate.fields.filter((f) => f.required)
    const lowest = Math.min(...required.map((f) => f.confidence))
    expect(overallConfidence(candidate)).toBeCloseTo(lowest, 5)
  })

  it('低置信度字段即使有值也要 PM 过目，不能直接确认', () => {
    const state = createDemoState()
    const candidate = pick(state, 'C-20260727-021') // OCR 出来的低置信候选
    expect(canConfirm(candidate)).toBe(false)
    expect(blockingIssues(candidate).some((issue) => issue.includes('置信度'))).toBe(true)
  })
})

describe('确认事务', () => {
  it('确认客户反馈候选：生成反馈批次、审计事件，候选指回正式记录', () => {
    const state = createDemoState()
    const before = state.feedbackBatches.length

    const next = confirmCandidate(state, 'C-20260727-017', { actor: ACTOR, now: NOW })

    expect(next.state.feedbackBatches.length).toBe(before + 1)
    const created = next.state.feedbackBatches.at(-1)!
    expect(created.projectCode).toBe('NST_A_3D_B24')
    expect(created.items.length).toBeGreaterThan(0)
    // 新建的反馈项一律待分流——确认候选不代表已经判定范围内外
    expect(created.items.every((item) => item.scope === 'unclassified')).toBe(true)

    const confirmed = next.state.candidates.find((c) => c.id === 'C-20260727-017')!
    expect(confirmed.status).toBe('Confirmed')
    expect(confirmed.confirmedRecordId).toBe(created.id)
    expect(confirmed.confirmedBy).toBe(ACTOR)

    // 原始证据仍然在，并且反馈批次能引到它
    expect(next.state.sourceRecords.some((s) => s.id === confirmed.sourceId)).toBe(true)
    expect(created.evidence.length).toBeGreaterThan(0)
  })

  it('确认阶段完成候选：阶段推进到已交 PM 并写入实际完成日，基准不动', () => {
    const state = createDemoState()
    const stageBefore = state.projects
      .flatMap((p) => p.assets)
      .flatMap((a) => a.stages)
      .find((s) => s.id === 'MECH-02/3D_HIGH')!
    const baseline = { start: stageBefore.baselineStart, finish: stageBefore.baselineFinish }

    const next = confirmCandidate(state, 'C-20260727-018', { actor: ACTOR, now: NOW })

    const stageAfter = next.state.projects
      .flatMap((p) => p.assets)
      .flatMap((a) => a.stages)
      .find((s) => s.id === 'MECH-02/3D_HIGH')!
    expect(stageAfter.status).toBe('HandedToPm')
    expect(stageAfter.actualFinish).toBeTruthy()
    expect(stageAfter.baselineStart).toBe(baseline.start)
    expect(stageAfter.baselineFinish).toBe(baseline.finish)
  })

  it('被阻断时整体拒绝，正式数据一个字节都不变', () => {
    const state = createDemoState()
    const fingerprint = formalFingerprint(state)

    expect(() => confirmCandidate(state, 'C-20260727-019', { actor: ACTOR, now: NOW })).toThrow(
      CandidateBlocked,
    )
    expect(formalFingerprint(state)).toBe(fingerprint)
    expect(state.candidates.find((c) => c.id === 'C-20260727-019')!.status).toBe('NeedsReview')
  })

  it('同一条候选确认两次会被拒绝，不产生重复的正式记录', () => {
    const state = createDemoState()
    const first = confirmCandidate(state, 'C-20260727-017', { actor: ACTOR, now: NOW })
    const batches = first.state.feedbackBatches.length

    expect(() => confirmCandidate(first.state, 'C-20260727-017', { actor: ACTOR, now: NOW })).toThrow(
      CandidateBlocked,
    )
    expect(first.state.feedbackBatches.length).toBe(batches)
  })

  /**
   * 这条原来断言的是「报价需求要到切片 5 才有记录可写」。切片 5 早已交付，
   * 那条阻断就从「诚实」变成了「过期的谎」——验收时被指出来。
   *
   * 换成守这一类问题本身：阻断理由里不许再出现「某某切片交付」。
   * 十个模块都做完了，还拿没交付当借口，就是没跟上自己的实现。
   */
  it('阻断理由不再拿「某某切片未交付」当借口', () => {
    const state = createDemoState()
    for (const candidate of state.candidates) {
      const issues = blockingIssues(candidate).join('；')
      expect(issues, `候选 ${candidate.id} 的阻断理由仍在引用切片进度`).not.toMatch(/切片/)
    }
  })

  it('确认只生成一条待办投影，不因来源有两个角色而重复', () => {
    const state = createDemoState()
    const next = confirmCandidate(state, 'C-20260727-017', { actor: ACTOR, now: NOW })
    const audits = next.state.auditEvents.filter(
      (event) => event.targetId === next.state.candidates.find((c) => c.id === 'C-20260727-017')!.confirmedRecordId,
    )
    expect(audits.length).toBe(1)
  })
})

describe('忽略与标记重复不污染正式数据', () => {
  it('忽略候选只改候选自己的状态', () => {
    const state = createDemoState()
    const fingerprint = formalFingerprint(state)

    const next = ignoreCandidate(state, 'C-20260727-017', {
      actor: ACTOR,
      now: NOW,
      reason: '客户已在电话里撤回',
    })

    expect(next.state.candidates.find((c) => c.id === 'C-20260727-017')!.status).toBe('Ignored')
    expect(formalFingerprint(next.state)).toBe(fingerprint)
    expect(next.state.auditEvents.length).toBe(state.auditEvents.length + 1)
  })

  it('手工标记重复要留下指向哪一条的痕迹', () => {
    const state = createDemoState()
    const next = markDuplicate(state, 'C-20260727-021', {
      actor: ACTOR,
      now: NOW,
      duplicateOfId: 'C-20260727-017',
    })
    const marked = next.state.candidates.find((c) => c.id === 'C-20260727-021')!
    expect(marked.status).toBe('Duplicate')
    expect(marked.duplicateOfId).toBe('C-20260727-017')
    expect(formalFingerprint(next.state)).toBe(formalFingerprint(state))
  })
})

describe('零审批导入', () => {
  it('粘贴文本能提取出项目号与资产名，并保留原文', () => {
    const state = createDemoState()
    const { state: next, candidate } = ingestText(state, {
      text: '【NST_C_3D_B31】PROP-07 贴图已完成，请查收 \\\\NAS-ART\\Production\\NST_C_3D_B31\\PROP-07',
      channel: 'paste',
      now: NOW,
      actor: ACTOR,
    })

    const project = candidate.fields.find((f) => f.key === 'projectCode')
    expect(project?.value).toBe('NST_C_3D_B31')
    const asset = candidate.fields.find((f) => f.key === 'assetId')
    expect(asset?.value).toBe('PROP-07')

    const source = next.sourceRecords.find((s) => s.id === candidate.sourceId)!
    expect(source.body).toContain('PROP-07 贴图已完成')
    expect(source.channel).toBe('paste')
  })

  it('提取不出项目时留空并阻断，不编造一个项目号', () => {
    const state = createDemoState()
    const { candidate } = ingestText(state, {
      text: '辛苦了，这版看着不错。',
      channel: 'paste',
      now: NOW,
      actor: ACTOR,
    })
    expect(candidate.fields.find((f) => f.key === 'projectCode')?.value).toBeUndefined()
    expect(canConfirm(candidate)).toBe(false)
  })

  it('导入本身不改变任何正式数据', () => {
    const state = createDemoState()
    const fingerprint = formalFingerprint(state)
    const { state: next } = ingestText(state, {
      text: '【NST_A_3D_B24】MECH-01 低模返修完成',
      channel: 'paste',
      now: NOW,
      actor: ACTOR,
    })
    expect(formalFingerprint(next)).toBe(fingerprint)
  })
})

/**
 * 报价需求与 IT 回执的确认。
 *
 * 这两类原来被一条「在切片 5 / 切片 6 交付」的说明挡着。两个切片都早已交付，
 * 那条说明就从「诚实阻断」变成了「过期的谎」——验收时被指出来。
 */
describe('报价需求确认后真的建出报价案件', () => {
  const CANDIDATE = 'C-20260726-014'

  /** 低置信度字段仍然要 PM 核验，这是真门禁，不能跟着一起放开 */
  function verified(state: DemoState): DemoState {
    let next = state
    for (const key of ['assetId', 'stageCode']) {
      next = {
        ...next,
        candidates: next.candidates.map((entry) =>
          entry.id !== CANDIDATE ? entry : updateCandidateField(entry, key, fieldValue(entry, key)!),
        ),
      }
    }
    return next
  }

  it('不再拿「切片 5 未交付」当阻断理由', () => {
    const state = createDemoState()
    const candidate = state.candidates.find((entry) => entry.id === CANDIDATE)!
    expect(blockingIssues(candidate).join()).not.toMatch(/切片/)
  })

  it('低置信度字段照旧阻断——PM 核验这道门没被顺手放开', () => {
    const state = createDemoState()
    const candidate = state.candidates.find((entry) => entry.id === CANDIDATE)!
    expect(blockingIssues(candidate).some((issue) => issue.includes('置信度'))).toBe(true)
  })

  it('核验后确认 → 建出待总监报价的案件，并指回候选', () => {
    const state = verified(createDemoState())
    const result = confirmCandidate(state, CANDIDATE, { actor: 'Brandon', now: NOW })

    expect(result.recordKind).toBe('QuoteCase')
    const created = result.state.quoteCases.find((entry) => entry.id === result.recordId)!
    expect(created.status).toBe('DirectorQuoting')
    expect(created.kind).toBe('initial')
    expect(created.projectCode).toBe('NST_A_3D_B24')
    // 需求原文即证据，不重新措辞
    expect(created.requirement).toContain('时装')
    expect(created.evidence.length).toBeGreaterThan(0)

    const confirmed = result.state.candidates.find((entry) => entry.id === CANDIDATE)!
    expect(confirmed.status).toBe('Confirmed')
    expect(confirmed.confirmedRecordId).toBe(created.id)
  })

  it('新建的案件还没有报价版本——建案件不等于报了价', () => {
    const state = verified(createDemoState())
    const result = confirmCandidate(state, CANDIDATE, { actor: 'Brandon', now: NOW })

    const created = result.state.quoteCases.find((entry) => entry.id === result.recordId)!
    expect(created.activeVersionId).toBeUndefined()
    expect(result.state.quoteVersions.filter((v) => v.caseId === created.id)).toHaveLength(0)
  })

  it('确认报价需求不动排期，一个阶段都不改', () => {
    const state = verified(createDemoState())
    const result = confirmCandidate(state, CANDIDATE, { actor: 'Brandon', now: NOW })
    expect(result.state.projects).toEqual(state.projects)
  })
})

describe('IT 回执确认后写进结项证据', () => {
  const CANDIDATE = 'C-20260725-009'

  it('不再拿「切片 6 未交付」当阻断理由', () => {
    const state = createDemoState()
    const candidate = state.candidates.find((entry) => entry.id === CANDIDATE)!
    expect(blockingIssues(candidate).join()).not.toMatch(/切片/)
  })

  it('确认 → 完成 AUR_A_3D_B11 的「IT 备份」门禁，并带上邮件证据', () => {
    const state = createDemoState()
    const result = confirmCandidate(state, CANDIDATE, { actor: 'Brandon', now: NOW })

    expect(result.recordKind).toBe('CloseoutCase')
    const item = result.state.closeoutCases.find((entry) => entry.id === result.recordId)!
    const gate = item.gates.find((entry) => entry.code === 'it-backup')!
    expect(gate.completedAt).toBe(NOW)
    expect(gate.evidence.some((entry) => entry.kind === 'email')).toBe(true)
  })

  /** 门禁串行这条规矩不因为「证据是从收件箱来的」就松掉 */
  it('前置门禁没走完时照样阻断，且不留任何副作用', () => {
    const base = createDemoState()
    const state: DemoState = {
      ...base,
      closeoutCases: base.closeoutCases.map((item) =>
        item.projectCode !== 'AUR_A_3D_B11'
          ? item
          : {
              ...item,
              gates: item.gates.map((gate) =>
                gate.code === 'client-final' ? { ...gate, completedAt: undefined, evidence: [] } : gate,
              ),
            },
      ),
    }

    expect(() => confirmCandidate(state, CANDIDATE, { actor: 'Brandon', now: NOW })).toThrow(
      CandidateBlocked,
    )
    const untouched = state.candidates.find((entry) => entry.id === CANDIDATE)!
    expect(untouched.status).toBe('NeedsReview')
  })

  it('项目根本没有结项案件时，说清楚是这个原因', () => {
    const base = createDemoState()
    const state: DemoState = {
      ...base,
      closeoutCases: base.closeoutCases.filter((item) => item.projectCode !== 'AUR_A_3D_B11'),
    }

    expect(() => confirmCandidate(state, CANDIDATE, { actor: 'Brandon', now: NOW })).toThrow(
      /还没有结项案件/,
    )
  })
})
