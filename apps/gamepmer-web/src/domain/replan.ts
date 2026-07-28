import { checkStageRows } from './conflicts'
import type {
  Asset,
  ChangeRequest,
  DemoState,
  FeedbackItem,
  IsoDate,
  Project,
  ScheduleRevisionDraft,
  StageDateChange,
  StagePlan,
  WorkCalendar,
} from './model'
import { buildStageRows, cascadeShift, updateRow } from './scheduleEntry'
import { EMPTY_CALENDAR, countWorkdays, moveByWorkdays, nextWorkday } from './workCalendar'

/**
 * 客户反馈引起的排期重排。
 *
 * 三条不能破的规则：
 * 1. 草案不碰正式计划。生成、调整、预览全程 `StagePlan.current*` 不变，取消就是把草案丢掉。
 * 2. 确认是原子操作，同时写入修订、更新阶段、生成审计与通知草稿；基准永不被覆盖。
 * 3. 通知只到草稿为止。生成草稿不等于发送，发送要 PM 自己动手。
 */

export interface DraftContext {
  project: Project
  asset: Asset
  item: FeedbackItem
  batchId: string
  calendar: WorkCalendar
}

export function locateFeedbackItem(state: DemoState, itemId: string): DraftContext | undefined {
  for (const batch of state.feedbackBatches) {
    const item = batch.items.find((entry) => entry.id === itemId)
    if (!item) continue
    for (const project of state.projects) {
      const asset = project.assets.find((entry) => entry.id === item.assetId)
      if (!asset) continue
      const calendar = state.calendars.find((entry) => entry.id === project.calendarId) ?? EMPTY_CALENDAR
      return { project, asset, item, batchId: batch.id, calendar }
    }
  }
  return undefined
}

/**
 * 生成返修草案。
 *
 * 受影响范围＝被反馈的阶段本身，加上它之后所有尚未获得客户验收的阶段。
 * 已验收的阶段不动——客户已经认过的事实不能被一次新反馈改写。
 */
export function generateReplanDraft(
  state: DemoState,
  itemId: string,
  today: IsoDate,
): ScheduleRevisionDraft {
  const context = locateFeedbackItem(state, itemId)
  if (!context) throw new Error(`找不到反馈项：${itemId}`)

  const { project, asset, item, calendar } = context
  const target = asset.stages.find((stage) => stage.id === item.stageId)
  if (!target) throw new Error(`找不到反馈关联阶段：${item.stageId}`)

  const targetIndex = asset.stages.findIndex((stage) => stage.id === target.id)
  const reworkDays = Math.max(1, item.estimatedReworkDays)

  let rows = buildStageRows(asset)

  // 返修从下一个可用工作日开始，占 reworkDays 个工作日；原有的开始日保留为历史事实
  const reworkStart = nextWorkday(today, calendar)
  const reworkFinish = moveByWorkdays(reworkStart, reworkDays - 1, calendar)
  rows = updateRow(rows, target.id, {
    finish: reworkFinish > target.currentFinish ? reworkFinish : target.currentFinish,
  })

  // 后续未验收阶段整体顺延同样的工作日数，再由 cascade 收拾依赖
  for (const stage of asset.stages.slice(targetIndex + 1)) {
    if (stage.status === 'Approved') continue
    rows = updateRow(rows, stage.id, {
      start: moveByWorkdays(stage.currentStart, reworkDays, calendar),
      finish: moveByWorkdays(stage.currentFinish, reworkDays, calendar),
    })
  }

  rows = cascadeShift(rows, calendar)

  const changes: StageDateChange[] = []
  for (const row of rows) {
    const stage = asset.stages.find((entry) => entry.id === row.id)
    if (!stage) continue
    if (stage.currentStart === row.start && stage.currentFinish === row.finish) continue
    changes.push({
      stageId: stage.id,
      oldStart: stage.currentStart,
      oldFinish: stage.currentFinish,
      newStart: row.start,
      newFinish: row.finish,
      shiftedWorkdays: countWorkdays(stage.currentStart, row.start, calendar) - 1,
    })
  }

  return {
    id: `draft-${item.id}`,
    projectCode: project.code,
    assetId: asset.id,
    sourceFeedbackItemId: item.id,
    reason: 'client-feedback',
    changes,
    createdAt: today,
  }
}

function shiftBetween(from: IsoDate, to: IsoDate, calendar: WorkCalendar): number {
  return to >= from
    ? countWorkdays(from, to, calendar) - 1
    : -(countWorkdays(to, from, calendar) - 1)
}

