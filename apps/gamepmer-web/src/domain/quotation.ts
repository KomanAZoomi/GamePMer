import { BATCH_CODE_EXAMPLE, BATCH_CODE_RULE, parseBatchCode } from './batchCode'
import { STAGE_LABEL } from './model'
import type {
  Asset,
  AuditEvent,
  EvidenceRef,
  DemoState,
  NotificationDraft,
  Person,
  PersonRole,
  Project,
  QuoteCase,
  QuoteKind,
  QuoteVersion,
  ScheduleRevision,
  StageDateChange,
  StagePlan,
} from './model'

/**
 * 报价与变更。
 *
 * 首次报价和追加报价共用一套版本 + 复核 + 开工的证据链，区别只在批准后的落点：
 * 首次报价让项目进入制作，追加报价解冻受影响资产并更新它们的排期。
 *
 * 四条不能破的规则：
 * 1. **批准 ≠ 开工。** 只有 PM 声明发出正式开工邮件后，排期才真正变。
 * 2. **原报价永不覆盖。** 新版本是新增，旧版本标记作废后仍然可查——结项出账要汇总全部。
 * 3. **只冻结受影响资产。** 追加报价卡住 MECH-01 不等于全项目停工。
 * 4. **同人兼两角只确认一次。** 待办按人合并，审计按角色展开。
 */

export class QuoteBlocked extends Error {
  constructor(readonly issues: string[]) {
    super(`报价流程被阻断：${issues.join('；')}`)
    this.name = 'QuoteBlocked'
  }
}

// ---------------------------------------------------------------- 查询

export interface QuoteTotals {
  personDays: number
  amount: number
}

/**
 * 合计一律按行算出来，不给一个可以手填的总额字段——那样两个数迟早对不上。
 *
 * 人天按 0.1 录入，二进制浮点直接相加会得到 4.499999999999999，
 * 摆在报价单上就是个笑话。这里统一收敛到两位小数。
 */
export function quoteTotals(version: QuoteVersion): QuoteTotals {
  const raw = version.lines.reduce<QuoteTotals>(
    (acc, line) => ({
      personDays: acc.personDays + line.personDays,
      amount: acc.amount + line.personDays * line.unitPrice,
    }),
    { personDays: 0, amount: 0 },
  )
  return {
    personDays: Math.round(raw.personDays * 100) / 100,
    amount: Math.round(raw.amount * 100) / 100,
  }
}

export function activeVersion(state: DemoState, caseId: string): QuoteVersion | undefined {
  const quoteCase = state.quoteCases.find((entry) => entry.id === caseId)
  if (!quoteCase?.activeVersionId) return undefined
  return state.quoteVersions.find((entry) => entry.id === quoteCase.activeVersionId)
}

export function versionsOf(state: DemoState, caseId: string): QuoteVersion[] {
  return state.quoteVersions
    .filter((entry) => entry.caseId === caseId)
    .sort((a, b) => a.version - b.version)
}

export function personOf(state: DemoState, personId: string): Person | undefined {
  return state.people.find((entry) => entry.id === personId)
}

/** 一个项目到目前为止的应结金额：首次报价 + 全部已开工的追加报价。 */
export function projectQuoteSummary(state: DemoState, projectCode: string) {
  const cases = state.quoteCases.filter((entry) => entry.projectCode === projectCode)
  const rows = cases.map((entry) => {
    const version = activeVersion(state, entry.id)
    return {
      quoteCase: entry,
      version,
      totals: version ? quoteTotals(version) : { personDays: 0, amount: 0 },
      /** 只有已开工的才算进应结——批准了但没发开工邮件的不算 */
      billable: entry.status === 'KickoffSent',
    }
  })
  return {
    rows,
    billableAmount: rows.filter((row) => row.billable).reduce((sum, row) => sum + row.totals.amount, 0),
    billablePersonDays: rows
      .filter((row) => row.billable)
      .reduce((sum, row) => sum + row.totals.personDays, 0),
  }
}

// ---------------------------------------------------------------- 门禁

/** 报价必须带排期。只有一个总金额的报价没法排产，也没法在结项时对账。 */
export function reviewBlockingIssues(version: QuoteVersion): string[] {
  const issues: string[] = []
  if (version.lines.length === 0) issues.push('报价还没有任何工作项，空报价不能提交复核')

  for (const line of version.lines) {
    if (line.personDays <= 0) issues.push(`「${line.title}」缺人天`)
    if (!line.plannedStart || !line.plannedFinish) issues.push(`「${line.title}」缺节点日期`)
    if (line.unitPrice <= 0) issues.push(`「${line.title}」缺单价`)
  }
  return issues
}

