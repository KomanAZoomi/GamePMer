import { capacityBreakdown, weeklyLoad, weekStartsFrom } from './capacity'
import type { DemoState, IsoDate, StagePlan, WorkCalendar } from './model'
import { EMPTY_CALENDAR, countWorkdays, isWorkday, nextWorkday } from './workCalendar'

/**
 * 排期冲突检查。
 *
 * 两级：
 * - `blocking` 阻断：数据本身错了（日期倒置、落在非工作日、区间重叠、必填缺失）。
 *   不清空不允许确认写入。
 * - `warning` 预警：数据没错，但现实有风险（前置未验收、组满载、人天需要并行）。
 *   PM 知情后可以照常确认。
 *
 * 正常排期不该被扣上阻断的帽子——阻断留给真正录错的数据，否则门禁会被当成噪音忽略。
 */

export type ConflictSeverity = 'blocking' | 'warning'

export type ConflictKind =
  | 'date-order'
  | 'non-workday'
  | 'stage-overlap'
  | 'dependency-inversion'
  | 'missing-field'
  | 'person-days-mismatch'
  | 'dependency-not-approved'
  | 'group-overload'
  | 'pending-feedback-capacity'

export interface Conflict {
  id: string
  kind: ConflictKind
  severity: ConflictSeverity
  title: string
  detail: string
  targetKind: 'stage' | 'group' | 'row'
  targetId: string
  projectCode?: string
}

// ---------------------------------------------------------------- 录入草案的逐行校验

export interface StageRow {
  id: string
  assetId: string
  stageName: string
  productionGroupId: string
  ownerName: string
  estimatedPersonDays: number
  start: IsoDate
  finish: IsoDate
  dependsOn: string[]
  requiresClientApproval: boolean
}

/** 一次返回全部问题：录入时逐个报错、改一个冒一个是最难用的交互。 */
export function checkStageRows(rows: StageRow[], calendar: WorkCalendar = EMPTY_CALENDAR): Conflict[] {
  const conflicts: Conflict[] = []
  const byId = new Map(rows.map((row) => [row.id, row]))

  for (const row of rows) {
    const at = (kind: ConflictKind, severity: ConflictSeverity, title: string, detail: string) => {
      conflicts.push({
        id: `${row.id}:${kind}:${conflicts.length}`,
        kind,
        severity,
        title,
        detail,
        targetKind: 'row',
        targetId: row.id,
      })
    }

    if (!row.productionGroupId) {
      at('missing-field', 'blocking', '缺少制作组', `${row.assetId} ${row.stageName} 未指定制作组，无法占用档期。`)
    }
    if (!row.ownerName.trim()) {
      at('missing-field', 'blocking', '缺少负责人', `${row.assetId} ${row.stageName} 未指定负责人。`)
    }

    if (row.finish < row.start) {
      at('date-order', 'blocking', '结束早于开始', `${row.assetId} ${row.stageName}：${row.start} → ${row.finish}。`)
    }

    for (const [label, date] of [
      ['开始日', row.start],
      ['结束日', row.finish],
    ] as const) {
      if (!isWorkday(date, calendar)) {
        at(
          'non-workday',
          'blocking',
          '日期落在非工作日',
          `${row.assetId} ${row.stageName} 的${label} ${date} 是周末或公司休息日，最近的有效工作日是 ${nextWorkday(date, calendar)}。`,
        )
      }
    }

    if (row.finish >= row.start) {
      const workdays = countWorkdays(row.start, row.finish, calendar)
      if (workdays > 0 && row.estimatedPersonDays > workdays) {
        at(
          'person-days-mismatch',
          'warning',
          '人天多于可用工作日',
          `${row.assetId} ${row.stageName} 预估 ${row.estimatedPersonDays} 人天，区间只有 ${workdays} 个工作日，需要多人并行或延长区间。`,
        )
      }
    }

    for (const dependencyId of row.dependsOn) {
      const dependency = byId.get(dependencyId)
      if (!dependency) continue
      if (row.start <= dependency.finish) {
        at(
          'dependency-inversion',
          'blocking',
          '依赖倒置',
          `${row.assetId} ${row.stageName} 于 ${row.start} 开始，不晚于前置「${dependency.stageName}」的结束日 ${dependency.finish}。`,
        )
      }
    }
  }

  // 同一资产内的阶段区间不允许重叠
  const byAsset = new Map<string, StageRow[]>()
  for (const row of rows) {
    const list = byAsset.get(row.assetId) ?? []
    list.push(row)
    byAsset.set(row.assetId, list)
  }

  for (const [assetId, list] of byAsset) {
    const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start))
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]
      const current = sorted[index]
      if (current.start <= previous.finish) {
        conflicts.push({
          id: `${current.id}:stage-overlap:${index}`,
          kind: 'stage-overlap',
          severity: 'blocking',
          title: '阶段区间重叠',
          detail: `${assetId} 的「${previous.stageName}」（至 ${previous.finish}）与「${current.stageName}」（自 ${current.start}）重叠。`,
          targetKind: 'row',
          targetId: current.id,
        })
      }
    }
  }

  return conflicts
}

