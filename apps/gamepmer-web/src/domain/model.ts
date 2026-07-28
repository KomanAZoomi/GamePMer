export type IsoDate = string

// ---------------------------------------------------------------- 工作日历

export interface WorkCalendar {
  id: string
  name: string
  /** 公司休息日：即使是周一到周五也不上班 */
  holidays: IsoDate[]
  /** 特殊工作日：即使是周末也上班 */
  extraWorkdays: IsoDate[]
}

// ---------------------------------------------------------------- 制作组与容量

export interface ProductionGroup {
  id: string
  name: string
  discipline: '2D' | '3D'
  leadName: string
  /** 每工作日可用人天。容量是跨项目共享资源，不挂在任何单个项目下。 */
  dailyCapacity: number
}

// ---------------------------------------------------------------- 阶段

export type StageCode =
  | '2D_SKETCH'
  | '2D_DETAIL_50'
  | '2D_FINAL'
  | '3D_MID'
  | '3D_HIGH'
  | '3D_LOW'
  | '3D_BAKE'
  | '3D_TEXTURE'
  | '3D_LOD'

/**
 * 阶段主状态。
 * 「完成制作」「已交 PM」「已提交客户」「客户确认」是四件不同的事，不允许合并成一个完成状态。
 */
export type StageMainStatus =
  | 'NotStarted'
  | 'InProduction'
  | 'HandedToPm'
  | 'SubmittedToClient'
  | 'AwaitingClient'
  | 'Approved'

/** 可叠加标记。叠加状态不替换主状态——「等待客户 + 返修」要同时保留已提交的事实。 */
export type StageFlag = 'Rework' | 'WaitingChangeQuote' | 'PossibleDelay' | 'ScheduleRevisionRequired'

export interface StagePlan {
  id: string
  code: StageCode
  name: string
  assetId: string
  productionGroupId: string
  ownerName: string
  estimatedPersonDays: number

  /** 基准：只读，永不被修订覆盖 */
  baselineStart: IsoDate
  baselineFinish: IsoDate
  /** 当前计划：来自最后一个已确认修订 */
  currentStart: IsoDate
  currentFinish: IsoDate
  /** 实际：来自完成与提交证据 */
  actualStart?: IsoDate
  actualFinish?: IsoDate

  submittedToClientAt?: IsoDate
  clientApprovedAt?: IsoDate

  /** 前置阶段 id */
  dependsOn: string[]
  status: StageMainStatus
  flags: StageFlag[]
  /** 最近一次日期变更的原因 */
  revisionReason?: string
}

// ---------------------------------------------------------------- 项目与资产

export interface Asset {
  id: string
  name: string
  discipline: '2D' | '3D'
  projectCode: string
  stages: StagePlan[]
}

export type ProjectStatus = 'InProduction' | 'AwaitingClient' | 'Closing' | 'Archived'

export interface Project {
  id: string
  code: string
  name: string
  client: string
  discipline: '2D' | '3D'
  status: ProjectStatus
  pmName: string
  artDirectorName: string
  calendarId: string
  assets: Asset[]
}

// ---------------------------------------------------------------- 证据

export type EvidenceKind = 'email' | 'chat' | 'screenshot' | 'path' | 'manual'

export interface EvidenceRef {
  id: string
  kind: EvidenceKind
  label: string
  /** 邮件主题、消息摘要或网络盘路径；工作台只记录索引，不移动真实文件 */
  locator: string
  receivedAt: string
  from?: string
}

// ---------------------------------------------------------------- 候选收件箱

/**
 * 消息进入工作台的渠道。
 *
 * 前四种零审批、今天就能用；后两种要企业管理员批自建应用，普通员工申请不到，
 * 所以设计上当它们不存在——接口到位只是多一个 Adapter，不改候选的任何逻辑。
 */
export type SourceChannel =
  | 'paste' // 粘贴邮件正文或聊天记录
  | 'screenshot' // 拖入截图，OCR 取文字
  | 'path' // 贴一条网络盘路径
  | 'manual' // 完全手工录入
  | 'email' // 转发到共享邮箱 / 委托授权读本人邮箱
  | 'chat-forward' // 转发给企微/飞书机器人

/**
 * 来源证据。**不可变**——识别错了就改候选字段，不许改原文。
 * 正式记录建立后仍然要能追回到这里，否则「证据完整」就是空话。
 */