export function kickoffBlockingIssues(state: DemoState, caseId: string): string[] {
  const quoteCase = state.quoteCases.find((entry) => entry.id === caseId)
  if (!quoteCase) return [`找不到报价案件 ${caseId}`]

  const issues: string[] = []
  if (quoteCase.status === 'KickoffSent') issues.push('开工邮件已经发过了，不能重复发送')
  if (quoteCase.status === 'Rejected') issues.push('客户未接受该报价，案件已终止')
  if (quoteCase.status === 'Approved') issues.push('复核通过了，但还没报给客户')
  if (quoteCase.status === 'SentToClient') issues.push('还在等客户确认，客户没点头不能开工')

  const version = activeVersion(state, caseId)
  if (!version) {
    issues.push('还没有有效报价版本')
    return issues
  }
  if (!version.review || version.review.decision !== 'approve') {
    issues.push('当前版本尚未通过组长/BD 复核')
  }
  issues.push(...reviewBlockingIssues(version))

  const project = state.projects.find((entry) => entry.code === quoteCase.projectCode)

  if (project) {
    // 项目已存在（追加报价、或首次报价的补发）：报价行必须能落到既有排期上
    for (const line of version.lines) {
      if (!findStage(state, quoteCase.projectCode, line.assetId, line.stageCode)) {
        issues.push(`报价行「${line.title}」指向的 ${line.assetId} / ${line.stageCode} 在正式排期里不存在`)
      }
    }
  } else if (quoteCase.kind === 'change') {
    issues.push(`${quoteCase.projectCode} 不是正式项目，追加报价无处可落`)
  } else {
    // 首次报价：项目本来就该在这一刻才建出来。要建就得有完整的行
    if (!parseBatchCode(quoteCase.projectCode).valid) {
      issues.push(
        `批次编号「${quoteCase.projectCode}」不符合规范 ${BATCH_CODE_RULE}，无法据此建项`,
      )
    }
    if (version.lines.length === 0) issues.push('报价单一行都没有，建不出项目与资产')
    for (const line of version.lines) {
      if (!line.plannedStart || !line.plannedFinish) {
        issues.push(`报价行「${line.title}」缺节点日期，建项后阶段没有排期`)
      }
    }
  }

  return issues
}

/**
 * 这个案件现在能做什么。
 *
 * 存在的理由是**防止流转断点**：C8 第一版就漏掉了「总监报价中」的录入入口，
 * 结果 Q-030 卡死、「退回总监修改」也成了死胡同。有了这个投影，
 * 任何一个非终态却没有可用动作的状态都会被测试当场抓住。
 */
export type QuoteAction = 'quote' | 'review' | 'send-to-client' | 'client-reply' | 'kickoff'

export function availableActions(state: DemoState, caseId: string): QuoteAction[] {
  const quoteCase = state.quoteCases.find((entry) => entry.id === caseId)
  if (!quoteCase) return []

  const actions: QuoteAction[] = []
  // 只要还没开工、也没被终止，总监就能提交（新）报价。
  // 客户已经看过的报价改了就得重新走复核和送客户，这由 submitQuoteVersion 退回状态保证
  if (quoteCase.status !== 'KickoffSent' && quoteCase.status !== 'Rejected') actions.push('quote')
  if (quoteCase.status === 'AwaitingReview') actions.push('review')
  if (quoteCase.status === 'Approved') actions.push('send-to-client')
  if (quoteCase.status === 'SentToClient') actions.push('client-reply')
  if (quoteCase.status === 'ClientAccepted') actions.push('kickoff')
  return actions
}

/** 终态：没有后续动作是对的，不算断点。 */
export const TERMINAL_QUOTE_STATUSES: QuoteCase['status'][] = ['KickoffSent', 'Rejected']

// ---------------------------------------------------------------- 待办投影

export interface ReviewTodo {
  caseId: string
  caseKind: QuoteCase['kind']
  projectCode: string
  title: string
  personId: string
  personName: string
  /** 这个人在这次复核里承担的全部角色 */
  roles: PersonRole[]
  submittedAt: string
}

