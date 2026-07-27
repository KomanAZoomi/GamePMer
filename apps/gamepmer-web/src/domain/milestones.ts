import type { DemoState, IsoDate } from './model'
import { addCalendarDays } from './workCalendar'

/**
 * 节点清单：把散在各项目里的关键日期收拢到一条时间线上。
 * 全部由正式状态派生，没有独立存储的「节点」记录。
 */

export type MilestoneKind =
  | 'kickoff'
  | 'stage-delivery'
  | 'final-delivery'
  | 'client-feedback'
  | 'client-approval'

export const MILESTONE_LABELS: Record<MilestoneKind, string> = {
  kickoff: '计划开工',
  'stage-delivery': '阶段交付',
  'final-delivery': '最终交付',
  'client-feedback': '客户反馈',
  'client-approval': '客户验收',
}

export interface Milestone {
  id: string
  date: IsoDate
  kind: MilestoneKind
  projectCode: string
  assetId: string
  stageId?: string
  stageName?: string
  groupId?: string
  ownerName?: string
  status: string
  tone: 'normal' | 'warn' | 'risk'
}

export function collectMilestones(state: DemoState, from: IsoDate, days: number): Milestone[] {
  const to = addCalendarDays(from, days)
  const milestones: Milestone[] = []
  const inWindow = (date: IsoDate) => date >= from && date <= to

  for (const project of state.projects) {
    for (const asset of project.assets) {
      const lastStage = asset.stages[asset.stages.length - 1]

      for (const stage of asset.stages) {
        const base = {
          projectCode: project.code,
          assetId: asset.id,
          stageId: stage.id,
          stageName: stage.name,
          groupId: stage.productionGroupId,
          ownerName: stage.ownerName,
        }

        if (stage.status === 'NotStarted' && inWindow(stage.currentStart)) {
          const risky = stage.flags.includes('PossibleDelay')
          milestones.push({
            ...base,
            id: `${stage.id}:kickoff`,
            date: stage.currentStart,
            kind: 'kickoff',
            status: risky ? '可能延期 · 前置未验收' : '未开始',
            tone: risky ? 'risk' : 'normal',
          })
        }

        if (stage.status !== 'Approved' && inWindow(stage.currentFinish)) {
          const isFinal = stage.id === lastStage.id
          milestones.push({
            ...base,
            id: `${stage.id}:delivery`,
            date: stage.currentFinish,
            kind: isFinal ? 'final-delivery' : 'stage-delivery',
            status: stage.flags.includes('Rework')
              ? '受客户反馈影响待重排'
              : stage.status === 'InProduction'
                ? '制作中'
                : stage.status === 'AwaitingClient'
                  ? '等待客户验收'
                  : '未开始',
            tone: stage.flags.includes('Rework') ? 'warn' : 'normal',
          })
        }

        if (stage.clientApprovedAt && inWindow(stage.clientApprovedAt)) {
          milestones.push({
            ...base,
            id: `${stage.id}:approval`,
            date: stage.clientApprovedAt,
            kind: 'client-approval',
            status: '客户已验收',
            tone: 'normal',
          })
        }
      }
    }
  }

  for (const batch of state.feedbackBatches) {
    const date = batch.receivedAt.slice(0, 10)
    if (!inWindow(date)) continue
    const pending = batch.items.filter((item) => item.status === 'NeedsClassification').length
    const first = batch.items[0]
    milestones.push({
      id: `${batch.id}:feedback`,
      date,
      kind: 'client-feedback',
      projectCode: batch.projectCode,
      assetId: first?.assetId ?? '',
      stageId: first?.stageId,
      stageName: '—',
      ownerName: first?.ownerName,
      status: pending > 0 ? `${pending} 项待分流` : '已分流',
      tone: pending > 0 ? 'risk' : 'normal',
    })
  }

  return milestones.sort((a, b) => a.date.localeCompare(b.date) || a.assetId.localeCompare(b.assetId))
}