export interface SourceRecord {
  id: string
  channel: SourceChannel
  receivedAt: string
  from?: string
  subject?: string
  /** 原文、OCR 文本或路径字符串 */
  body: string
  /** 附件名或盘上路径；工作台只记索引，不搬文件 */
  attachments: string[]
  /** 正文规范化后的哈希，用于去重 */
  contentHash: string
}

/** 候选的业务类型。确认后各自生成不同的正式记录。 */
export type CandidateKind =
  | 'client-feedback' // → 反馈批次
  | 'stage-done' // → 阶段推进到「已交 PM」
  | 'quote-request' // → 报价案件（切片 5）
  | 'it-receipt' // → 结项证据（切片 6）

export interface CandidateField {
  key: string
  label: string
  /** 未识别出来时为 undefined，不许编造 */
  value?: string
  /** 0~1。PM 手工填写后置为 1，并标记 editedByPm */
  confidence: number
  /** 这个值是从原文哪一段推出来的，点字段能看到 */
  sourceExcerpt?: string
  editedByPm?: boolean
  /** 缺它就不允许确认 */
  required: boolean
}

/** `New → NeedsReview → Confirmed | Ignored | Duplicate`，确认前不得触发任何正式状态变化。 */
export type CandidateStatus = 'New' | 'NeedsReview' | 'Confirmed' | 'Ignored' | 'Duplicate'

export interface InboxCandidate {
  id: string
  sourceId: string
  kind: CandidateKind
  title: string
  status: CandidateStatus
  fields: CandidateField[]
  /** AI 归纳的摘要与建议动作，界面上必须标「建议 · 未执行」 */
  aiSummary: string
  aiDraftPlan: string
  createdAt: string

  /** 确认后指向生成的正式记录，双向可追溯 */
  confirmedRecordKind?: string
  confirmedRecordId?: string
  confirmedAt?: string
  confirmedBy?: string

  /** 判为重复时指向先到的那一条 */
  duplicateOfId?: string
  ignoredReason?: string
}

// ---------------------------------------------------------------- 反馈

export type FeedbackScope = 'in-scope' | 'out-of-scope' | 'unclassified'

export type FeedbackItemStatus =
  | 'NeedsClassification'
  | 'Confirmed'
  | 'InRework'
  | 'WaitingChangeQuote'
  | 'Resubmitted'
  | 'Closed'

export interface FeedbackItem {
  id: string
  batchId: string
  assetId: string
  stageId: string
  title: string
  originalText: string
  scope: FeedbackScope
  status: FeedbackItemStatus
  ownerName: string
  estimatedReworkDays: number
  /** AI 的分类建议与依据；建议不等于结论，PM 可以否决 */
  aiSuggestion?: { scope: FeedbackScope; rationale: string }
}

export interface FeedbackBatch {
  id: string
  projectCode: string
  client: string
  receivedAt: string
  /** 反馈盘路径索引 */
  feedbackDrivePath: string
  summary: string
  evidence: EvidenceRef[]
  items: FeedbackItem[]
  /** 客户反馈滞后造成的等待工作日，与团队延期分开归因 */
  clientWaitWorkdays: number
}

// ---------------------------------------------------------------- 排期修订

export type RevisionReason =
  | 'client-feedback'
  | 'client-wait'
  | 'team-delay'
  | 'scope-change'
  | 'capacity-conflict'

export interface StageDateChange {
  stageId: string
  oldStart: IsoDate
  oldFinish: IsoDate
  newStart: IsoDate
  newFinish: IsoDate
  shiftedWorkdays: number
}

export interface ScheduleRevisionDraft {
  id: string
  projectCode: string
  assetId: string
  sourceFeedbackItemId?: string
  reason: RevisionReason
  changes: StageDateChange[]
  createdAt: string
}

export interface ScheduleRevision {
  id: string
  version: number
  projectCode: string
  assetId: string
  sourceFeedbackItemId?: string
  reason: RevisionReason
  note: string
  confirmedBy: string
  confirmedAt: string
  changes: StageDateChange[]
  /**
   * 撤销痕迹。撤销不是删除——版本号不复用，历史里能看到「v1 已撤销」。
   * 只有通知尚未发出的修订才允许撤销。
   */
  revokedAt?: string
  revokedBy?: string
  revokedReason?: string
}

// ---------------------------------------------------------------- 通知与审计

/**
 * 通知草稿。
 *
 * 工作台**不发信**：没有邮件通道，公司邮箱与企微/飞书的接口权限也还没到位。
 * 它只负责起草，真实发送由 PM 在 Outlook 或企微里完成，回来把这里标记为已发出。
 * `markedSent` 因此是一条**人工声明**，不是系统投递回执——
 * 界面必须如实说清楚，绝不能让一个没发出去的邮件显示成「已发送」。
 */
