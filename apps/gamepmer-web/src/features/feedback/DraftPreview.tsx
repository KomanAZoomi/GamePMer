import type { DemoState, ScheduleRevisionDraft } from '../../domain/model'
import { draftBlockingIssues } from '../../domain/replan'
import { dateRange } from '../../domain/workCalendar'

interface DraftPreviewProps {
  state: DemoState
  draft: ScheduleRevisionDraft
  untouchedAssets: string[]
  note: string
  onNoteChange: (note: string) => void
  onMove: (stageId: string, deltaWorkdays: number) => void
  onCancel: () => void
  onConfirm: () => void
}

/**
 * 排期修订草案预览。
 *
 * 必须同时给出旧日期、新日期、工作日增量、受影响节点和**未受影响的资产**——
 * 最后一条同样重要：PM 需要确认这次重排没有误伤别的资产。
 */
export function DraftPreview({
  state,
  draft,
  untouchedAssets,
  note,
  onNoteChange,
  onMove,
  onCancel,
  onConfirm,
}: DraftPreviewProps) {
  const blocking = draftBlockingIssues(state, draft)
  const asset = state.projects
    .find((project) => project.code === draft.projectCode)
    ?.assets.find((item) => item.id === draft.assetId)

  const stageName = (stageId: string) =>
    asset?.stages.find((stage) => stage.id === stageId)?.name ?? stageId.split('/')[1]

  return (
    <section className="gp-draft" aria-label="排期修订草案">
      <header className="gp-draft-head">
        <div>
          <h3>排期修订草案 · 未确认</h3>
          <p>
            {draft.projectCode} / {draft.assetId} · 来源 {draft.sourceFeedbackItemId} ·{' '}
            {draft.changes.length} 个阶段受影响
          </p>
        </div>
        <span className="gp-pill is-flag">草案不影响正式计划</span>
      </header>

      <table className="gp-draft-table">
        <thead>
          <tr>
            <th>阶段</th>
            <th>原计划</th>
            <th>新计划</th>
            <th>工作日增量</th>
            <th>微调</th>
          </tr>
        </thead>
        <tbody>
          {draft.changes.map((change) => (
            <tr key={change.stageId}>
              <td className="gp-draft-stage">{stageName(change.stageId)}</td>
              <td className="gp-draft-old">{dateRange(change.oldStart, change.oldFinish)}</td>
              <td className="gp-draft-new">{dateRange(change.newStart, change.newFinish)}</td>
              <td className="gp-draft-delta">
                {change.shiftedWorkdays > 0 ? `+${change.shiftedWorkdays}` : change.shiftedWorkdays}
              </td>
              <td className="gp-draft-nudge">
                <button
                  type="button"
                  className="gp-btn"
                  aria-label={`${stageName(change.stageId)} 提前一个工作日`}
                  onClick={() => onMove(change.stageId, -1)}
                >
                  −1
                </button>
                <button
                  type="button"
                  className="gp-btn"
                  aria-label={`${stageName(change.stageId)} 顺延一个工作日`}
                  onClick={() => onMove(change.stageId, 1)}
                >
                  +1
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {blocking.length > 0 && (
        <ul className="gp-entry-issues">
          {blocking.map((item) => (
            <li key={item.id} className="is-blocking">
              <strong>{item.title}</strong>
              {item.detail}
            </li>
          ))}
        </ul>
      )}

      <div className="gp-draft-scope">
        <p>
          <strong>未受影响：</strong>
          {untouchedAssets.join('、')} 的排期与制作组档期保持原样，本次重排不会碰它们。
        </p>
        <p className="gp-draft-note">
          确认后写入一个新的修订版本，基准日期保留，并生成给组长与艺术总监的<b>未发送</b>通知草稿。
        </p>
      </div>

      <footer className="gp-draft-foot">
        <label className="gp-entry-field gp-entry-note">
          <span>修订原因</span>
          <input
            className="gp-input"
            value={note}
            placeholder="客户反馈引起的返修重排"
            onChange={(event) => onNoteChange(event.target.value)}
          />
        </label>
        <div className="gp-draft-actions">
          <button type="button" className="gp-btn" onClick={onCancel}>
            取消草案
          </button>
          <button
            type="button"
            className="gp-btn gp-btn-primary"
            disabled={blocking.length > 0}
            onClick={onConfirm}
          >
            {blocking.length > 0 ? '确认重排（被阻断）' : '确认重排'}
          </button>
        </div>
      </footer>
    </section>
  )
}
