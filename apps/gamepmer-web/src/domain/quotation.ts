import { BATCH_CODE_EXAMPLE, BATCH_CODE_RULE, parseBatchCode } from './batchCode'
import { STAGE_LABEL } from './model'
import type {
  Asset,
  AuditEvent,
  ChangeRequest,
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
  if (quoteCase.status === 'Rejected') issues.push('客户未接受该报价，先决定重报还是不接')
  if (quoteCase.status === 'Approved') issues.push('复核通过了，但还没报给客户')
  if (quoteCase.status === 'SentToClient') issues.push('还在等客户确认，客户没点头不能开工')
  // 这两条以前漏了，后果不是「按钮多显示一个」：一张已经放弃的报价
  // 走到这里会**零阻断**，于是 sendKickoff 照常建项、照常写排期——
  // 一单没接到的活凭空变成正式项目。
  if (quoteCase.status === 'Abandoned') issues.push('该变更已放弃，不能再开工')
  if (quoteCase.status === 'NotEngaged') issues.push('这单已确认不接入，不能开工')

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
export type QuoteAction =
  | 'quote'
  | 'review'
  | 'send-to-client'
  | 'client-reply'
  | 'kickoff'
  | 'requote'
  | 'abandon'
  | 'not-engaged'
  | 'delete'

export function availableActions(state: DemoState, caseId: string): QuoteAction[] {
  const quoteCase = state.quoteCases.find((entry) => entry.id === caseId)
  if (!quoteCase) return []

  const actions: QuoteAction[] = []
  // 只要还没开工、也没被终止，总监就能提交（新）报价。
  // 客户已经看过的报价改了就得重新走复核和送客户，这由 submitQuoteVersion 退回状态保证
  if (!TERMINAL_QUOTE_STATUSES.includes(quoteCase.status) && quoteCase.status !== 'Rejected') {
    actions.push('quote')
  }
  if (quoteCase.status === 'AwaitingReview') actions.push('review')
  if (quoteCase.status === 'Approved') actions.push('send-to-client')
  if (quoteCase.status === 'SentToClient') actions.push('client-reply')
  if (quoteCase.status === 'ClientAccepted') actions.push('kickoff')
  // 客户嫌贵不等于这件事结束了：要么降价重报，要么就此打住。
  //
  // 「打住」对两种案件是**不同的事**，不能共用一个动作：
  // 追加报价放弃的是这个变更，项目还在，受影响阶段要在这一刻解冻；
  // 首次报价被否掉时项目根本还没建出来，没有阶段可解冻——那是「这单没接到」。
  // 以前两者都给 abandon，于是首次报价点下去看到的是「已解冻受影响阶段」，
  // 指着一堆并不存在的阶段说话。
  if (quoteCase.status === 'Rejected') {
    actions.push('requote')
    if (quoteCase.kind === 'change') actions.push('abandon')
  }
  /**
   * 作废：**开工之前的任何阶段都给**。
   *
   * 以前只在「客户未接受」时才有，于是一张立错编号、停在总监报价中的空案件
   * 想删掉，得先录一版报价、走复核、报给客户、再让客户否掉——
   * 为了删一张空单把整条流程演一遍。立错案是最常见的操作，不该这么贵。
   */
  if (!TERMINAL_QUOTE_STATUSES.includes(quoteCase.status)) actions.push('not-engaged')
  // 作废掉的单子长期占着列表没有意义，所以这一态额外允许删除
  if (quoteCase.status === 'NotEngaged') actions.push('delete')
  return actions
}

/** 终态：没有后续动作是对的，不算断点。 */
/** 真正走到头的两个。`Rejected` 不在其中——它还等着 PM 决定重报还是放弃 */
export const TERMINAL_QUOTE_STATUSES: QuoteCase['status'][] = [
  'KickoffSent',
  'Abandoned',
  'NotEngaged',
]

/**
 * 「这单没成」的两个终态。
 *
 * 与 `TERMINAL_QUOTE_STATUSES` 的区别是少了 `KickoffSent`——开工了是成了，
 * 那个批次编号已经变成正式项目，当然还占着。这里指的是**没做成**，
 * 编号该还回去给下一次报价用。
 */
export const DEAD_QUOTE_STATUSES: QuoteCase['status'][] = ['Abandoned', 'NotEngaged']

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

// ---------------------------------------------------------------- 待立案与冻结

export interface PendingChangeRequest {
  request: ChangeRequest
  /** 被这条变更单冻住的阶段。不一起给出来，PM 还得自己去甘特上找 */
  frozenStages: Array<{ assetId: string; stageId: string; stageName: string }>
}

/**
 * 判为范围外、但还没立报价案件的变更单。
 *
 * `classifyOutOfScope` 只建变更单并冻结阶段，**不自动建报价案件**——
 * 报价是人的判断，不该由一次分流点击顺手带出来。
 * 但这意味着这段时间里阶段冻着、指标数着，列表里却没有一行能点：
 * 所以这条投影必须存在，且必须出现在报价页的「处理中」里。
 */
export function pendingChangeRequests(state: DemoState): PendingChangeRequest[] {
  return state.changeRequests
    .filter(
      (request) =>
        request.status === 'ClassifiedExtra' &&
        !request.quoteCaseId &&
        !state.quoteCases.some((entry) => entry.changeRequestId === request.id || entry.id === request.id),
    )
    .map((request) => {
      // 只认**这条**变更单冻的那个阶段。
      // 按「项目 + 资产」筛会把同资产上别的变更单冻的阶段也算进来，
      // 界面上就会出现「CQ-005 冻住 高模、烘焙」而烘焙其实是 CQ-004 冻的。
      const item = state.feedbackBatches
        .flatMap((batch) => batch.items)
        .find((entry) => entry.id === request.sourceFeedbackItemId)

      const frozenStages = state.projects
        .filter((project) => project.code === request.projectCode)
        .flatMap((project) => project.assets)
        .flatMap((asset) => asset.stages)
        .filter((stage) => stage.id === item?.stageId && stage.flags.includes('WaitingChangeQuote'))
        .map((stage) => ({ assetId: stage.assetId, stageId: stage.id, stageName: stage.name }))

      return { request, frozenStages }
    })
}

// ---------------------------------------------------------------- 等谁

export type WaitingActor = 'me' | 'director' | 'reviewer' | 'client'

export interface WaitingOn {
  actor: WaitingActor
  /** 界面上的徽标文字 */
  label: string
  /** 下一步具体要做什么。只说「进行中」等于没说 */
  next: string
  /** 责任是否在 PM 自己——「待我处理」就是按这个筛的 */
  mine: boolean
}

const WAITING_BY_STATUS: Record<QuoteCase['status'], WaitingOn | undefined> = {
  Received: { actor: 'me', label: '等我', next: '派给 2D/3D 总监', mine: true },
  Assigned: { actor: 'director', label: '等总监', next: '总监出人天与节点', mine: false },
  DirectorQuoting: {
    actor: 'director',
    label: '等总监',
    next: '总监出人天与节点（你也可以代录）',
    mine: false,
  },
  AwaitingReview: { actor: 'reviewer', label: '等复核', next: '组长/BD 确认人天与节点', mine: false },
  Approved: { actor: 'me', label: '等报客户', next: 'BD 把报价报给客户', mine: true },
  SentToClient: { actor: 'client', label: '等客户', next: '等客户回话，可催一次', mine: false },
  ClientAccepted: { actor: 'me', label: '等我', next: '发出开工通知（首次报价会同时建项）', mine: true },
  // 这一条的下一步随案件类型不同，见 quoteWaitingOn 里的改写
  Rejected: {
    actor: 'me',
    label: '等我',
    next: '客户嫌贵：降价重报，或者就此收尾',
    mine: true,
  },
  KickoffSent: undefined,
  Abandoned: undefined,
  NotEngaged: undefined,
}

/**
 * 这个案件在等谁。
 *
 * 原来左侧按状态区间分三桶，结果案件一过复核「处理中」就空了，
 * 而真正等 PM 动手的两步跑到了「客户环节」——那个名字读不出「该我做」。
 * 按**责任在谁**分才不会漏。
 */
export function quoteWaitingOn(state: DemoState, caseId: string): WaitingOn | undefined {
  const quoteCase = state.quoteCases.find((entry) => entry.id === caseId)
  if (!quoteCase) return undefined
  const waiting = WAITING_BY_STATUS[quoteCase.status]
  if (!waiting) return undefined

  // 客户否掉之后的下一步，两种案件不一样：追加报价放弃的是这个变更、要解冻阶段；
  // 首次报价连项目都没建，只有「这单没接到」。列表里的提示也得跟着分开说，
  // 否则详情面板已经改对了，左侧仍在教人去点一个并不存在的按钮。
  if (quoteCase.status === 'Rejected') {
    return {
      ...waiting,
      next:
        quoteCase.kind === 'change'
          ? '客户嫌贵：降价重报，或者放弃这个变更（放弃即解冻受影响阶段）'
          : '客户嫌贵：降价重报，或者确认不接这单（收尾后编号可重用）',
    }
  }
  return waiting
}

export interface QuoteTodo {
  id: string
  kind: 'quote-case' | 'change-request'
  title: string
  projectCode: string
  waiting: WaitingOn
  mine: boolean
  next: string
  quoteCase?: QuoteCase
  pending?: PendingChangeRequest
}

/**
 * 报价环节的全部待办。
 *
 * **跨全部状态收集**，包括还没立案的变更单——按状态区间分桶正是上次漏掉的原因。
 * 责任在自己的排前面：PM 打开这一页是想知道「该我做什么」，不是想读状态机。
 */
export function quoteTodoList(state: DemoState): QuoteTodo[] {
  const fromCases: QuoteTodo[] = state.quoteCases
    .map((quoteCase) => ({ quoteCase, waiting: WAITING_BY_STATUS[quoteCase.status] }))
    .filter((row): row is { quoteCase: QuoteCase; waiting: WaitingOn } => Boolean(row.waiting))
    .map(({ quoteCase, waiting }) => ({
      id: quoteCase.id,
      kind: 'quote-case' as const,
      title: quoteCase.title,
      projectCode: quoteCase.projectCode,
      waiting,
      mine: waiting.mine,
      next: waiting.next,
      quoteCase,
    }))

  const fromPending: QuoteTodo[] = pendingChangeRequests(state).map((pending) => ({
    id: pending.request.id,
    kind: 'change-request' as const,
    title: pending.request.title,
    projectCode: pending.request.projectCode,
    waiting: { actor: 'me', label: '等我', next: '立报价案件交给总监', mine: true },
    mine: true,
    next: '立报价案件交给总监',
    pending,
  }))

  // 等我的排前面，其余按新到旧
  return [...fromPending, ...fromCases].sort((a, b) => Number(b.mine) - Number(a.mine))
}

export interface FrozenSummary {
  assets: number
  stages: number
  /** 每个冻结阶段靠哪条待办解冻。说不出解法的告警等于噪音 */
  unfreezeVia: Array<{
    stageId: string
    stageName: string
    assetId: string
    caseId?: string
    changeRequestId?: string
    next: string
  }>
}

/**
 * 冻结统计。
 *
 * **资产数和阶段数是两个数。** 界面上写「资产冻结中」却拿阶段数去填，
 * 同一资产冻两个阶段时就会显示 2，而实际只有 1 个资产被卡住。
 *
 * 更要紧的是 `unfreezeVia`：验收时的原话是「不知道怎么操作才能消除这个异常」。
 * 一个说不出怎么消的告警，挂在那里只会让人学会无视它。
 */
export function frozenSummary(state: DemoState): FrozenSummary {
  const stages = state.projects
    .flatMap((project) => project.assets)
    .flatMap((asset) => asset.stages)
    .filter((stage) => stage.flags.includes('WaitingChangeQuote'))

  const unfreezeVia = stages.map((stage) => {
    // 冻结只会由「判为范围外」产生，所以一定能追回那条变更单
    const request = state.changeRequests.find((entry) => {
      const item = state.feedbackBatches
        .flatMap((batch) => batch.items)
        .find((row) => row.id === entry.sourceFeedbackItemId)
      return item?.stageId === stage.id
    })
    const quoteCase = request
      ? state.quoteCases.find(
          (entry) => entry.changeRequestId === request.id || entry.id === request.id,
        )
      : undefined

    return {
      stageId: stage.id,
      stageName: stage.name,
      assetId: stage.assetId,
      caseId: quoteCase?.id,
      changeRequestId: request?.id,
      next: quoteCase
        ? `${quoteCase.id}：${WAITING_BY_STATUS[quoteCase.status]?.next ?? '已走完，发出变更开工邮件即解冻'}`
        : request
          ? `${request.id}：先立报价案件`
          : '找不到对应的变更单，请检查反馈分流记录',
    }
  })

  return {
    assets: new Set(stages.map((stage) => stage.assetId)).size,
    stages: stages.length,
    unfreezeVia,
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
  /** 由「待立案」的变更单立案时回填，两边从此互相指得到 */
  changeRequestId?: string
  sourceFeedbackItemId?: string
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
    } else if (
      state.quoteCases.some(
        (entry) =>
          entry.projectCode === code &&
          entry.kind === 'initial' &&
          // 已经走到终态的单子不再占着编号。客户嫌贵没接成、后来又回头谈，
          // 这时必须能用同一个批次编号重开一张——一张死掉的单子永久霸占编号，
          // 只会逼着人去编一个 B01A 之类的假编号，编号从此对不上公司的实际批次。
          !DEAD_QUOTE_STATUSES.includes(entry.status),
      )
    ) {
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
    changeRequestId: input.changeRequestId,
    sourceFeedbackItemId: input.sourceFeedbackItemId,
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
    // 变更单回指报价案件，「待立案」清单据此把它摘掉
    changeRequests: state.changeRequests.map((entry) =>
      entry.id !== input.changeRequestId
        ? entry
        : { ...entry, status: 'Quoting' as const, quoteCaseId: caseId },
    ),
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

// ---------------------------------------------------------------- 客户否掉之后

/**
 * 降价重报。
 *
 * 案件回到「总监报价中」，受影响阶段**继续冻着**——还在谈，不该现在动工。
 * 原报价版本不删不改，新版本另起一版。
 */
export function requoteCase(state: DemoState, caseId: string, input: ClientStepInput): DemoState {
  const quoteCase = state.quoteCases.find((entry) => entry.id === caseId)
  if (!quoteCase) throw new QuoteBlocked([`找不到报价案件 ${caseId}`])
  if (quoteCase.status !== 'Rejected') {
    throw new QuoteBlocked([`${QUOTE_STATUS_LABEL[quoteCase.status]}：只有客户未接受的案件需要重报`])
  }

  const audit: AuditEvent = {
    id: nextId(state.auditEvents.map((entry) => entry.id), 'AE-', 3),
    at: input.now,
    actor: input.actor,
    action: '客户否掉后重新报价',
    targetKind: 'QuoteCase',
    targetId: caseId,
    before: 'Rejected',
    after: 'DirectorQuoting',
    reason: input.note?.trim() || `客户未接受${quoteCase.clientReplyNote ? `：${quoteCase.clientReplyNote}` : ''}，退回总监重报`,
  }

  return {
    ...state,
    quoteCases: state.quoteCases.map((entry) =>
      entry.id !== caseId
        ? entry
        : { ...entry, status: 'DirectorQuoting' as const, clientRepliedAt: undefined },
    ),
    auditEvents: [...state.auditEvents, audit],
  }
}

/**
 * 放弃这个变更。
 *
 * **受影响阶段在这一刻解冻。** 这条路径以前不存在：`Rejected` 是终态、没有任何动作，
 * 而清除冻结标记的地方只有「发出变更开工邮件」一处——于是客户一否掉，
 * 那些阶段就永远冻在那里，解冻面板还指着一张已经终止的单子。
 *
 * 排期不动：客户不做这个变更，原计划本来就还在。
 */
export function abandonCase(state: DemoState, caseId: string, input: ClientStepInput): DemoState {
  const quoteCase = state.quoteCases.find((entry) => entry.id === caseId)
  if (!quoteCase) throw new QuoteBlocked([`找不到报价案件 ${caseId}`])
  if (quoteCase.status !== 'Rejected') {
    throw new QuoteBlocked([
      `${QUOTE_STATUS_LABEL[quoteCase.status]}：只有客户未接受的案件才谈得上放弃`,
    ])
  }
  // 首次报价没有项目、没有阶段、没有变更单，「放弃变更」这句话在它身上不成立。
  // 走到这里说明有人绕过 availableActions 直接调了——挡住，并指明该走哪个动作。
  if (quoteCase.kind !== 'change') {
    throw new QuoteBlocked([
      '首次报价还没有项目和阶段，没有东西可解冻——不接这单请走「确认不接这单」',
    ])
  }
  if (!input.note?.trim()) {
    throw new QuoteBlocked(['放弃变更要写明原因——这条会进审计，也是下次报价的依据'])
  }

  const audit: AuditEvent = {
    id: nextId(state.auditEvents.map((entry) => entry.id), 'AE-', 3),
    at: input.now,
    actor: input.actor,
    action: '放弃变更并解冻受影响阶段',
    targetKind: 'QuoteCase',
    targetId: caseId,
    before: 'Rejected',
    after: 'Abandoned',
    reason: input.note.trim(),
  }

  return {
    ...state,
    quoteCases: state.quoteCases.map((entry) =>
      entry.id !== caseId ? entry : { ...entry, status: 'Abandoned' as const },
    ),
    // 解冻：只摘标记，日期一个都不动——客户不做这个变更，原计划本来就还在
    projects: state.projects.map((project) =>
      project.code !== quoteCase.projectCode
        ? project
        : {
            ...project,
            assets: project.assets.map((asset) => ({
              ...asset,
              stages: asset.stages.map((stage) =>
                stage.flags.includes('WaitingChangeQuote') &&
                quoteCase.affectedAssetIds.includes(asset.id)
                  ? { ...stage, flags: stage.flags.filter((flag) => flag !== 'WaitingChangeQuote') }
                  : stage,
              ),
            })),
          },
    ),
    changeRequests: state.changeRequests.map((entry) =>
      entry.id !== quoteCase.changeRequestId && entry.quoteCaseId !== caseId
        ? entry
        : { ...entry, status: 'Abandoned' as const },
    ),
    // 对应的反馈项一并关闭：客户自己放弃了，它不再是待办
    feedbackBatches: state.feedbackBatches.map((batch) => ({
      ...batch,
      items: batch.items.map((item) =>
        item.id === quoteCase.sourceFeedbackItemId ? { ...item, status: 'Closed' as const } : item,
      ),
    })),
    auditEvents: [...state.auditEvents, audit],
  }
}

/**
 * 确认不接这单。
 *
 * 与「放弃变更」的区别：放弃是**这个变更不做了、项目还在**；
 * 不接入是**这单活没接到**。首次报价被客户否掉时项目根本还没建出来，
 * 没有东西可解冻，留着它只是占列表——所以这一态额外允许删除。
 *
 * 保险起见照样摘一遍冻结标记：万一是追加报价走到这里，不能把阶段留在冻结态。
 */
export function markNotEngaged(
  state: DemoState,
  caseId: string,
  input: ClientStepInput,
): DemoState {
  const quoteCase = state.quoteCases.find((entry) => entry.id === caseId)
  if (!quoteCase) throw new QuoteBlocked([`找不到报价案件 ${caseId}`])
  // 开工之后就不是一张报价单了，那是正式项目，撤销要走结项而不是作废
  if (quoteCase.status === 'KickoffSent') {
    throw new QuoteBlocked([
      `${QUOTE_STATUS_LABEL.KickoffSent}：已经建项的活不能当报价单作废，要撤请走结项`,
    ])
  }
  if (TERMINAL_QUOTE_STATUSES.includes(quoteCase.status)) {
    throw new QuoteBlocked([`${QUOTE_STATUS_LABEL[quoteCase.status]}：这张案件已经收尾了`])
  }
  if (!input.note?.trim()) {
    throw new QuoteBlocked(['作废要写明原因——下次同一个客户来问，这条是依据'])
  }

  const audit: AuditEvent = {
    id: nextId(state.auditEvents.map((entry) => entry.id), 'AE-', 3),
    at: input.now,
    actor: input.actor,
    action: '作废报价案件',
    targetKind: 'QuoteCase',
    targetId: caseId,
    // 从哪个状态作废的要如实记——「立错了当场撤」和「客户否了才撤」是两件事
    before: quoteCase.status,
    after: 'NotEngaged',
    reason: input.note.trim(),
  }

  return {
    ...state,
    quoteCases: state.quoteCases.map((entry) =>
      entry.id !== caseId ? entry : { ...entry, status: 'NotEngaged' as const },
    ),
    projects: state.projects.map((project) =>
      project.code !== quoteCase.projectCode
        ? project
        : {
            ...project,
            assets: project.assets.map((asset) => ({
              ...asset,
              stages: asset.stages.map((stage) =>
                stage.flags.includes('WaitingChangeQuote') &&
                quoteCase.affectedAssetIds.includes(asset.id)
                  ? { ...stage, flags: stage.flags.filter((flag) => flag !== 'WaitingChangeQuote') }
                  : stage,
              ),
            })),
          },
    ),
    auditEvents: [...state.auditEvents, audit],
  }
}

/**
 * 删除一张确认不接入的案件。
 *
 * **只删案件本体和它的报价版本，审计事件一条不动。**
 * 丢了审计就没法解释这单为什么没接到——那正是以后复盘要看的东西。
 * 所以「删除」删的是待办清单里的占位，不是历史。
 */
export function deleteQuoteCase(
  state: DemoState,
  caseId: string,
  input: ClientStepInput,
): DemoState {
  const quoteCase = state.quoteCases.find((entry) => entry.id === caseId)
  if (!quoteCase) throw new QuoteBlocked([`找不到报价案件 ${caseId}`])
  if (quoteCase.status !== 'NotEngaged') {
    throw new QuoteBlocked([
      `只有「${QUOTE_STATUS_LABEL.NotEngaged}」的案件可以删除；` +
        `当前是「${QUOTE_STATUS_LABEL[quoteCase.status]}」`,
    ])
  }

  const audit: AuditEvent = {
    id: nextId(state.auditEvents.map((entry) => entry.id), 'AE-', 3),
    at: input.now,
    actor: input.actor,
    action: '删除未接入的报价案件',
    targetKind: 'QuoteCase',
    targetId: caseId,
    before: `${quoteCase.projectCode} · ${quoteCase.title}`,
    reason: '案件与报价版本已移除；本条审计保留，用于说明这单为什么没接到',
  }

  return {
    ...state,
    quoteCases: state.quoteCases.filter((entry) => entry.id !== caseId),
    quoteVersions: state.quoteVersions.filter((entry) => entry.caseId !== caseId),
    // 变更单不删，改标为已放弃：它连着反馈项，删了反馈线上就断一环
    changeRequests: state.changeRequests.map((entry) =>
      entry.quoteCaseId !== caseId && entry.id !== quoteCase.changeRequestId
        ? entry
        : { ...entry, status: 'Abandoned' as const, quoteCaseId: undefined },
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
  Rejected: '客户未接受 · 待决定',
  Abandoned: '已放弃变更',
  NotEngaged: '确认不接入 · 可删除',
}

export const QUOTE_KIND_LABEL: Record<QuoteCase['kind'], string> = {
  initial: '首次报价',
  change: '追加报价',
}