export interface NotificationDraft {
  id: string
  recipientRole: '组长' | '艺术总监' | 'BD' | 'IT' | '客户'
  recipientName: string
  subject: string
  body: string
  sourceKind: 'schedule-revision' | 'reminder' | 'kickoff' | 'closeout'
  sourceId: string
  status: 'draft' | 'markedSent'
  /** PM 声明已在外部渠道发出的时间 */
  markedSentAt?: string
  markedSentBy?: string
  /** PM 实际用了哪个渠道发的，作为人工确认证据 */
  markedSentVia?: string
}

export interface AuditEvent {
  id: string
  at: string
  actor: string
  action: string
  targetKind: string
  targetId: string
  before?: string
  after?: string
  reason?: string
}

// ---------------------------------------------------------------- 变更单

export interface ChangeRequest {
  id: string
  projectCode: string
  assetId: string
  sourceFeedbackItemId: string
  title: string
  status: 'ClassifiedExtra' | 'Quoting' | 'AwaitingReview' | 'Approved' | 'ChangeKickoffSent'
  /** 走到报价环节后指向对应的报价案件 */
  quoteCaseId?: string
}

// ---------------------------------------------------------------- 人与角色

export type PersonRole = 'PM' | '艺术总监' | '组长' | 'BD' | 'IT'

/**
 * 人。
 *
 * `roles` 是数组不是单值，因为公司里一个人经常兼两职（最常见是组长兼 BD）。
 * 待办按人合并、审计按角色展开——为了流程图好看让同一个人点两次确认，是把流程当成了目的。
 */
export interface Person {
  id: string
  name: string
  roles: PersonRole[]
}

// ---------------------------------------------------------------- 报价与变更

export type QuoteKind = 'initial' | 'change'

/**
 * `Received → Assigned → DirectorQuoting → AwaitingReview → Approved → KickoffSent | Rejected`
 *
 * 批准 ≠ 开工。只有 PM 发出正式开工（或变更开工）邮件后才进入制作——
 * 这一步是人工声明，工作台不发信。
 */
export type QuoteCaseStatus =
  | 'Received'
  | 'Assigned'
  | 'DirectorQuoting'
  | 'AwaitingReview'
  | 'Approved'
  | 'KickoffSent'
  | 'Rejected'

export interface QuoteLine {
  id: string
  assetId: string
  stageCode: StageCode
  title: string
  note: string
  personDays: number
  unitPrice: number
  /** 报价必须带排期，不能只有一个总金额 */
  plannedStart?: IsoDate
  plannedFinish?: IsoDate
}

export interface QuoteReview {
  personId: string
  /** 同一人兼两角时这里两个角色都在，但只发生一次确认 */
  roles: PersonRole[]
  decision: 'approve' | 'reject'
  decidedAt: string
  note: string
}

export interface QuoteVersion {
  id: string
  caseId: string
  version: number
  submittedBy: string
  submittedAt: string
  lines: QuoteLine[]
  /** 该报价对项目工期的净影响（工作日） */
  scheduleImpactWorkdays: number
  review?: QuoteReview
  /** 被新版本取代的时间。已复核的版本不删不改，只作废 */
  supersededAt?: string
}

export interface QuoteCase {
  id: string
  kind: QuoteKind
  projectCode: string
  client: string
  title: string
  requirement: string
  status: QuoteCaseStatus
  /** 追加报价的来源；首次报价为空 */
  sourceFeedbackItemId?: string
  changeRequestId?: string
  /** 受影响资产。只冻结这些，其余资产照常制作 */
  affectedAssetIds: string[]
  directorName: string
  /** 复核人；组长与 BD 同人时只有一条 */
  reviewerPersonId: string
  createdAt: string
  activeVersionId?: string
  /** PM 声明已发出开工邮件的时间——人工声明，不是系统投递回执 */
  kickoffSentAt?: string
  kickoffSentBy?: string
  evidence: EvidenceRef[]
}

// ---------------------------------------------------------------- 结项、备份与出账

/** 公司文件路径索引。工作台只记路径，真实的移动、剪切和删除一律由 IT 执行。 */
export interface PathReference {
  id: string
  kind: 'production' | 'delivery' | 'feedback' | 'final' | 'archive'
  label: string
  path: string
  /** 最后一次由人确认过这条路径可访问的时间；没确认过就是 undefined，不假装它存在 */
  verifiedAt?: string
}