/**
 * 按整工作日手工调整草案里的某个阶段。
 *
 * 调整会沿依赖链往下带：把一个阶段往后推，后面排不开的阶段自动跟着顺延；
 * 往前提则钳制到不早于前一个阶段的结束。
 * 单独挪一行、再让 PM 自己去收拾一串「依赖倒置」，正是录排期不顺手的典型。
 * 落在周末或公司休息日的日期由工作日历自动跳过。
 */
export function moveDraftStage(
  draft: ScheduleRevisionDraft,
  stageId: string,
  deltaWorkdays: number,
  calendar: WorkCalendar = EMPTY_CALENDAR,
): ScheduleRevisionDraft {
  const index = draft.changes.findIndex((change) => change.stageId === stageId)
  if (index < 0) return draft

  const changes = draft.changes.map((change) => ({ ...change }))
  const target = changes[index]
  const span = Math.max(1, countWorkdays(target.newStart, target.newFinish, calendar))

  let newStart = moveByWorkdays(target.newStart, deltaWorkdays, calendar)
  const previous = changes[index - 1]
  if (previous) {
    const earliest = moveByWorkdays(previous.newFinish, 1, calendar)
    if (newStart < earliest) newStart = earliest
  }

  target.newStart = newStart
  target.newFinish = moveByWorkdays(newStart, span - 1, calendar)
  target.shiftedWorkdays = shiftBetween(target.oldStart, newStart, calendar)

  // 后续阶段只在排不开时才动，本来就有余量的保持原样
  for (let cursor = index + 1; cursor < changes.length; cursor += 1) {
    const current = changes[cursor]
    const earliest = moveByWorkdays(changes[cursor - 1].newFinish, 1, calendar)
    if (current.newStart >= earliest) break
    const currentSpan = Math.max(1, countWorkdays(current.newStart, current.newFinish, calendar))
    current.newStart = earliest
    current.newFinish = moveByWorkdays(earliest, currentSpan - 1, calendar)
    current.shiftedWorkdays = shiftBetween(current.oldStart, earliest, calendar)
  }

  return { ...draft, changes }
}

export function draftBlockingIssues(
  state: DemoState,
  draft: ScheduleRevisionDraft,
): ReturnType<typeof checkStageRows> {
  const context = state.projects
    .find((project) => project.code === draft.projectCode)
    ?.assets.find((asset) => asset.id === draft.assetId)
  if (!context) return []

  const calendar = state.calendars[0] ?? EMPTY_CALENDAR
  let rows = buildStageRows(context)
  for (const change of draft.changes) {
    rows = updateRow(rows, change.stageId, { start: change.newStart, finish: change.newFinish })
  }
  return checkStageRows(rows, calendar).filter((item) => item.severity === 'blocking')
}

export class ReplanBlocked extends Error {
  constructor(readonly conflicts: ReturnType<typeof checkStageRows>) {
    super(`草案存在 ${conflicts.length} 项阻断，未写入任何改动`)
    this.name = 'ReplanBlocked'
  }
}

export interface ConfirmReplanInput {
  draft: ScheduleRevisionDraft
  note: string
  actor: string
  at: string
}

/**
 * 确认草案：一次性写入修订、更新阶段、生成审计事件和未发送通知草稿。
 * 任一校验不过就整体拒绝，绝不出现「部分阶段已改、部分没改」。
 */
