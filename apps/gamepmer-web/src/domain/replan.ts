import type { DemoState, FeedbackBatch, ScheduleDraft, Stage, StageCode } from './model'
import { moveByWorkdays } from './workCalendar'

function locateFeedback(state: DemoState, feedbackId: string): FeedbackBatch {
  const feedback = state.feedbackBatches.find((item) => item.id === feedbackId)
  if (!feedback) throw new Error(`找不到反馈：${feedbackId}`)
  return feedback
}

function locateStages(state: DemoState, feedback: FeedbackBatch): Stage[] {
  const project = state.projects.find((item) => item.code === feedback.projectCode)
  const asset = project?.assets.find((item) => item.id === feedback.assetId)
  if (!asset) throw new Error(`找不到反馈关联资产：${feedback.assetId}`)
  return asset.stages
}

export function generateReplanDraft(state: DemoState, feedbackId: string): ScheduleDraft {
  const feedback = locateFeedback(state, feedbackId)
  const stages = locateStages(state, feedback)
  const affectedIndex = stages.findIndex((stage) => stage.code === feedback.affectedStageCode)
  if (affectedIndex < 0) throw new Error(`找不到反馈关联节点：${feedback.affectedStageCode}`)

  const changes = stages
    .slice(affectedIndex)
    .filter((stage) => !stage.clientApprovalDate)
    .map((stage) => ({
      stageCode: stage.code,
      oldStart: stage.currentStart,
      oldFinish: stage.currentFinish,
      newStart: moveByWorkdays(stage.currentStart, feedback.addedWorkdays),
      newFinish: moveByWorkdays(stage.currentFinish, feedback.addedWorkdays),
    }))

  return {
    id: `draft-${feedback.id}`,
    feedbackId: feedback.id,
    projectCode: feedback.projectCode,
    assetId: feedback.assetId,
    changes,
    createdAt: feedback.receivedAt,
  }
}

export function moveDraftStage(draft: ScheduleDraft, stageCode: StageCode, deltaWorkdays: number): ScheduleDraft {
  return {
    ...draft,
    changes: draft.changes.map((change) => change.stageCode === stageCode
      ? { ...change, newStart: moveByWorkdays(change.newStart, deltaWorkdays), newFinish: moveByWorkdays(change.newFinish, deltaWorkdays) }
      : change),
  }
}

export function discardDraft(_draft: ScheduleDraft): undefined {
  return undefined
}

export function confirmDraft(state: DemoState, draft: ScheduleDraft, reason: string, note: string): DemoState {
  const next = structuredClone(state)
  const feedback = locateFeedback(next, draft.feedbackId)
  const stages = locateStages(next, feedback)
  const revisionId = `revision-${next.revisions.length + 1}`

  for (const change of draft.changes) {
    const stage = stages.find((item) => item.code === change.stageCode)
    if (!stage) throw new Error(`找不到待确认节点：${change.stageCode}`)
    stage.currentStart = change.newStart
    stage.currentFinish = change.newFinish
    stage.status = change.stageCode === feedback.affectedStageCode ? 'rework' : 'normal'
  }

  next.revisions.push({
    id: revisionId,
    projectCode: draft.projectCode,
    assetId: draft.assetId,
    feedbackId: draft.feedbackId,
    confirmedAt: feedback.receivedAt,
    note: `${reason}：${note}`,
    changes: structuredClone(draft.changes),
  })
  next.notificationDrafts.push(
    { id: `notice-${revisionId}-lead`, revisionId, recipientRole: '组长', subject: `排期修订：${draft.projectCode}`, body: note, status: 'unsent' },
    { id: `notice-${revisionId}-director`, revisionId, recipientRole: '艺术总监', subject: `排期修订：${draft.projectCode}`, body: note, status: 'unsent' },
  )

  return next
}
