import type { Asset, DemoState, FeedbackBatch, FeedbackItem, Project, StagePlan } from './model'

/** 从聚合状态里定位正式对象。任何界面元素都必须能沿着这些函数回到它的事实来源。 */

export function findProject(state: DemoState, code: string): Project | undefined {
  return state.projects.find((project) => project.code === code)
}

export function findAsset(state: DemoState, assetId: string): Asset | undefined {
  for (const project of state.projects) {
    const asset = project.assets.find((item) => item.id === assetId)
    if (asset) return asset
  }
  return undefined
}

export function findStage(state: DemoState, stageId: string): StagePlan | undefined {
  for (const project of state.projects) {
    for (const asset of project.assets) {
      const stage = asset.stages.find((item) => item.id === stageId)
      if (stage) return stage
    }
  }
  return undefined
}

export function findFeedbackItem(
  state: DemoState,
  itemId: string,
): { batch: FeedbackBatch; item: FeedbackItem } | undefined {
  for (const batch of state.feedbackBatches) {
    const item = batch.items.find((entry) => entry.id === itemId)
    if (item) return { batch, item }
  }
  return undefined
}

export function groupName(state: DemoState, groupId: string): string {
  return state.productionGroups.find((group) => group.id === groupId)?.name ?? groupId
}

const MAIN_STATUS_LABELS: Record<StagePlan['status'], string> = {
  NotStarted: '未开始',
  InProduction: '制作中',
  HandedToPm: '已交 PM',
  SubmittedToClient: '已提交客户',
  AwaitingClient: '等待客户',
  Approved: '已验收',
}

const FLAG_LABELS: Record<string, string> = {
  Rework: '返修',
  WaitingChangeQuote: '等待变更报价',
  ScheduleRevisionRequired: '待重排',
  PossibleDelay: '可能延期',
}

/** 状态永远带文字，颜色只是辅助——颜色不是唯一的状态编码。 */
export function stageStatusLabel(stage: StagePlan): string {
  return MAIN_STATUS_LABELS[stage.status]
}

export function stageFlagLabels(stage: StagePlan): string[] {
  return stage.flags.map((flag) => FLAG_LABELS[flag] ?? flag)
}
