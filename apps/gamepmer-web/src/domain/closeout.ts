import type {
  AuditEvent,
  CloseoutCase,
  CloseoutGate,
  CloseoutGateCode,
  CloseoutStatus,
  DemoState,
  EvidenceRef,
  NotificationDraft,
} from './model'
import { QUOTE_KIND_LABEL, projectQuoteSummary, quoteTotals } from './quotation'

/**
 * 结项、IT 备份与 BD 出账。
 *
 * 这一页的全部意义是**不可跳过的证据链**。每一道门禁都要有正式证据才算数，
 * 因为出账之后再去补「客户到底确认没有」「IT 到底备份没有」是补不回来的。
 *
 * 三条不能破的规则：
 * 1. **串行，不能跳步。** 第 N 道门禁只在第 1..N-1 道都完成后才开放。
 * 2. **聊天截图不是正式证据。** 口头和群消息可以先记着，但替代不了客户或 IT 的正式邮件。
 * 3. **工作台不搬文件。** 只登记路径索引；真实的剪切、备份和权限处理由 IT 执行。
 */

export class CloseoutBlocked extends Error {
  constructor(readonly issues: string[]) {
    super(`结项门禁被阻断：${issues.join('；')}`)
    this.name = 'CloseoutBlocked'
  }
}

/** 门禁顺序是业务顺序，不是展示顺序——改这个数组等于改业务规则。 */
export const CLOSEOUT_GATE_ORDER: CloseoutGateCode[] = [
  'assets-approved',
  'final-package',
  'client-final',
  'it-backup',
  'billing-notified',
]

export const GATE_TITLE: Record<CloseoutGateCode, string> = {
  'assets-approved': '全部资产验收',
  'final-package': '总监整理最终包',
  'client-final': '客户最终确认',
  'it-backup': 'IT 剪切备份',
  'billing-notified': '通知 BD 出账',
}

/** 哪几道门禁必须要正式邮件。截图和口头确认过不了这几关。 */
const REQUIRES_OFFICIAL_EMAIL: CloseoutGateCode[] = ['client-final', 'it-backup', 'billing-notified']

const STATUS_BY_NEXT_GATE: Record<CloseoutGateCode, CloseoutStatus> = {
  'assets-approved': 'Precheck',
  'final-package': 'AwaitingFinalPackage',
  'client-final': 'AwaitingCustomerFinal',
  'it-backup': 'AwaitingIT',
  'billing-notified': 'ReadyToBill',
}

// ---------------------------------------------------------------- 查询

export function closeoutCase(state: DemoState, caseId: string): CloseoutCase | undefined {
  return state.closeoutCases.find((entry) => entry.id === caseId)
}

export type GateState = 'done' | 'current' | 'blocked'

/**
 * 第一道门禁由事实推导，不靠手工打勾。
 *
 * 「全部资产验收」是项目阶段状态的投影——让 PM 手工勾一个「都验收了」，
 * 等于把唯一能自动核对的一件事也交给记忆。
 */
export function assetsApproved(state: DemoState, projectCode: string): { done: boolean; pending: number } {
  const project = state.projects.find((entry) => entry.code === projectCode)
  if (!project) return { done: false, pending: 0 }
  const stages = project.assets.flatMap((asset) => asset.stages)
  const pending = stages.filter((stage) => stage.status !== 'Approved').length
  return { done: pending === 0 && stages.length > 0, pending }
}

function gateDone(state: DemoState, item: CloseoutCase, code: CloseoutGateCode): boolean {
  if (code === 'assets-approved') {
    // 事实推导优先；已经手工登记过完成时间的也算（用于历史数据）
    return assetsApproved(state, item.projectCode).done
  }
  return Boolean(item.gates.find((gate) => gate.code === code)?.completedAt)
}

export function gateState(state: DemoState, caseId: string, code: CloseoutGateCode): GateState {
  const item = closeoutCase(state, caseId)
  if (!item) return 'blocked'
  if (gateDone(state, item, code)) return 'done'

  const index = CLOSEOUT_GATE_ORDER.indexOf(code)
  const previousAllDone = CLOSEOUT_GATE_ORDER.slice(0, index).every((prior) =>
    gateDone(state, item, prior),
  )
  return previousAllDone ? 'current' : 'blocked'
}

