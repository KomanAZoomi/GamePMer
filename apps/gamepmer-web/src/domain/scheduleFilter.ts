import type { DemoState, StagePlan } from './model'
import type { Milestone, MilestoneKind } from './milestones'

/**
 * 排期筛选。
 *
 * 一条不能破的规则：**筛选只影响显示哪些行，不影响容量数字**。
 * 制作组容量是跨全部项目的共享资源，按项目筛完再算容量会凭空造出空闲，
 * 「团队装不装得下」这个问题就答反了。容量始终全量计算，筛选只决定看哪几行。
 */

export interface ScheduleFilter {
  /** 空字符串表示不限 */
  projectCode: string
  groupId: string
  owner: string
  /** 只看带风险标记的阶段 */
  riskOnly: boolean
  /** 节点清单专用；空表示全部类型 */
  milestoneKind: MilestoneKind | ''
}

export const EMPTY_FILTER: ScheduleFilter = {
  projectCode: '',
  groupId: '',
  owner: '',
  riskOnly: false,
  milestoneKind: '',
}

export function isFilterActive(filter: ScheduleFilter): boolean {
  return (
    filter.projectCode !== '' ||
    filter.groupId !== '' ||
    filter.owner !== '' ||
    filter.riskOnly ||
    filter.milestoneKind !== ''
  )
}

export function hasRisk(stage: StagePlan): boolean {
  return stage.flags.length > 0
}

export function matchStage(
  stage: StagePlan,
  projectCode: string,
  filter: ScheduleFilter,
): boolean {
  if (filter.projectCode && filter.projectCode !== projectCode) return false
  if (filter.groupId && filter.groupId !== stage.productionGroupId) return false
  if (filter.owner && filter.owner !== stage.ownerName) return false
  if (filter.riskOnly && !hasRisk(stage)) return false
  return true
}

export function matchMilestone(milestone: Milestone, filter: ScheduleFilter): boolean {
  if (filter.projectCode && filter.projectCode !== milestone.projectCode) return false
  if (filter.groupId && filter.groupId !== milestone.groupId) return false
  if (filter.owner && filter.owner !== milestone.ownerName) return false
  if (filter.milestoneKind && filter.milestoneKind !== milestone.kind) return false
  if (filter.riskOnly && milestone.tone === 'normal') return false
  return true
}

export interface FilterOptions {
  projects: { code: string; name: string }[]
  groups: { id: string; name: string }[]
  owners: string[]
}

export function filterOptions(state: DemoState): FilterOptions {
  const owners = new Set<string>()
  for (const project of state.projects) {
    for (const asset of project.assets) {
      for (const stage of asset.stages) {
        owners.add(stage.ownerName)
      }
    }
  }

  return {
    projects: state.projects.map((project) => ({ code: project.code, name: project.name })),
    groups: state.productionGroups.map((group) => ({ id: group.id, name: group.name })),
    owners: [...owners].sort(),
  }
}

/** 用于「显示 X / Y」这类计数提示。 */
export function countStages(state: DemoState, filter: ScheduleFilter): { shown: number; total: number } {
  let shown = 0
  let total = 0
  for (const project of state.projects) {
    for (const asset of project.assets) {
      for (const stage of asset.stages) {
        total += 1
        if (matchStage(stage, project.code, filter)) shown += 1
      }
    }
  }
  return { shown, total }
}
