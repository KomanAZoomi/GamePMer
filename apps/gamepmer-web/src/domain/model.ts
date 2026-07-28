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

// ---------------------------------------------------------------- 变更单（本轮仅占位）

export interface ChangeRequest {
  id: string
  projectCode: string
  assetId: string
  sourceFeedbackItemId: string
  title: string
  status: 'ClassifiedExtra' | 'Quoting' | 'AwaitingReview' | 'Approved' | 'ChangeKickoffSent'
}

// ---------------------------------------------------------------- 聚合状态

export const DEMO_SCHEMA_VERSION = 2

export interface DemoState {
  schemaVersion: typeof DEMO_SCHEMA_VERSION
  calendars: WorkCalendar[]
  productionGroups: ProductionGroup[]
  projects: Project[]
  feedbackBatches: FeedbackBatch[]
  revisions: ScheduleRevision[]
  notificationDrafts: NotificationDraft[]
  auditEvents: AuditEvent[]
  changeRequests: ChangeRequest[]
}