/** 当前这一道门禁。全部完成时返回 undefined——那就是归档了。 */
export function currentGate(state: DemoState, caseId: string): CloseoutGate | undefined {
  const item = closeoutCase(state, caseId)
  if (!item) return undefined
  const code = CLOSEOUT_GATE_ORDER.find((entry) => gateState(state, caseId, entry) === 'current')
  return code ? item.gates.find((gate) => gate.code === code) : undefined
}

// ---------------------------------------------------------------- 门禁校验

export function gateBlockingIssues(
  state: DemoState,
  caseId: string,
  code: CloseoutGateCode,
  evidence: EvidenceRef[] = [],
): string[] {
  const item = closeoutCase(state, caseId)
  if (!item) return [`找不到结项案件 ${caseId}`]
  if (item.status === 'Archived') return ['该项目已归档，门禁不再接受操作']

  const issues: string[] = []
  if (gateDone(state, item, code)) issues.push(`「${GATE_TITLE[code]}」已经完成，不能重复登记`)

  // 前置门禁逐个点名，而不是笼统说一句「前置条件未满足」
  const index = CLOSEOUT_GATE_ORDER.indexOf(code)
  for (const prior of CLOSEOUT_GATE_ORDER.slice(0, index)) {
    if (!gateDone(state, item, prior)) {
      if (prior === 'assets-approved') {
        const { pending } = assetsApproved(state, item.projectCode)
        issues.push(`「${GATE_TITLE[prior]}」尚未完成：还有 ${pending} 个阶段未验收`)
      } else {
        issues.push(`「${GATE_TITLE[prior]}」尚未完成`)
      }
    }
  }

  if (code === 'assets-approved') {
    const { done, pending } = assetsApproved(state, item.projectCode)
    if (!done) issues.push(`还有 ${pending} 个阶段未验收，这一步由阶段状态自动推导，不能手工跳过`)
  }

  if (REQUIRES_OFFICIAL_EMAIL.includes(code) && evidence.length > 0) {
    if (!evidence.some((entry) => entry.kind === 'email')) {
      issues.push(
        `「${GATE_TITLE[code]}」必须有正式邮件回执。聊天截图和口头确认可以先记着，但替代不了正式记录`,
      )
    }
  }

  return issues
}

// ---------------------------------------------------------------- 用例