/**
 * 结项门禁编码。**严格串行**——每一步只能在前一步完成后才能做。
 *
 * 这条链上没有一步是可以「先记着回头补」的：跳过任何一步，
 * 出账时就会缺一份说不清的证据。
 */
export type CloseoutGateCode =
  | 'assets-approved' // 全部资产验收
  | 'final-package' // 总监整理最终包
  | 'client-final' // 客户最终确认
  | 'it-backup' // IT 剪切备份
  | 'billing-notified' // 通知 BD 出账

export interface CloseoutGate {
  code: CloseoutGateCode
  title: string
  description: string
  /** 这一步需要什么证据才算数，界面上要原样列给 PM 看 */
  requires: string
  completedAt?: string
  completedBy?: string
  /** 完成这一步时登记的正式证据 */
  evidence: EvidenceRef[]
  note?: string
}

/** `Precheck → AwaitingFinalPackage → AwaitingCustomerFinal → AwaitingIT → ReadyToBill → BillingNotified → Archived` */
export type CloseoutStatus =
  | 'Precheck'
  | 'AwaitingFinalPackage'
  | 'AwaitingCustomerFinal'
  | 'AwaitingIT'
  | 'ReadyToBill'
  | 'BillingNotified'
  | 'Archived'

export interface CloseoutCase {
  id: string
  projectCode: string
  client: string
  status: CloseoutStatus
  openedAt: string
  gates: CloseoutGate[]
  /** 最终包与归档路径索引；工作台不搬文件 */
  paths: PathReference[]
  finalPackageOwner: string
  archivedAt?: string
}

// ---------------------------------------------------------------- 文件索引

/** 登记在册的盘位。`archive` 归 IT 管辖，工作台只读索引。 */
export interface Drive {
  id: string
  kind: PathReference['kind']
  label: string
  path: string
}

/**
 * 文件名解析结果。
 *
 * 规范是 `资产名_阶段名_YYYYMMDD_rNN`。只有前三段也能识别（版本按 r01 待确认）；
 * 一段都对不上时四个字段全是 undefined——**不猜、不填默认值**。
 */
export interface FileNameParse {
  assetId?: string
  stageCode?: StageCode
  fileDate?: IsoDate
  revision?: string
  /** 0~1。解析出的资产/阶段在库里找得到才算高置信 */
  confidence: number
  /** 解析不通过的原因，直接显示给 PM 看 */
  problem?: string
}

export type FileLinkStatus =
  | 'auto' // 自动关联成功
  | 'needs-review' // 解析出来了但置信度不足，等 PM 确认
  | 'unresolved' // 完全解析不出，等 PM 手工关联
  | 'linked' // PM 手工关联过
  | 'ignored' // PM 判定与正式流程无关

/**
 * 盘上一个文件的索引条目。
 *
 * **`fileName` 永远是盘上的原始名字。** 命名不规范时保留原名进待关联队列——
 * 工作台不改名、不移动、不删除，丢证据比留一条难看的记录严重得多。
 */
export interface FileIndexEntry {
  id: string
  driveId: string
  /** 原始文件名，任何情况下都不改写 */
  fileName: string
  /** 盘上目录（不含文件名） */
  folder: string
  discoveredAt: string
  parse: FileNameParse
  status: FileLinkStatus
  /** 关联到的阶段 id；auto/linked 时有值 */
  linkedStageId?: string
  linkedBy?: string
  linkedAt?: string
  ignoredReason?: string
  /** AI 给的关联建议与依据，标「建议 · 未执行」 */
  aiHint?: string
}

// ---------------------------------------------------------------- 聚合状态

export const DEMO_SCHEMA_VERSION = 6

export interface DemoState {
  schemaVersion: typeof DEMO_SCHEMA_VERSION
  calendars: WorkCalendar[]
  productionGroups: ProductionGroup[]
  projects: Project[]
  sourceRecords: SourceRecord[]
  candidates: InboxCandidate[]
  people: Person[]
  quoteCases: QuoteCase[]
  quoteVersions: QuoteVersion[]
  closeoutCases: CloseoutCase[]
  drives: Drive[]
  fileIndex: FileIndexEntry[]
  feedbackBatches: FeedbackBatch[]
  revisions: ScheduleRevision[]
  notificationDrafts: NotificationDraft[]
  auditEvents: AuditEvent[]
  changeRequests: ChangeRequest[]
}