export function confirmReplan(state: DemoState, input: ConfirmReplanInput): DemoState {
  const { draft } = input
  const blocking = draftBlockingIssues(state, draft)
  if (blocking.length > 0) throw new ReplanBlocked(blocking)
  if (draft.changes.length === 0) return state

  const next = structuredClone(state)
  const project = next.projects.find((item) => item.code === draft.projectCode)
  const asset = project?.assets.find((item) => item.id === draft.assetId)
  if (!project || !asset) throw new Error(`找不到资产：${draft.assetId}`)

  for (const change of draft.changes) {
    const stage = asset.stages.find((item) => item.id === change.stageId)
    if (!stage) throw new Error(`找不到阶段：${change.stageId}`)
    // 基准原封不动，只动当前计划
    stage.currentStart = change.newStart
    stage.currentFinish = change.newFinish
    stage.revisionReason = 'client-feedback'
    stage.flags = stage.flags.filter((flag) => flag !== 'ScheduleRevisionRequired')
  }

  // 被反馈的阶段进入返修
  const item = findFeedbackItem(next, draft.sourceFeedbackItemId)
  if (item) {
    item.status = 'InRework'
    const target = asset.stages.find((stage) => stage.id === item.stageId)
    if (target && !target.flags.includes('Rework')) target.flags.push('Rework')
  }

  const version = next.revisions.filter((entry) => entry.projectCode === draft.projectCode).length + 1
  const revisionId = `REV-${draft.projectCode}-${version}`
  next.revisions.push({
    id: revisionId,
    version,
    projectCode: draft.projectCode,
    assetId: draft.assetId,
    sourceFeedbackItemId: draft.sourceFeedbackItemId,
    reason: 'client-feedback',
    note: input.note,
    confirmedBy: input.actor,
    confirmedAt: input.at,
    changes: structuredClone(draft.changes),
  })

  next.auditEvents.push({
    id: `AE-${revisionId}`,
    at: input.at,
    actor: input.actor,
    action: `确认排期修订 v${version}`,
    targetKind: 'ScheduleRevision',
    targetId: revisionId,
    before: draft.changes.map((c) => `${c.stageId} ${c.oldStart}—${c.oldFinish}`).join('；'),
    after: draft.changes.map((c) => `${c.stageId} ${c.newStart}—${c.newFinish}`).join('；'),
    reason: 'client-feedback',
  })

  // 通知只生成草稿，发送是另一件事
  const summary = draft.changes
    .map((c) => `${c.stageId.split('/')[1]}：${c.oldStart}—${c.oldFinish} → ${c.newStart}—${c.newFinish}`)
    .join('\n')

  const group = next.productionGroups.find(
    (entry) => entry.id === asset.stages.find((stage) => stage.id === draft.changes[0].stageId)?.productionGroupId,
  )

  next.notificationDrafts.push(
    {
      id: `ND-${revisionId}-lead`,
      recipientRole: '组长',
      recipientName: group?.leadName ?? '组长',
      subject: `[排期修订 v${version}] ${draft.projectCode} / ${draft.assetId}`,
      body: `因客户反馈，以下阶段排期调整：\n${summary}\n\n原因：${input.note}`,
      sourceKind: 'schedule-revision',
      sourceId: revisionId,
      status: 'draft',
    },
    {
      id: `ND-${revisionId}-director`,
      recipientRole: '艺术总监',
      recipientName: project.artDirectorName,
      subject: `[排期修订 v${version}] ${draft.projectCode} / ${draft.assetId}`,
      body: `因客户反馈，以下阶段排期调整：\n${summary}\n\n原因：${input.note}`,
      sourceKind: 'schedule-revision',
      sourceId: revisionId,
      status: 'draft',
    },
  )

  return next
}

// ---------------------------------------------------------------- 范围分流

/** 范围内返修：只标记分类，排期改动仍要 PM 确认草案后才发生。 */
export function classifyInScope(state: DemoState, itemId: string, at: string, actor: string): DemoState {
  const next = structuredClone(state)
  const item = findFeedbackItem(next, itemId)
  if (!item) throw new Error(`找不到反馈项：${itemId}`)

  item.scope = 'in-scope'
  item.status = 'Confirmed'
  next.auditEvents.push({
    id: `AE-scope-${itemId}-${at}`,
    at,
    actor,
    action: '判定反馈范围',
    targetKind: 'FeedbackItem',
    targetId: itemId,
    before: 'unclassified',
    after: 'in-scope',
  })
  return next
}

/**
 * 范围外新增：创建变更单，只冻结受影响资产。
 * 其余资产继续制作——把无关资产一起冻住是明确禁止的失败模式。
 */