function nextId(existing: string[], prefix: string, width: number): string {
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)`)
  const max = existing.reduce((acc, id) => {
    const hit = id.match(pattern)
    return hit ? Math.max(acc, Number(hit[1])) : acc
  }, 0)
  return `${prefix}${String(max + 1).padStart(width, '0')}`
}

function deriveStatus(state: DemoState, item: CloseoutCase): CloseoutStatus {
  const nextCode = CLOSEOUT_GATE_ORDER.find((code) => !gateDone(state, item, code))
  // 五道门禁走完 ≠ 已归档。「已通知 BD」和「已归档」是两件事：
  // 通知发出去之后还要等 BD 出账回执，PM 才会把案件真正封存。
  if (!nextCode) return item.archivedAt ? 'Archived' : 'BillingNotified'
  return STATUS_BY_NEXT_GATE[nextCode]
}

export interface GateInput {
  actor: string
  now: string
  evidence: EvidenceRef[]
  note: string
}

/**
 * 完成一道门禁。
 *
 * 有任何阻断就整体抛出，`state` 保持原样——所有写入都发生在校验通过之后。
 * 最后一道门禁完成时项目转入归档。
 */
export function completeGate(
  state: DemoState,
  caseId: string,
  code: CloseoutGateCode,
  input: GateInput,
): DemoState {
  const issues = gateBlockingIssues(state, caseId, code, input.evidence)
  if (issues.length > 0) throw new CloseoutBlocked(issues)

  const item = closeoutCase(state, caseId)!
  if (REQUIRES_OFFICIAL_EMAIL.includes(code) && input.evidence.length === 0) {
    throw new CloseoutBlocked([`「${GATE_TITLE[code]}」需要登记正式邮件回执作为证据`])
  }

  const updated: CloseoutCase = {
    ...item,
    gates: item.gates.map((gate) =>
      gate.code !== code
        ? gate
        : {
            ...gate,
            completedAt: input.now,
            completedBy: input.actor,
            evidence: [...gate.evidence, ...input.evidence],
            note: input.note || gate.note,
          },
    ),
  }
  const settled: CloseoutCase = { ...updated, status: deriveStatus(state, updated) }

  const audit: AuditEvent = {
    id: nextId(state.auditEvents.map((entry) => entry.id), 'AE-', 3),
    at: input.now,
    actor: input.actor,
    action: `完成结项门禁「${GATE_TITLE[code]}」`,
    targetKind: 'CloseoutCase',
    targetId: caseId,
    before: item.status,
    after: code,
    reason: input.evidence.map((entry) => `${entry.label}：${entry.locator}`).join('；') || input.note,
  }

  // 通知 BD 出账那一步生成邮件草稿。工作台不发信，发送由 PM 自己完成后回来标记。
  const drafts: NotificationDraft[] =
    code === 'billing-notified'
      ? [
          {
            id: nextId(state.notificationDrafts.map((entry) => entry.id), 'ND-', 3),
            recipientRole: 'BD',
            recipientName: 'Liu',
            subject: `【可出账】${item.projectCode} · ${item.client}`,
            body: billingDraftBody(state, item),
            sourceKind: 'closeout',
            sourceId: caseId,
            status: 'draft',
          },
        ]
      : []

  return {
    ...state,
    closeoutCases: state.closeoutCases.map((entry) => (entry.id === caseId ? settled : entry)),
    notificationDrafts: [...state.notificationDrafts, ...drafts],
    auditEvents: [...state.auditEvents, audit],
  }
}

/**
 * 归档。
 *
 * 五道门禁走完只代表「已通知 BD」；真正封存是 PM 收到出账回执后的独立动作。
 * 归档之后案件只读——要改动只能重新开一个结项案件。
 */
export function archiveCase(
  state: DemoState,
  caseId: string,
  input: { actor: string; now: string },
): DemoState {
  const item = closeoutCase(state, caseId)
  if (!item) throw new CloseoutBlocked([`找不到结项案件 ${caseId}`])
  if (item.status === 'Archived') throw new CloseoutBlocked(['该案件已经归档'])

  const unfinished = CLOSEOUT_GATE_ORDER.filter((code) => !gateDone(state, item, code))
  if (unfinished.length > 0) {
    throw new CloseoutBlocked(unfinished.map((code) => `「${GATE_TITLE[code]}」尚未完成`))
  }

  const audit: AuditEvent = {
    id: nextId(state.auditEvents.map((entry) => entry.id), 'AE-', 3),
    at: input.now,
    actor: input.actor,
    action: '归档结项案件',
    targetKind: 'CloseoutCase',
    targetId: caseId,
    before: item.status,
    after: 'Archived',
  }

  return {
    ...state,
    closeoutCases: state.closeoutCases.map((entry) =>
      entry.id === caseId ? { ...entry, status: 'Archived' as const, archivedAt: input.now } : entry,
    ),
    auditEvents: [...state.auditEvents, audit],
  }
}

export interface ReopenInput {
  actor: string
  now: string
  reason: string
}

/**
 * 退回某一道门禁。
 *
 * **连带作废它后面的所有门禁**——最终包被推翻，基于那个包做的客户确认就不能再算数。
 * 保留「退回不是删除」的痕迹：审计里能看到谁、什么时候、为什么退的。
 */
export function reopenGate(
  state: DemoState,
  caseId: string,
  code: CloseoutGateCode,
  input: ReopenInput,
): DemoState {
  const item = closeoutCase(state, caseId)
  if (!item) throw new CloseoutBlocked([`找不到结项案件 ${caseId}`])
  if (code === 'assets-approved') {
    throw new CloseoutBlocked(['资产验收由阶段状态推导，要退回请到项目甘特改阶段状态'])
  }

  const from = CLOSEOUT_GATE_ORDER.indexOf(code)
  const cleared: CloseoutCase = {
    ...item,
    archivedAt: undefined,
    gates: item.gates.map((gate) =>
      CLOSEOUT_GATE_ORDER.indexOf(gate.code) < from
        ? gate
        : { ...gate, completedAt: undefined, completedBy: undefined, note: undefined },
    ),
  }

  const audit: AuditEvent = {
    id: nextId(state.auditEvents.map((entry) => entry.id), 'AE-', 3),
    at: input.now,
    actor: input.actor,
    action: `退回结项门禁「${GATE_TITLE[code]}」`,
    targetKind: 'CloseoutCase',
    targetId: caseId,
    before: item.status,
    after: code,
    reason: input.reason,
  }

  return {
    ...state,
    closeoutCases: state.closeoutCases.map((entry) =>
      entry.id === caseId ? { ...cleared, status: deriveStatus(state, cleared) } : entry,
    ),
    auditEvents: [...state.auditEvents, audit],
  }
}

// ---------------------------------------------------------------- 出账资料包

export interface BillingPackage {
  projectCode: string
  quoteRows: ReturnType<typeof projectQuoteSummary>['rows']
  pendingRows: ReturnType<typeof projectQuoteSummary>['rows']
  total: number
  personDays: number
  /** 还缺哪几份证据。空数组才算齐 */
  missing: string[]
  ready: boolean
}

/**
 * 出账资料包。
 *
 * 通知 BD 之前自动核对：原始报价、追加报价、交付清单、客户确认、最终包路径和 IT 回执。
 * 少一份就不算齐——这里宁可啰嗦，也不能让 BD 拿着不完整的资料去开票。
 */
export function billingPackage(state: DemoState, caseId: string): BillingPackage {
  const item = closeoutCase(state, caseId)
  if (!item) {
    return { projectCode: '', quoteRows: [], pendingRows: [], total: 0, personDays: 0, missing: ['找不到结项案件'], ready: false }
  }

  const summary = projectQuoteSummary(state, item.projectCode)
  const missing: string[] = []

  const { done, pending } = assetsApproved(state, item.projectCode)
  if (!done) missing.push(`交付清单不完整：还有 ${pending} 个阶段未验收`)
  if (!gateDone(state, item, 'final-package')) missing.push('缺最终包路径与总监确认')
  if (!gateDone(state, item, 'client-final')) missing.push('缺客户最终确认邮件')
  if (!gateDone(state, item, 'it-backup')) missing.push('缺 IT 备份完成回执')
  if (summary.rows.length === 0) missing.push('该项目没有任何报价记录')

  return {
    projectCode: item.projectCode,
    quoteRows: summary.rows.filter((row) => row.billable),
    pendingRows: summary.rows.filter((row) => !row.billable),
    total: summary.billableAmount,
    personDays: summary.billablePersonDays,
    missing,
    ready: missing.length === 0,
  }
}

function billingDraftBody(state: DemoState, item: CloseoutCase): string {
  const summary = projectQuoteSummary(state, item.projectCode)
  const lines = summary.rows
    .filter((row) => row.billable)
    .map(
      (row) =>
        `· ${QUOTE_KIND_LABEL[row.quoteCase.kind]} ${row.quoteCase.id}：¥ ${quoteTotals(row.version!).amount.toLocaleString('zh-CN')}`,
    )
  const finalPath = item.paths.find((path) => path.kind === 'final')?.path ?? '（未登记）'
  const archivePath = item.paths.find((path) => path.kind === 'archive')?.path ?? '（未登记）'

  return [
    `${item.projectCode}（${item.client}）已完成全部交付、客户最终确认与 IT 剪切备份，可以出账。`,
    '',
    '应结明细：',
    ...lines,
    `合计：¥ ${summary.billableAmount.toLocaleString('zh-CN')} · ${summary.billablePersonDays} 人日`,
    '',
    `最终包：${finalPath}`,
    `归档目标：${archivePath}`,
    '',
    '客户确认邮件与 IT 回执已归档，可随附件调取。',
  ].join('\n')
}

// ---------------------------------------------------------------- 标签

export const CLOSEOUT_STATUS_LABEL: Record<CloseoutStatus, string> = {
  Precheck: '等待资产全部验收',
  AwaitingFinalPackage: '等待最终包',
  AwaitingCustomerFinal: '等待客户最终确认',
  AwaitingIT: '等待 IT 备份回执',
  ReadyToBill: '可通知 BD 出账',
  BillingNotified: '已通知 BD',
  Archived: '已归档',
}
