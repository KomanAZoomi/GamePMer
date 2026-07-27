import { checkStageRows, type Conflict, type StageRow } from './conflicts'
import type { Asset, DemoState, IsoDate, RevisionReason, StageDateChange } from './model'
import { EMPTY_CALENDAR, countWorkdays, moveByWorkdays } from './workCalendar'

/**
 * 批量计划录入。
 *
 * 两条不可让步的规则：
 * 1. 草案不写入正式计划——编辑期间 `StagePlan.current*` 一个字节都不变。
 * 2. 确认是原子操作——要么全部阶段写入并生成一个修订版本，要么什么都不改。
 *    「部分阶段已改、部分没改」比不改更糟，PM 无法判断当前计划到底是什么。
 */

export interface EntryDiff {
  changes: StageDateChange[]
  /** 除日期以外的改动，例如换组、改人天 */
  attributeChanges: { stageId: string; field: string; before: string; after: string }[]
}

export function buildStageRows(asset: Asset): StageRow[] {
  return asset.stages.map((stage) => ({
    id: stage.id,
    assetId: stage.assetId,
    stageName: stage.name,
    productionGroupId: stage.productionGroupId,
    ownerName: stage.ownerName,
    estimatedPersonDays: stage.estimatedPersonDays,
    start: stage.currentStart,
    finish: stage.currentFinish,
    dependsOn: [...stage.dependsOn],
    requiresClientApproval: true,
  }))
}

export function updateRow(rows: StageRow[], id: string, patch: Partial<StageRow>): StageRow[] {
  return rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
}

/**
 * 把改动沿依赖链推下去，保持每个阶段原有的工作日时长。
 *
 * 手工改一行就报一堆依赖倒置、要 PM 挨个往后挪，正是 M1 里「录排期不顺手」的典型。
 * 顺延只在需要时发生：后续阶段本来就排得开的，一天都不动。
 */
export function cascadeShift(rows: StageRow[], calendar = EMPTY_CALENDAR): StageRow[] {
  const result = rows.map((row) => ({ ...row }))
  const byId = new Map(result.map((row) => [row.id, row]))

  for (const row of result) {
    let earliest: IsoDate | undefined
    for (const dependencyId of row.dependsOn) {
      const dependency = byId.get(dependencyId)
      if (!dependency) continue
      const candidate = moveByWorkdays(dependency.finish, 1, calendar)
      if (!earliest || candidate > earliest) earliest = candidate
    }

    if (!earliest || row.start > earliest) continue

    const span = Math.max(1, countWorkdays(row.start, row.finish, calendar))
    row.start = earliest
    row.finish = moveByWorkdays(earliest, span - 1, calendar)
  }

  return result
}

export function diffRows(asset: Asset, rows: StageRow[], calendar = EMPTY_CALENDAR): EntryDiff {
  const changes: StageDateChange[] = []
  const attributeChanges: EntryDiff['attributeChanges'] = []

  for (const row of rows) {
    const stage = asset.stages.find((item) => item.id === row.id)
    if (!stage) continue

    if (stage.currentStart !== row.start || stage.currentFinish !== row.finish) {
      const forward = row.start >= stage.currentStart
      const shifted = forward
        ? countWorkdays(stage.currentStart, row.start, calendar) - 1
        : -(countWorkdays(row.start, stage.currentStart, calendar) - 1)
      changes.push({
        stageId: stage.id,
        oldStart: stage.currentStart,
        oldFinish: stage.currentFinish,
        newStart: row.start,
        newFinish: row.finish,
        shiftedWorkdays: shifted,
      })
    }

    if (stage.productionGroupId !== row.productionGroupId) {
      attributeChanges.push({
        stageId: stage.id,
        field: '制作组',
        before: stage.productionGroupId,
        after: row.productionGroupId,
      })
    }
    if (stage.estimatedPersonDays !== row.estimatedPersonDays) {
      attributeChanges.push({
        stageId: stage.id,
        field: '预估人天',
        before: String(stage.estimatedPersonDays),
        after: String(row.estimatedPersonDays),
      })
    }
    if (stage.ownerName !== row.ownerName) {
      attributeChanges.push({
        stageId: stage.id,
        field: '负责人',
        before: stage.ownerName,
        after: row.ownerName,
      })
    }
  }

  return { changes, attributeChanges }
}