export function classifyOutOfScope(
  state: DemoState,
  itemId: string,
  at: string,
  actor: string,
): DemoState {
  const next = structuredClone(state)
  const item = findFeedbackItem(next, itemId)
  if (!item) throw new Error(`找不到反馈项：${itemId}`)

  const batch = next.feedbackBatches.find((entry) => entry.items.some((row) => row.id === itemId))
  item.scope = 'out-of-scope'
  item.status = 'WaitingChangeQuote'

  const sequence = next.changeRequests.length + 4 // 种子里主路径的变更单编号从 CQ-004 起
  const changeRequest: ChangeRequest = {
    id: `CQ-${String(sequence).padStart(3, '0')}`,
    projectCode: batch?.projectCode ?? '',
    assetId: item.assetId,
    sourceFeedbackItemId: itemId,
    title: item.title,
    status: 'ClassifiedExtra',
  }
  next.changeRequests.push(changeRequest)

  // 只给受影响阶段加等待标记
  for (const project of next.projects) {
    for (const asset of project.assets) {
      if (asset.id !== item.assetId) continue
      const stage = asset.stages.find((entry) => entry.id === item.stageId)
      if (stage && !stage.flags.includes('WaitingChangeQuote')) {
        stage.flags.push('WaitingChangeQuote')
      }
    }
  }

  next.auditEvents.push({
    id: `AE-scope-${itemId}-${at}`,
    at,
    actor,
    action: '判定反馈范围并创建变更单',
    targetKind: 'FeedbackItem',
    targetId: itemId,
    before: 'unclassified',
    after: `out-of-scope / ${changeRequest.id}`,
  })

  return next
}

export class ReclassifyBlocked extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReclassifyBlocked'
  }
}

/**
 * 撤销范围判定，退回待分流。
 *
 * PM 判错是常事，判定必须可改。但只能撤销尚未产生正式后果的判定：
 * 一旦排期修订已经确认写入，撤销分类并不能把修订收回去——
 * 那种情况要走一次新的修订，而不是假装之前没发生。
 */
export function reclassifyFeedback(
  state: DemoState,
  itemId: string,
  at: string,
  actor: string,
): DemoState {
  const current = findFeedbackItem(state, itemId)
  if (!current) throw new Error(`找不到反馈项：${itemId}`)
  if (current.status === 'InRework' || current.status === 'Resubmitted' || current.status === 'Closed') {
    throw new ReclassifyBlocked(
      '该反馈已确认排期修订，不能直接改回待分流。如需调整，请重新生成一次排期修订。',
    )
  }

  const next = structuredClone(state)
  const item = findFeedbackItem(next, itemId)
  if (!item) throw new Error(`找不到反馈项：${itemId}`)

  const before = item.scope

  // 范围外判定连带创建过变更单和冻结标记，撤销时一并回收
  if (item.scope === 'out-of-scope') {
    const changeRequest = next.changeRequests.find((entry) => entry.sourceFeedbackItemId === itemId)
    if (changeRequest && changeRequest.status !== 'ClassifiedExtra') {
      throw new ReclassifyBlocked(
        `变更单 ${changeRequest.id} 已进入报价流程，不能直接撤销范围判定。`,
      )
    }
    next.changeRequests = next.changeRequests.filter(
      (entry) => entry.sourceFeedbackItemId !== itemId,
    )

    // 同一阶段可能还有别的范围外反馈，只有全部撤销后才解除冻结
    const stillFrozen = next.feedbackBatches.some((batch) =>
      batch.items.some(
        (entry) =>
          entry.id !== itemId && entry.stageId === item.stageId && entry.scope === 'out-of-scope',
      ),
    )
    if (!stillFrozen) {
      for (const project of next.projects) {
        for (const asset of project.assets) {
          const stage = asset.stages.find((entry) => entry.id === item.stageId)
          if (stage) stage.flags = stage.flags.filter((flag) => flag !== 'WaitingChangeQuote')
        }
      }
    }
  }

  item.scope = 'unclassified'
  item.status = 'NeedsClassification'

  next.auditEvents.push({
    id: `AE-scope-reset-${itemId}-${at}`,
    at,
    actor,
    action: '撤销反馈范围判定',
    targetKind: 'FeedbackItem',
    targetId: itemId,
    before,
    after: 'unclassified',
  })

  return next
}

function findFeedbackItem(state: DemoState, itemId?: string): FeedbackItem | undefined {
  if (!itemId) return undefined
  for (const batch of state.feedbackBatches) {
    const item = batch.items.find((entry) => entry.id === itemId)
    if (item) return item
  }
  return undefined
}

/** 草案影响到的阶段集合，供甘特叠加草案层。 */
export function draftStageIds(draft?: ScheduleRevisionDraft): Set<string> {
  return new Set(draft?.changes.map((change) => change.stageId) ?? [])
}

/** 未受影响的资产——验收时要能证明它们没被误伤。 */
export function untouchedAssets(state: DemoState, draft: ScheduleRevisionDraft): string[] {
  const touched = new Set([draft.assetId])
  const result: string[] = []
  for (const project of state.projects) {
    for (const asset of project.assets) {
      if (!touched.has(asset.id)) result.push(asset.id)
    }
  }
  return result
}

export type { StagePlan }