/**
 * 待复核清单。
 *
 * **按人合并，不按角色展开。** 组长和 BD 是同一个人时，让他点两次确认不会让审批更严格，
 * 只会让他觉得这个系统不了解公司怎么运转。角色留在 `roles` 里，审计仍然说得清。
 */
export function reviewTodos(state: DemoState): ReviewTodo[] {
  const REVIEW_ROLES: PersonRole[] = ['组长', 'BD']

  return state.quoteCases
    .filter((entry) => entry.status === 'AwaitingReview')
    .map((entry) => {
      const person = personOf(state, entry.reviewerPersonId)
      const version = activeVersion(state, entry.id)
      return {
        caseId: entry.id,
        caseKind: entry.kind,
        projectCode: entry.projectCode,
        title: entry.title,
        personId: entry.reviewerPersonId,
        personName: person?.name ?? entry.reviewerPersonId,
        roles: (person?.roles ?? []).filter((role) => REVIEW_ROLES.includes(role)),
        submittedAt: version?.submittedAt ?? entry.createdAt,
      }
    })
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

export interface SubmitInput {
  lines: QuoteVersion['lines']
  scheduleImpactWorkdays: number
  submittedBy: string
  actor: string
  now: string
}

/**
 * 总监提交报价。
 *
 * 每次提交都是**新版本**，旧版本标记 `supersededAt` 但内容一字不改。
 * 已经复核过的版本更要留着——「改了什么、谁批的哪一版」是结项时唯一说得清的证据。
 */
export function submitQuoteVersion(
  state: DemoState,
  caseId: string,
  input: SubmitInput,
): DemoState {
  const quoteCase = state.quoteCases.find((entry) => entry.id === caseId)
  if (!quoteCase) throw new QuoteBlocked([`找不到报价案件 ${caseId}`])
  if (quoteCase.status === 'KickoffSent') {
    throw new QuoteBlocked(['已经开工的报价不能再改版本，需要新建一张变更单'])
  }

  const previous = versionsOf(state, caseId)
  const version: QuoteVersion = {
    id: nextId(state.quoteVersions.map((entry) => entry.id), `${caseId}/V`, 2),
    caseId,
    version: (previous.at(-1)?.version ?? 0) + 1,
    submittedBy: input.submittedBy,
    submittedAt: input.now,
    lines: input.lines,
    scheduleImpactWorkdays: input.scheduleImpactWorkdays,
  }

  const audit: AuditEvent = {
    id: nextId(state.auditEvents.map((entry) => entry.id), 'AE-', 3),
    at: input.now,
    actor: input.actor,
    action: `总监提交报价 v${version.version}`,
    targetKind: 'QuoteCase',
    targetId: caseId,
    before: quoteCase.activeVersionId ? `v${previous.at(-1)?.version}` : undefined,
    after: `v${version.version}`,
    reason: `${quoteTotals(version).personDays} 人天 · 工期影响 ${input.scheduleImpactWorkdays} 工作日`,
  }

  return {
    ...state,
    quoteVersions: [
      // 旧版本作废但不删——已复核的结论也随之失效，必须重新复核
      ...state.quoteVersions.map((entry) =>
        entry.caseId === caseId && !entry.supersededAt
          ? { ...entry, supersededAt: input.now }
          : entry,
      ),
      version,
    ],
    quoteCases: state.quoteCases.map((entry) =>
      entry.id !== caseId
        ? entry
        : { ...entry, activeVersionId: version.id, status: 'AwaitingReview' as const },
    ),
    auditEvents: [...state.auditEvents, audit],
  }
}

export interface ReviewInput {
  decision: 'approve' | 'reject'
  actor: string
  now: string
  note: string
}

/**
 * 组长/BD 复核。
 *
 * 同一人兼两角时只发生**一次**确认，但 `roles` 与审计里两个角色都写清楚——
 * 让同一个人点两次不会让审批更严格，只会让流程显得不了解公司怎么运转。
 */
export function reviewQuote(state: DemoState, caseId: string, input: ReviewInput): DemoState {
  const quoteCase = state.quoteCases.find((entry) => entry.id === caseId)
  if (!quoteCase) throw new QuoteBlocked([`找不到报价案件 ${caseId}`])

  const version = activeVersion(state, caseId)
  if (!version) throw new QuoteBlocked(['还没有有效报价版本'])
  if (version.review) throw new QuoteBlocked(['当前版本已经复核过，改动请让总监提交新版本'])

  if (input.decision === 'approve') {
    const issues = reviewBlockingIssues(version)
    if (issues.length > 0) throw new QuoteBlocked(issues)
  }

  const person = personOf(state, quoteCase.reviewerPersonId)
  const roles = (person?.roles ?? []).filter((role) => role === '组长' || role === 'BD')
  const roleLabel = roles.length > 0 ? roles.join('兼') : '复核人'

  const audit: AuditEvent = {
    id: nextId(state.auditEvents.map((entry) => entry.id), 'AE-', 3),
    at: input.now,
    actor: `${person?.name ?? input.actor}（${roleLabel}）`,
    action: input.decision === 'approve' ? '复核通过报价' : '复核驳回报价',
    targetKind: 'QuoteCase',
    targetId: caseId,
    before: 'AwaitingReview',
    after: input.decision === 'approve' ? 'Approved' : 'DirectorQuoting',
    reason: input.note,
  }

  return {
    ...state,
    quoteVersions: state.quoteVersions.map((entry) =>
      entry.id !== version.id
        ? entry
        : {
            ...entry,
            review: {
              personId: quoteCase.reviewerPersonId,
              roles,
              decision: input.decision,
              decidedAt: input.now,
              note: input.note,
            },
          },
    ),
    quoteCases: state.quoteCases.map((entry) =>
      entry.id !== caseId
        ? entry
        : {
            ...entry,
            // 驳回退回总监重报，不是终止——终止是另一个动作
            status: input.decision === 'approve' ? ('Approved' as const) : ('DirectorQuoting' as const),
          },
    ),
    auditEvents: [...state.auditEvents, audit],
  }
}

// ---------------------------------------------------------------- 立案

export interface CreateQuoteCaseInput {
  kind: QuoteKind
  /** 首次报价是**提议的**批次编号；追加报价是已存在项目的编号 */
  projectCode: string
  title: string
  requirement: string
  /** 首次报价必填；追加报价从项目上取 */
  client?: string
  dueDate?: string
  /** 追加报价必填 */
  affectedAssetIds?: string[]
  /** 从收件箱确认过来时带上原始证据 */
  evidence?: EvidenceRef[]
  sourceLabel?: string
  actor: string
  now: string
}

export function createQuoteCaseIssues(state: DemoState, input: CreateQuoteCaseInput): string[] {
  const issues: string[] = []
  const code = input.projectCode.trim()

  if (!input.title.trim()) issues.push('需求标题不能为空')
  if (!input.requirement.trim()) issues.push('需求描述不能为空——总监拿着空白没法报价')

  const project = state.projects.find((entry) => entry.code === code)

  if (input.kind === 'initial') {
    if (!code) {
      issues.push('批次编号不能为空')
    } else if (!parseBatchCode(code).valid) {
      issues.push(`批次编号「${code}」不符合规范 ${BATCH_CODE_RULE}，例如 ${BATCH_CODE_EXAMPLE}`)
    } else if (project) {
      issues.push(`${code} 已经是正式项目了，追加需求请录成追加报价，不要新开首次报价`)
    } else if (state.quoteCases.some((entry) => entry.projectCode === code && entry.kind === 'initial')) {
      issues.push(`${code} 已经有一张首次报价案件了，不要重复立案`)
    }
    if (!input.client?.trim()) issues.push('客户不能为空')
  } else {
    if (!project) {
      issues.push(`${code || '（空）'} 不是正式项目，追加报价必须挂在已开工的项目上`)
    } else {
      const assets = input.affectedAssetIds ?? []
      if (assets.length === 0) issues.push('追加报价必须指明受影响资产，否则不知道该冻结什么')
      for (const assetId of assets) {
        if (!project.assets.some((asset) => asset.id === assetId)) {
          issues.push(`资产 ${assetId} 不属于 ${code}`)
        }
      }
    }
  }

  // 复核人按角色取，不写死某个人。取不到就诚实阻断——
  // 建一个没人复核的案件，等于把「开工前必须复核」这道门悄悄拆了
  if (!findReviewer(state)) issues.push('成员里没有组长或 BD，报价案件没有复核人，无法创建')

  return issues
}

function findReviewer(state: DemoState): Person | undefined {
  return (
    state.people.find((person) => person.roles.includes('组长')) ??
    state.people.find((person) => person.roles.includes('BD'))
  )
}

/**
 * 立一张报价案件。
 *
 * 需求可以从收件箱确认进来，也可以由 PM 当面听完直接录——两条路进的是同一个函数，
 * 不允许各拼各的 `QuoteCase`，否则迟早出现「收件箱建的能复核、手工建的不能」。
 *
 * 建出来的案件停在「总监报价中」且**没有任何报价版本**：
 * 立案只是承认「这是一条真需求」，人天和金额得总监自己填。
 */
export function createQuoteCase(state: DemoState, input: CreateQuoteCaseInput): DemoState {
  const issues = createQuoteCaseIssues(state, input)
  if (issues.length > 0) throw new QuoteBlocked(issues)

  const code = input.projectCode.trim()
  const project = state.projects.find((entry) => entry.code === code)
  const caseId = nextId(state.quoteCases.map((entry) => entry.id), input.kind === 'change' ? 'CQ-' : 'Q-', 3)
  const discipline = project?.discipline ?? (parseBatchCode(code).discipline === '2D' ? '2D' : '3D')

  const quoteCase: QuoteCase = {
    id: caseId,
    kind: input.kind,
    projectCode: code,
    client: (project?.client ?? input.client ?? '').trim(),
    title: input.title.trim(),
    requirement: input.requirement.trim(),
    status: 'DirectorQuoting',
    affectedAssetIds: input.kind === 'change' ? (input.affectedAssetIds ?? []) : [],
    directorName:
      project?.artDirectorName ??
      state.people.find((person) => person.roles.includes('艺术总监'))?.name ??
      '待指派',
    reviewerPersonId: findReviewer(state)!.id,
    createdAt: input.now,
    dueDate: input.dueDate,
    discipline,
    evidence: input.evidence ?? [],
  }

  const audit: AuditEvent = {
    id: nextId(state.auditEvents.map((entry) => entry.id), 'AE-', 3),
    at: input.now,
    actor: input.actor,
    action: `录入${QUOTE_KIND_LABEL[input.kind]}需求`,
    targetKind: 'QuoteCase',
    targetId: caseId,
    after: quoteCase.title,
    reason: input.sourceLabel ?? '由 PM 在报价与变更直接录入',
  }

  return {
    ...state,
    quoteCases: [...state.quoteCases, quoteCase],
    auditEvents: [...state.auditEvents, audit],
  }
}

// ---------------------------------------------------------------- 送客户与客户回复

export interface ClientStepInput {
  actor: string
  now: string
  /** BD 实际用哪个渠道发的 / 客户从哪个渠道回的，作为人工声明的证据 */
  via: string
  note?: string
}

/**
 * BD 把复核通过的报价报给客户。
 *
 * 工作台不发信，这里记的是 BD 的人工声明。发出之后进入等客户的窗口——
 * 这段时间是客户占用的，和团队产能无关，所以必须是一个能看见的独立状态。
 */
export function sendToClient(state: DemoState, caseId: string, input: ClientStepInput): DemoState {
  const quoteCase = state.quoteCases.find((entry) => entry.id === caseId)
  if (!quoteCase) throw new QuoteBlocked([`找不到报价案件 ${caseId}`])
  if (quoteCase.status !== 'Approved') {
    throw new QuoteBlocked([
      `${QUOTE_STATUS_LABEL[quoteCase.status]}：只有复核通过的报价才能报给客户`,
    ])
  }

  const audit: AuditEvent = {
    id: nextId(state.auditEvents.map((entry) => entry.id), 'AE-', 3),
    at: input.now,
    actor: input.actor,
    action: 'BD 已将报价报给客户',
    targetKind: 'QuoteCase',
    targetId: caseId,
    before: quoteCase.status,
    after: 'SentToClient',
    reason: `${input.actor} 声明已通过${input.via}报给 ${quoteCase.client}；工作台未执行发送`,
  }

  return {
    ...state,
    quoteCases: state.quoteCases.map((entry) =>
      entry.id !== caseId
        ? entry
        : { ...entry, status: 'SentToClient' as const, sentToClientAt: input.now, sentToClientBy: input.actor },
    ),
    auditEvents: [...state.auditEvents, audit],
  }
}

/**
 * BD 回传客户的答复。
 *
 * 客户不接受就是**终止**，不是退回总监重报——重报是另一件事（总监再提交新版本）。
 * 这条路径也是 `Rejected` 唯一的入口：以前它在类型里存在却永远到不了。
 */
export function recordClientReply(
  state: DemoState,
  caseId: string,
  decision: 'accept' | 'decline',
  input: ClientStepInput,
): DemoState {
  const quoteCase = state.quoteCases.find((entry) => entry.id === caseId)
  if (!quoteCase) throw new QuoteBlocked([`找不到报价案件 ${caseId}`])
  if (quoteCase.status !== 'SentToClient') {
    throw new QuoteBlocked([
      `${QUOTE_STATUS_LABEL[quoteCase.status]}：报价还没报给客户，谈不上客户答复`,
    ])
  }
  if (decision === 'decline' && !input.note?.trim()) {
    throw new QuoteBlocked(['客户未接受时必须记下原因——价格、排期还是范围，下次报价要用'])
  }

  const next = decision === 'accept' ? ('ClientAccepted' as const) : ('Rejected' as const)
  const audit: AuditEvent = {
    id: nextId(state.auditEvents.map((entry) => entry.id), 'AE-', 3),
    at: input.now,
    actor: input.actor,
    action: decision === 'accept' ? '客户确认接受报价' : '客户未接受报价，案件终止',
    targetKind: 'QuoteCase',
    targetId: caseId,
    before: quoteCase.status,
    after: next,
    reason: `${input.actor} 由${input.via}回传${input.note ? `：${input.note.trim()}` : ''}`,
  }

  return {
    ...state,
    quoteCases: state.quoteCases.map((entry) =>
      entry.id !== caseId
        ? entry
        : {
            ...entry,
            status: next,
            clientRepliedAt: input.now,
            clientReplyNote: input.note?.trim(),
          },
    ),
    auditEvents: [...state.auditEvents, audit],
  }
}

/**
 * 从报价单建出项目、资产与阶段。
 *
 * 阶段就是报价行——报价报的是什么，做的就是什么，两边不该各写一套。
 * 制作组按 2D/3D 匹配，匹配不到就用第一个同工种的组。
 */
function createProjectFromQuote(
  state: DemoState,
  quoteCase: QuoteCase,
  version: QuoteVersion,
  input: KickoffInput,
): DemoState {
  const parsed = parseBatchCode(quoteCase.projectCode)
  const discipline = quoteCase.discipline ?? (parsed.discipline === '2D' ? '2D' : '3D')
  const group =
    state.productionGroups.find((entry) => entry.discipline === discipline) ??
    state.productionGroups[0]
  const pm = state.people.find((person) => person.roles.includes('PM'))
  const director = state.people.find((person) => person.roles.includes('艺术总监'))

  const byAsset = new Map<string, typeof version.lines>()
  for (const line of version.lines) {
    byAsset.set(line.assetId, [...(byAsset.get(line.assetId) ?? []), line])
  }

  const assets: Asset[] = [...byAsset.entries()].map(([assetId, lines]) => ({
    id: assetId,
    name: lines[0]?.title ?? assetId,
    discipline,
    projectCode: quoteCase.projectCode,
    stages: lines.map((line) => ({
      id: `${quoteCase.projectCode}/${assetId}/${line.stageCode}`,
      code: line.stageCode,
      name: STAGE_LABEL[line.stageCode],
      assetId,
      productionGroupId: group?.id ?? '',
      ownerName: group?.name ?? '待指派',
      estimatedPersonDays: line.personDays,
      // 开工那一刻的报价节点**同时**成为基准和当前计划。
      // 基准从此不再被任何修订覆盖，后面所有偏差都以它为准
      baselineStart: line.plannedStart!,
      baselineFinish: line.plannedFinish!,
      currentStart: line.plannedStart!,
      currentFinish: line.plannedFinish!,
      dependsOn: [],
      status: 'NotStarted' as const,
      flags: [],
    })),
  }))

  const project: Project = {
    id: `prj-${quoteCase.projectCode.toLowerCase()}`,
    code: quoteCase.projectCode,
    name: quoteCase.title,
    client: quoteCase.client,
    discipline,
    status: 'InProduction',
    pmName: pm?.name ?? input.actor,
    artDirectorName: director?.name ?? quoteCase.directorName,
    calendarId: state.calendars[0]?.id ?? '',
    assets,
  }

  const audit: AuditEvent = {
    id: nextId(state.auditEvents.map((entry) => entry.id), 'AE-', 3),
    at: input.now,
    actor: input.actor,
    action: '客户确认后正式建项',
    targetKind: 'Project',
    targetId: project.code,
    after: `${assets.length} 个资产 · ${version.lines.length} 个阶段`,
    reason: `由报价 ${quoteCase.id} 的 ${version.id} 生成；基准排期即报价节点`,
  }

  return {
    ...state,
    projects: [...state.projects, project],
    auditEvents: [...state.auditEvents, audit],
  }
}

export interface KickoffInput {
  actor: string
  now: string
  /** PM 实际用哪个渠道发的开工邮件，作为人工确认证据 */
  via: string
}

/**
 * PM 发出开工邮件。
 *
 * 这是整条链上**唯一真正改动排期的动作**，也是不可逆的分界点。
 * 与通知草稿一样，「发出」是 PM 的人工声明——工作台没有邮件通道，也不假装有。
 *
 * 事务边界：先把所有写入算完，任何一处算不出来就整体抛出，state 保持原样。
 */
export function sendKickoff(state: DemoState, caseId: string, input: KickoffInput): DemoState {
  const issues = kickoffBlockingIssues(state, caseId)
  if (issues.length > 0) throw new QuoteBlocked(issues)

  const quoteCase = state.quoteCases.find((entry) => entry.id === caseId)!
  const version = activeVersion(state, caseId)!

  // 首次报价走到这一步才**正式接入项目**：项目、资产、阶段都从报价单生出来。
  // 这就是「客户确认后才算正式接项目」在数据上的落点——
  // 在这之前，那个批次编号只是一个提议。
  const justCreated =
    quoteCase.kind === 'initial' && !state.projects.some((p) => p.code === quoteCase.projectCode)
  if (justCreated) state = createProjectFromQuote(state, quoteCase, version, input)

  // 先解析全部报价行指向的阶段。有一条对不上就整体拒绝，不允许「改了一半」
  const changes: StageDateChange[] = []
  const resolved = new Map<string, { start: string; finish: string }>()

  for (const line of version.lines) {
    const stage = findStage(state, quoteCase.projectCode, line.assetId, line.stageCode)
    if (!stage) {
      throw new QuoteBlocked([
        `报价行「${line.title}」指向的 ${line.assetId} / ${line.stageCode} 在正式排期里不存在`,
      ])
    }
    if (!line.plannedStart || !line.plannedFinish) {
      throw new QuoteBlocked([`报价行「${line.title}」缺节点日期`])
    }
    resolved.set(stage.id, { start: line.plannedStart, finish: line.plannedFinish })
    changes.push({
      stageId: stage.id,
      oldStart: stage.currentStart,
      oldFinish: stage.currentFinish,
      newStart: line.plannedStart,
      newFinish: line.plannedFinish,
      shiftedWorkdays: version.scheduleImpactWorkdays,
    })
  }

  /**
   * 刚建出来的项目**不产生排期修订**。
   *
   * 修订是「相对基准改了什么」的记录，新项目的基准就是这份报价单本身，
   * 没有前一版可比。硬记一条会出现 `08-17 → 08-17（+15 工作日）` 这种
   * 自己改自己的假修订，还会让「生效修订数」凭空多一。建项已经写了审计。
   */
  const revisionId = justCreated
    ? undefined
    : nextId(state.revisions.map((entry) => entry.id), `REV-${quoteCase.projectCode}-`, 1)

  const revision: ScheduleRevision | undefined = revisionId
    ? {
        id: revisionId,
        version:
          state.revisions.filter((entry) => entry.projectCode === quoteCase.projectCode).length + 1,
        projectCode: quoteCase.projectCode,
        assetId: quoteCase.affectedAssetIds[0] ?? '',
        sourceFeedbackItemId: quoteCase.sourceFeedbackItemId,
        reason: 'scope-change',
        note: `${caseId} v${version.version} ${quoteCase.kind === 'change' ? '变更开工' : '开工'}`,
        confirmedBy: input.actor,
        confirmedAt: input.now,
        changes,
      }
    : undefined

  const projects = state.projects.map((project) =>
    project.code !== quoteCase.projectCode
      ? project
      : {
          ...project,
          assets: project.assets.map((asset) =>
            // 只碰受影响资产。其他资产从头到尾没被冻，也不该被这次开工动到
            !quoteCase.affectedAssetIds.includes(asset.id)
              ? asset
              : {
                  ...asset,
                  stages: asset.stages.map((stage) => applyKickoff(stage, resolved.get(stage.id))),
                },
          ),
        },
  )

  const isChange = quoteCase.kind === 'change'
  const notification: NotificationDraft = {
    id: nextId(state.notificationDrafts.map((entry) => entry.id), 'ND-', 3),
    recipientRole: '组长',
    recipientName: personOf(state, quoteCase.reviewerPersonId)?.name ?? '组长',
    subject: `【${isChange ? '变更开工' : '正式开工'}】${quoteCase.projectCode} · ${quoteCase.title}`,
    body: isChange
      ? `${caseId} v${version.version} 已复核通过，追加 ${quoteTotals(version).personDays} 人天，工期 +${version.scheduleImpactWorkdays} 工作日。受影响资产：${quoteCase.affectedAssetIds.join('、')}。`
      : `${caseId} v${version.version} 客户已确认，共 ${quoteTotals(version).personDays} 人天。${justCreated ? `项目 ${quoteCase.projectCode} 已按报价单建出 ${version.lines.length} 个阶段，报价节点即基准排期。` : ''}`,
    sourceKind: 'kickoff',
    sourceId: caseId,
    // 工作台不发信：这封是草稿，PM 自己在 Outlook 发出后回来标记
    status: 'draft',
  }

  const audit: AuditEvent = {
    id: nextId(state.auditEvents.map((entry) => entry.id), 'AE-', 3),
    at: input.now,
    actor: input.actor,
    action: quoteCase.kind === 'change' ? '发出变更开工邮件' : '发出正式开工邮件',
    targetKind: 'QuoteCase',
    targetId: caseId,
    before: 'ClientAccepted',
    after: 'KickoffSent',
    reason: justCreated
      ? `经 ${input.via} 发出 · 按报价单建出 ${quoteCase.projectCode}`
      : `经 ${input.via} 发出 · 解冻 ${quoteCase.affectedAssetIds.join('、')} · 排期修订 ${revisionId}`,
  }

  return {
    ...state,
    projects,
    revisions: revision ? [...state.revisions, revision] : state.revisions,
    notificationDrafts: [...state.notificationDrafts, notification],
    quoteCases: state.quoteCases.map((entry) =>
      entry.id !== caseId
        ? entry
        : {
            ...entry,
            status: 'KickoffSent' as const,
            kickoffSentAt: input.now,
            kickoffSentBy: input.actor,
          },
    ),
    changeRequests: state.changeRequests.map((entry) =>
      entry.id !== quoteCase.changeRequestId ? entry : { ...entry, status: 'ChangeKickoffSent' as const },
    ),
    auditEvents: [...state.auditEvents, audit],
  }
}

function applyKickoff(
  stage: StagePlan,
  dates: { start: string; finish: string } | undefined,
): StagePlan {
  // 解冻：变更已经开工，这些阶段不再「等待变更报价」
  const flags = stage.flags.filter((flag) => flag !== 'WaitingChangeQuote')
  if (!dates) return flags.length === stage.flags.length ? stage : { ...stage, flags }

  return {
    ...stage,
    flags,
    // 只写当前计划。基准是签下来的那一版，永远不动
    currentStart: dates.start,
    currentFinish: dates.finish,
    revisionReason: 'scope-change',
  }
}

function findStage(
  state: DemoState,
  projectCode: string,
  assetId: string,
  stageCode: string,
): StagePlan | undefined {
  const project = state.projects.find((entry) => entry.code === projectCode)
  const asset = project?.assets.find((entry) => entry.id === assetId)
  return asset?.stages.find((entry) => entry.code === stageCode)
}

// ---------------------------------------------------------------- 标签

export const QUOTE_STATUS_LABEL: Record<QuoteCase['status'], string> = {
  Received: '待分派',
  Assigned: '已分派总监',
  DirectorQuoting: '总监报价中',
  AwaitingReview: '等待组长/BD 复核',
  Approved: '复核通过 · 待报给客户',
  SentToClient: '已报客户 · 等客户确认',
  ClientAccepted: '客户已确认 · 待开工建项',
  KickoffSent: '已开工',
  Rejected: '客户未接受 · 已终止',
}

export const QUOTE_KIND_LABEL: Record<QuoteCase['kind'], string> = {
  initial: '首次报价',
  change: '追加报价',
}