export class ScheduleEntryBlocked extends Error {
  constructor(readonly conflicts: Conflict[]) {
    super(`存在 ${conflicts.length} 项阻断，未写入任何改动`)
    this.name = 'ScheduleEntryBlocked'
  }
}

export interface ConfirmEntryInput {
  projectCode: string
  assetId: string
  rows: StageRow[]
  reason: RevisionReason
  note: string
  actor: string
  at: string
}

/**
 * 确认写入。
 * 校验不通过时抛出并且**不产生任何副作用**——调用方拿到的仍是原来的 state 对象。
 */
export function confirmScheduleEntry(state: DemoState, input: ConfirmEntryInput): DemoState {
  const calendar = state.calendars[0] ?? EMPTY_CALENDAR

  const blocking = checkStageRows(input.rows, calendar).filter((item) => item.severity === 'blocking')
  if (blocking.length > 0) throw new ScheduleEntryBlocked(blocking)

  const next = structuredClone(state)
  const project = next.projects.find((item) => item.code === input.projectCode)
  const asset = project?.assets.find((item) => item.id === input.assetId)
  if (!project || !asset) throw new Error(`找不到资产：${input.projectCode} / ${input.assetId}`)

  const original = state.projects
    .find((item) => item.code === input.projectCode)
    ?.assets.find((item) => item.id === input.assetId)
  if (!original) throw new Error(`找不到资产：${input.assetId}`)

  const diff = diffRows(original, input.rows, calendar)
  if (diff.changes.length === 0 && diff.attributeChanges.length === 0) return state

  for (const row of input.rows) {
    const stage = asset.stages.find((item) => item.id === row.id)
    if (!stage) throw new Error(`找不到阶段：${row.id}`)
    // 基准永不被录入覆盖
    stage.currentStart = row.start
    stage.currentFinish = row.finish
    stage.productionGroupId = row.productionGroupId
    stage.ownerName = row.ownerName
    stage.estimatedPersonDays = row.estimatedPersonDays
    if (diff.changes.some((change) => change.stageId === stage.id)) {
      stage.revisionReason = input.reason
    }
  }

  if (diff.changes.length > 0) {
    const version = next.revisions.filter((item) => item.projectCode === input.projectCode).length + 1
    const revisionId = `REV-${input.projectCode}-${version}`
    next.revisions.push({
      id: revisionId,
      version,
      projectCode: input.projectCode,
      assetId: input.assetId,
      reason: input.reason,
      note: input.note,
      confirmedBy: input.actor,
      confirmedAt: input.at,
      changes: diff.changes,
    })

    next.auditEvents.push({
      id: `AE-${revisionId}`,
      at: input.at,
      actor: input.actor,
      action: `确认排期修订 v${version}`,
      targetKind: 'ScheduleRevision',
      targetId: revisionId,
      before: diff.changes.map((change) => `${change.stageId} ${change.oldStart}—${change.oldFinish}`).join('；'),
      after: diff.changes.map((change) => `${change.stageId} ${change.newStart}—${change.newFinish}`).join('；'),
      reason: input.reason,
    })
  }

  for (const change of diff.attributeChanges) {
    next.auditEvents.push({
      id: `AE-attr-${change.stageId}-${change.field}-${input.at}`,
      at: input.at,
      actor: input.actor,
      action: `修改${change.field}`,
      targetKind: 'StagePlan',
      targetId: change.stageId,
      before: change.before,
      after: change.after,
      reason: input.reason,
    })
  }

  return next
}

export function latestFinish(rows: StageRow[]): IsoDate | undefined {
  return rows.reduce<IsoDate | undefined>(
    (max, row) => (max === undefined || row.finish > max ? row.finish : max),
    undefined,
  )
}
