import type { Asset, DemoState, IsoDate, Project, StagePlan, WorkCalendar } from './model'
import { EMPTY_CALENDAR, countWorkdays, moveByWorkdays } from './workCalendar'

/**
 * 首页任务是**投影**，不是独立存储的记录。
 *
 * 每一条待办都必须指回一个正式对象（阶段、反馈项或项目），否则就成了无法追溯的孤立任务。
 * 一个阶段最多产生一条待办，原因取最紧急的那个。
 */

export type WorkItemGroup = '需求评审' | '产品制作' | '结项与备份'

export interface WorkItem {
  id: string
  group: WorkItemGroup
  title: string
  projectCode: string
  assetId?: string
  stageId?: string
  priority: 'high' | 'normal'
  /** 为什么它出现在待办里——不能只给状态色块 */
  reason: string
  dueDate?: IsoDate
  sourceKind: 'feedback' | 'stage' | 'closeout'
  sourceId: string
}

export interface HomeMetrics {
  todo: number
  inProduction: number
  approved: number
  /** 计划日已过但未收到完成证据，系统不自行判定为实际延期 */
  possibleDelay: number
  /** PM 已确认归因为团队延期的阶段 */
  overdue: number
}

function calendarOf(state: DemoState, project: Project): WorkCalendar {
  return state.calendars.find((item) => item.id === project.calendarId) ?? EMPTY_CALENDAR
}

interface StageContext {
  project: Project
  asset: Asset
  stage: StagePlan
  calendar: WorkCalendar
}

function* eachStage(state: DemoState): Generator<StageContext> {
  for (const project of state.projects) {
    const calendar = calendarOf(state, project)
    for (const asset of project.assets) {
      for (const stage of asset.stages) {
        yield { project, asset, stage, calendar }
      }
    }
  }
}

/** 阶段级待办：一个阶段只出一条，按紧急程度取原因。 */
function stageWorkItem(context: StageContext, today: IsoDate): WorkItem | undefined {
  const { project, asset, stage, calendar } = context
  if (stage.status === 'Approved') return undefined

  const base = {
    id: `wi-${stage.id}`,
    projectCode: project.code,
    assetId: asset.id,
    stageId: stage.id,
    sourceKind: 'stage' as const,
    sourceId: stage.id,
    dueDate: stage.currentFinish,
  }

  // 1. 缺少开工条件或完成证据 —— 只提示「可能延期」，是否真的延期由 PM 判断
  if (stage.flags.includes('PossibleDelay')) {
    const blocker = asset.stages.find(
      (item) => stage.dependsOn.includes(item.id) && item.status !== 'Approved',
    )
    return {
      ...base,
      group: '产品制作',
      title: `${asset.id} · ${stage.name}`,
      priority: 'high',
      reason: blocker
        ? `可能延期：计划 ${stage.currentStart} 开工，前置「${blocker.name}」仍在等待客户确认`
        : `可能延期：计划 ${stage.currentStart} 开工，尚未收到开工证据`,
    }
  }

  // 2. T-1：明日到期且尚未收到完成邮件
  const tomorrow = moveByWorkdays(today, 1, calendar)
  if (stage.currentFinish === tomorrow && !stage.actualFinish && stage.status !== 'AwaitingClient') {
    return {
      ...base,
      group: '产品制作',
      title: `${asset.id} · ${stage.name}`,
      priority: 'high',
      reason: `明日到期：${stage.currentFinish} 应交付，尚未收到完成邮件`,
    }
  }

  // 3. 等待客户验收（带返修标记的阶段由反馈项承担待办，避免重复）
  if (stage.status === 'AwaitingClient' && !stage.flags.includes('Rework') && stage.submittedToClientAt) {
    const waited = Math.max(0, countWorkdays(stage.submittedToClientAt, today, calendar) - 1)
    return {
      ...base,
      group: '需求评审',
      title: `${asset.id} · ${stage.name}`,
      priority: waited >= 3 ? 'high' : 'normal',
      reason: `等待客户验收已 ${waited} 个工作日（提交于 ${stage.submittedToClientAt}），等待归因为客户侧`,
    }
  }

  // 4. 正在制作
  if (stage.status === 'InProduction') {
    return {
      ...base,
      group: '产品制作',
      title: `${asset.id} · ${stage.name}`,
      priority: 'normal',
      reason: `制作中，计划 ${stage.currentFinish} 交付`,
    }
  }

  // 5. 已交 PM，等待提交客户
  if (stage.status === 'HandedToPm') {
    return {
      ...base,
      group: '需求评审',
      title: `${asset.id} · ${stage.name}`,
      priority: 'high',
      reason: '团队已交付 PM，待取件并提交客户',
    }
  }

  return undefined
}

export function projectWorkItems(state: DemoState, today: IsoDate): WorkItem[] {
  const items: WorkItem[] = []

  // 待分流的客户反馈：每一条资产级反馈项都要 PM 判定范围内还是范围外
  for (const batch of state.feedbackBatches) {
    for (const item of batch.items) {
      if (item.status !== 'NeedsClassification') continue
      items.push({
        id: `wi-${item.id}`,
        group: '需求评审',
        title: `${item.assetId} · ${item.title}`,
        projectCode: batch.projectCode,
        assetId: item.assetId,
        stageId: item.stageId,
        priority: 'high',
        reason: `客户反馈 ${batch.id} 待分流：判定范围内返修或范围外追加`,
        sourceKind: 'feedback',
        sourceId: item.id,
      })
    }
  }

  for (const context of eachStage(state)) {
    const item = stageWorkItem(context, today)
    if (item) items.push(item)
  }

  // 结项：全部阶段已验收且项目进入结项流程
  for (const project of state.projects) {
    if (project.status !== 'Closing') continue
    const allApproved = project.assets.every((asset) =>
      asset.stages.every((stage) => stage.status === 'Approved'),
    )
    if (!allApproved) continue
    items.push({
      id: `wi-closeout-${project.code}`,
      group: '结项与备份',
      title: `${project.code} · 等待最终包`,
      projectCode: project.code,
      priority: 'high',
      reason: '全部资产已验收，待总监整理并登记最终包路径',
      sourceKind: 'closeout',
      sourceId: project.code,
    })
  }

  const priorityRank = { high: 0, normal: 1 }
  return items.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])
}

export function summarizeMetrics(state: DemoState, today: IsoDate): HomeMetrics {
  let inProduction = 0
  let approved = 0
  let possibleDelay = 0
  let overdue = 0

  for (const { stage } of eachStage(state)) {
    if (stage.status === 'InProduction') inProduction += 1
    if (stage.status === 'Approved') approved += 1
    if (stage.flags.includes('PossibleDelay')) possibleDelay += 1
    if (stage.revisionReason === 'team-delay') overdue += 1
  }

  return {
    todo: projectWorkItems(state, today).length,
    inProduction,
    approved,
    possibleDelay,
    overdue,
  }
}

export function groupWorkItems(items: WorkItem[]): { group: WorkItemGroup; items: WorkItem[] }[] {
  const order: WorkItemGroup[] = ['需求评审', '产品制作', '结项与备份']
  return order
    .map((group) => ({ group, items: items.filter((item) => item.group === group) }))
    .filter((entry) => entry.items.length > 0)
}