// ---------------------------------------------------------------- 已确认排期的静态检查

const LOOKAHEAD_WEEKS = 4

export function checkSchedule(state: DemoState, today: IsoDate): Conflict[] {
  const conflicts: Conflict[] = []
  const calendar = state.calendars[0] ?? EMPTY_CALENDAR

  // 1. 计划开工日已到但前置尚未获客户验收
  for (const project of state.projects) {
    for (const asset of project.assets) {
      for (const stage of asset.stages) {
        if (stage.status !== 'NotStarted') continue
        if (stage.currentStart > today) continue
        const blockers = asset.stages.filter(
          (item) => stage.dependsOn.includes(item.id) && item.status !== 'Approved',
        )
        if (blockers.length === 0) continue
        conflicts.push({
          id: `${stage.id}:dependency-not-approved`,
          kind: 'dependency-not-approved',
          severity: 'warning',
          title: '前置未获验收',
          detail: `${asset.id} ${stage.name} 计划 ${stage.currentStart} 开工，前置「${blockers.map((item) => item.name).join('、')}」尚未获得客户验收。系统不自行判定延期，由 PM 决定是否询问。`,
          targetKind: 'stage',
          targetId: stage.id,
          projectCode: project.code,
        })
      }
    }
  }

  // 2. 制作组满载或超载
  const weeks = weekStartsFrom(today, LOOKAHEAD_WEEKS)
  for (const group of state.productionGroups) {
    for (const weekStart of weeks) {
      const load = weeklyLoad(state, group.id, weekStart, calendar)
      if (load.available === 0 || load.utilization < 1) continue
      const over = load.overBy > 0
      conflicts.push({
        id: `${group.id}:${weekStart}:group-overload`,
        kind: 'group-overload',
        severity: 'warning',
        title: over ? '制作组超载' : '制作组满载无缓冲',
        detail: over
          ? `${group.name} ${weekStart} 当周已排 ${load.scheduled} 人天，超出可用 ${load.available} 人天 ${load.overBy}。`
          : `${group.name} ${weekStart} 当周已排 ${load.scheduled} / ${load.available} 人天，没有任何缓冲；该周有 ${load.workdays} 个工作日。`,
        targetKind: 'group',
        targetId: group.id,
      })
    }
  }

  // 3. 待分流反馈可能吃掉容量——只作提示，不计入已排人天
  for (const batch of state.feedbackBatches) {
    const pending = batch.items.filter((item) => item.status === 'NeedsClassification')
    if (pending.length === 0) continue

    const byGroup = new Map<string, number>()
    for (const item of pending) {
      const stage = findStageById(state, item.stageId)
      if (!stage) continue
      byGroup.set(
        stage.productionGroupId,
        (byGroup.get(stage.productionGroupId) ?? 0) + item.estimatedReworkDays,
      )
    }

    for (const [groupId, personDays] of byGroup) {
      const group = state.productionGroups.find((item) => item.id === groupId)
      const load = weeklyLoad(state, groupId, weeks[0], calendar)
      const headroom = Math.round((load.available - load.scheduled) * 100) / 100
      if (personDays <= headroom) continue
      conflicts.push({
        id: `${batch.id}:${groupId}:pending-feedback-capacity`,
        kind: 'pending-feedback-capacity',
        severity: 'warning',
        title: '待分流反馈可能超出容量',
        detail: `${batch.id} 有 ${pending.length} 项反馈尚未分流，合计预估 ${personDays} 人天落在 ${group?.name ?? groupId}；该组本周仅余 ${headroom} 人天。范围判定完成前不计入已排人天。`,
        targetKind: 'group',
        targetId: groupId,
        projectCode: batch.projectCode,
      })
    }
  }

  const order: ConflictSeverity[] = ['blocking', 'warning']
  return conflicts.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
}

function findStageById(state: DemoState, stageId: string): StagePlan | undefined {
  for (const project of state.projects) {
    for (const asset of project.assets) {
      const stage = asset.stages.find((item) => item.id === stageId)
      if (stage) return stage
    }
  }
  return undefined
}

export function summarizeConflicts(conflicts: Conflict[]): { blocking: number; warning: number } {
  return {
    blocking: conflicts.filter((item) => item.severity === 'blocking').length,
    warning: conflicts.filter((item) => item.severity === 'warning').length,
  }
}

/** 供 UI 展示占用明细 */
export { capacityBreakdown }
