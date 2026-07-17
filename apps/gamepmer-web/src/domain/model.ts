export type IsoDate = string

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

export type StageStatus = 'normal' | 'awaiting-client' | 'rework' | 'complete'

export interface Stage {
  code: StageCode
  name: string
  baselineStart: IsoDate
  baselineFinish: IsoDate
  currentStart: IsoDate
  currentFinish: IsoDate
  status: StageStatus
  clientApprovalDate?: IsoDate
}

export interface Asset {
  id: string
  name: string
  production: '2D' | '3D'
  stages: Stage[]
}

export interface Project {
  id: string
  code: string
  name: string
  client: string
  assets: Asset[]
}

export interface FeedbackBatch {
  id: string
  projectCode: string
  assetId: string
  affectedStageCode: StageCode
  pastedText: string
  addedWorkdays: number
  receivedAt: IsoDate
}

export interface ScheduleDraftChange {
  stageCode: StageCode
  oldStart: IsoDate
  oldFinish: IsoDate
  newStart: IsoDate
  newFinish: IsoDate
}

export interface ScheduleDraft {
  id: string
  feedbackId: string
  projectCode: string
  assetId: string
  changes: ScheduleDraftChange[]
  createdAt: IsoDate
}

export interface RevisionRecord {
  id: string
  projectCode: string
  assetId: string
  feedbackId: string
  confirmedAt: IsoDate
  note: string
  changes: ScheduleDraftChange[]
}

export interface NotificationDraft {
  id: string
  revisionId: string
  recipientRole: '组长' | '艺术总监'
  subject: string
  body: string
  status: 'unsent'
}

export interface DemoState {
  schemaVersion: 1
  projects: Project[]
  feedbackBatches: FeedbackBatch[]
  revisions: RevisionRecord[]
  notificationDrafts: NotificationDraft[]
}
