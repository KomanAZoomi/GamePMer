import type { DemoState, IsoDate, ProductionGroup, StagePlan, WorkCalendar } from './model'
import { addCalendarDays, countWorkdays, isWorkday, startOfWeek } from './workCalendar'

/**
 * 制作组容量。
 *
 * 容量是**跨项目共享**的资源：同一个制作组同时承接多个项目，
 * 把容量挂在单个项目下就永远算不出「项目各自排得下、团队整体装不下」这种情况。
 *
 * 分摊模型：一个阶段的预估人天按其当前计划区间内的工作日均摊到每一天，
 * 再按周汇总。跨周的阶段因此会被正确地拆到两周里。
 */

/** 不消耗制作人天的状态：等待客户和等待变更报价占时间线，但不占人。 */
const CONSUMING_STATUSES: StagePlan['status'][] = ['NotStarted', 'InProduction', 'HandedToPm']

export interface LoadEntry {
  stageId: string
  stageName: string
  assetId: string
  projectCode: string
  ownerName: string
  personDays: number
  start: IsoDate
  finish: IsoDate
}

export interface ExtraLoad {
  groupId: string
  personDays: number
  label: string
}

export interface WeeklyLoad {
  weekStart: IsoDate
  weekEnd: IsoDate
  workdays: number
  available: number
  scheduled: number
  /** 超出可用人天的差额，未超出时为 0 */
  overBy: number
  /** 已排 / 可用，可用为 0 时记 0 */
  utilization: number
}

function consumesCapacity(stage: StagePlan): boolean {
  return CONSUMING_STATUSES.includes(stage.status)
}

function roundHalf(value: number): number {
  return Math.round(value * 100) / 100
}

/** 某阶段落在指定周内的人天。 */
function personDaysInWeek(
  stage: StagePlan,
  weekStart: IsoDate,
  weekEnd: IsoDate,
  calendar: WorkCalendar,
): number {
  const totalWorkdays = countWorkdays(stage.currentStart, stage.currentFinish, calendar)
  if (totalWorkdays === 0) return 0

  const perWorkday = stage.estimatedPersonDays / totalWorkdays
  const overlapStart = stage.currentStart > weekStart ? stage.currentStart : weekStart
  const overlapEnd = stage.currentFinish < weekEnd ? stage.currentFinish : weekEnd
  if (overlapStart > overlapEnd) return 0

  return roundHalf(perWorkday * countWorkdays(overlapStart, overlapEnd, calendar))
}

function* eachStage(state: DemoState): Generator<{ stage: StagePlan; projectCode: string }> {
  for (const project of state.projects) {
    for (const asset of project.assets) {
      for (const stage of asset.stages) {
        yield { stage, projectCode: project.code }
      }
    }
  }
}

/** 某制作组在某一周的占用明细，按项目和阶段拆开——超载必须能解释到具体是谁占的。 */
export function capacityBreakdown(
  state: DemoState,
  groupId: string,
  weekStart: IsoDate,
  calendar: WorkCalendar,
): LoadEntry[] {
  const weekEnd = addCalendarDays(weekStart, 6)
  const entries: LoadEntry[] = []

  for (const { stage, projectCode } of eachStage(state)) {
    if (stage.productionGroupId !== groupId) continue
    if (!consumesCapacity(stage)) continue
    const personDays = personDaysInWeek(stage, weekStart, weekEnd, calendar)
    if (personDays <= 0) continue
    entries.push({
      stageId: stage.id,
      stageName: stage.name,
      assetId: stage.assetId,
      projectCode,
      ownerName: stage.ownerName,
      personDays,
      start: stage.currentStart,
      finish: stage.currentFinish,
    })
  }

  return entries.sort((a, b) => b.personDays - a.personDays)
}

export function weeklyLoad(
  state: DemoState,
  groupId: string,
  weekStart: IsoDate,
  calendar: WorkCalendar,
  extras: ExtraLoad[] = [],
): WeeklyLoad {
  const group = state.productionGroups.find((item) => item.id === groupId)
  const weekEnd = addCalendarDays(weekStart, 6)

  let workdays = 0
  for (let offset = 0; offset < 7; offset += 1) {
    if (isWorkday(addCalendarDays(weekStart, offset), calendar)) workdays += 1
  }

  const available = roundHalf((group?.dailyCapacity ?? 0) * workdays)
  const fromStages = capacityBreakdown(state, groupId, weekStart, calendar).reduce(
    (total, entry) => total + entry.personDays,
    0,
  )
  const fromExtras = extras
    .filter((extra) => extra.groupId === groupId)
    .reduce((total, extra) => total + extra.personDays, 0)

  const scheduled = roundHalf(fromStages + fromExtras)

  return {
    weekStart,
    weekEnd,
    workdays,
    available,
    scheduled,
    overBy: roundHalf(Math.max(0, scheduled - available)),
    utilization: available === 0 ? 0 : roundHalf(scheduled / available),
  }
}

export interface CapacityRow {
  group: ProductionGroup
  weeks: WeeklyLoad[]
}

export function capacityMatrix(
  state: DemoState,
  weekStarts: IsoDate[],
  calendar: WorkCalendar,
  extras: ExtraLoad[] = [],
): CapacityRow[] {
  return state.productionGroups.map((group) => ({
    group,
    weeks: weekStarts.map((weekStart) => weeklyLoad(state, group.id, weekStart, calendar, extras)),
  }))
}

/** 从某天所在周开始的连续周一列表。offset 为负表示先往前回溯几周。 */
export function weekStartsFrom(today: IsoDate, count: number, offset = 0): IsoDate[] {
  const first = addCalendarDays(startOfWeek(today), offset * 7)
  return Array.from({ length: count }, (_, index) => addCalendarDays(first, index * 7))
}
