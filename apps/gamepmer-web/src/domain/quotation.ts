import type {
  AuditEvent,
  DemoState,
  NotificationDraft,
  Person,
  PersonRole,
  QuoteCase,
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
  if (quoteCase.status === 'Rejected') issues.push('该报价已被驳回')

  const version = activeVersion(state, caseId)
  if (!version) {
    issues.push('还没有有效报价版本')
    return issues
  }
  if (!version.review || version.review.decision !== 'approve') {
    issues.push('当前版本尚未通过组长/BD 复核')
  }
  issues.push(...reviewBlockingIssues(version))

  // 报价行必须能落到正式排期上。首次报价常常在项目还没建出来时就批了——
  // 那时候「开工」无处可写，与其假装成功，不如说清楚缺什么。
  const project = state.projects.find((entry) => entry.code === quoteCase.projectCode)
  if (!project) {
    issues.push(`${quoteCase.projectCode} 还不是正式项目，需要先建项目与资产（本切片未实现建项）`)
  } else {
    for (const line of version.lines) {
      if (!findStage(state, quoteCase.projectCode, line.assetId, line.stageCode)) {
        issues.push(`报价行「${line.title}」指向的 ${line.assetId} / ${line.stageCode} 在正式排期里不存在`)
      }
    }
  }

  return issues
}

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

  const revisionId = nextId(state.revisions.map((entry) => entry.id), `REV-${quoteCase.projectCode}-`, 1)
  const revision: ScheduleRevision = {
    id: revisionId,
    version: state.revisions.filter((entry) => entry.projectCode === quoteCase.projectCode).length + 1,
    projectCode: quoteCase.projectCode,
    assetId: quoteCase.affectedAssetIds[0] ?? '',
    sourceFeedbackItemId: quoteCase.sourceFeedbackItemId,
    reason: 'scope-change',
    note: `${caseId} v${version.version} 变更开工`,
    confirmedBy: input.actor,
    confirmedAt: input.now,
    changes,
  }

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

  const notification: NotificationDraft = {
    id: nextId(state.notificationDrafts.map((entry) => entry.id), 'ND-', 3),
    recipientRole: '组长',
    recipientName: personOf(state, quoteCase.reviewerPersonId)?.name ?? '组长',
    subject: `【变更开工】${quoteCase.projectCode} · ${quoteCase.title}`,
    body: `${caseId} v${version.version} 已复核通过，追加 ${quoteTotals(version).personDays} 人天，工期 +${version.scheduleImpactWorkdays} 工作日。受影响资产：${quoteCase.affectedAssetIds.join('、')}。`,
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
    before: 'Approved',
    after: 'KickoffSent',
    reason: `经 ${input.via} 发出 · 解冻 ${quoteCase.affectedAssetIds.join('、')} · 排期修订 ${revisionId}`,
  }

  return {
    ...state,
    projects,
    revisions: [...state.revisions, revision],
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
  Approved: '复核通过 · 待发开工邮件',
  KickoffSent: '已开工',
  Rejected: '已驳回',
}

export const QUOTE_KIND_LABEL: Record<QuoteCase['kind'], string> = {
  initial: '首次报价',
  change: '追加报价',
}
