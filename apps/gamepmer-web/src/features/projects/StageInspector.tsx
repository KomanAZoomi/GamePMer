import type { DemoState, Project, StagePlan } from '../../domain/model'
import { groupName, stageFlagLabels, stageStatusLabel } from '../../domain/lookup'
import { countWorkdays, dateRange, shortDate } from '../../domain/workCalendar'
import { EMPTY_CALENDAR } from '../../domain/workCalendar'

interface StageInspectorProps {
  state: DemoState
  project: Project
  stage?: StagePlan
  today: string
  onOpenFeedback: () => void
}

const REASON_LABELS: Record<string, string> = {
  'client-feedback': '客户反馈',
  'client-wait': '客户等待',
  'team-delay': '团队延期',
  'scope-change': '范围变更',
  'capacity-conflict': '容量冲突',
}

export function StageInspector({ state, project, stage, today, onOpenFeedback }: StageInspectorProps) {
  if (!stage) {
    return (
      <section className="gp-card gp-detail" aria-label="阶段详情">
        <p className="gp-deck-empty">在左侧甘特里选中一个阶段，这里显示它的全部日期与证据。</p>
      </section>
    )
  }

  const calendar = state.calendars.find((item) => item.id === project.calendarId) ?? EMPTY_CALENDAR
  const asset = project.assets.find((item) => item.id === stage.assetId)
  const shifted =
    stage.baselineStart !== stage.currentStart || stage.baselineFinish !== stage.currentFinish
  const shiftDays = shifted
    ? countWorkdays(stage.baselineStart, stage.currentStart, calendar) - 1
    : 0

  const blockers = (asset?.stages ?? []).filter(
    (item) => stage.dependsOn.includes(item.id) && item.status !== 'Approved',
  )

  const feedback = state.feedbackBatches
    .flatMap((batch) => batch.items.map((item) => ({ batch, item })))
    .filter((entry) => entry.item.stageId === stage.id)

  const waitDays = stage.submittedToClientAt
    ? Math.max(0, countWorkdays(stage.submittedToClientAt, stage.clientApprovedAt ?? today, calendar) - 1)
    : 0

  return (
    <section className="gp-card gp-detail" aria-label="阶段详情">
      <div className="gp-detail-kicker">阶段详情</div>
      <div className="gp-detail-id">
        {stage.assetId} / {stage.code}
      </div>
      <h2 className="gp-detail-title">{stage.name}</h2>

      <div className="gp-pill-row">
        <span className="gp-pill is-plain">{stageStatusLabel(stage)}</span>
        {stageFlagLabels(stage).map((flag) => (
          <span key={flag} className="gp-pill is-flag">
            {flag}
          </span>
        ))}
      </div>

      <dl className="gp-detail-grid">
        <div>
          <dt>制作组</dt>
          <dd>{groupName(state, stage.productionGroupId)}</dd>
        </div>
        <div>
          <dt>负责人 · 预估</dt>
          <dd>
            {stage.ownerName} · {stage.estimatedPersonDays} 人天
          </dd>
        </div>
        <div>
          <dt>基准排期</dt>
          <dd title={`${stage.baselineStart} — ${stage.baselineFinish}`}>
            {dateRange(stage.baselineStart, stage.baselineFinish)}
          </dd>
        </div>
        <div className={shifted ? 'is-changed' : undefined}>
          <dt>当前排期</dt>
          <dd title={`${stage.currentStart} — ${stage.currentFinish}`}>
            {dateRange(stage.currentStart, stage.currentFinish)}
            {shifted && ` · +${shiftDays} 工作日`}
          </dd>
        </div>
        <div>
          <dt>实际开工</dt>
          <dd>{stage.actualStart ? shortDate(stage.actualStart) : '尚未开始'}</dd>
        </div>
        <div>
          <dt>实际完成</dt>
          <dd>{stage.actualFinish ? shortDate(stage.actualFinish) : '未完成'}</dd>
        </div>
        <div>
          <dt>提交客户</dt>
          <dd>{stage.submittedToClientAt ? shortDate(stage.submittedToClientAt) : '未提交'}</dd>
        </div>
        <div>
          <dt>客户确认</dt>
          <dd>
            {stage.clientApprovedAt
              ? shortDate(stage.clientApprovedAt)
              : stage.submittedToClientAt
                ? `等待中 ${waitDays} 工作日`
                : '—'}
          </dd>
        </div>
      </dl>

      {shifted && (
        <div className="gp-evidence">
          <h3>偏移原因</h3>
          <p className="gp-inspector-text">
            {REASON_LABELS[stage.revisionReason ?? ''] ?? '未标注原因'}
            ：当前计划较基准顺延 {shiftDays} 个工作日。基准日期保持不变，可随时对比。
          </p>
        </div>
      )}

      {blockers.length > 0 && (
        <div className="gp-evidence">
          <h3>前置未完成</h3>
          <p className="gp-inspector-text">
            {blockers.map((item) => `${item.name}（${stageStatusLabel(item)}）`).join('、')}
            ：前置未获客户验收前，本阶段的开工日期只是计划值。
          </p>
        </div>
      )}

      {feedback.length > 0 && (
        <div className="gp-assistant">
          <h3>关联客户反馈</h3>
          {feedback.map(({ batch, item }) => (
            <p key={item.id} className="gp-inspector-text">
              <strong>{batch.id}</strong> · {item.title}（预计 {item.estimatedReworkDays} 个工作日）
            </p>
          ))}
          <p className="gp-assistant-note">
            反馈的范围判定与排期重排在反馈中心完成（C4），本页只展示事实。
          </p>
          <div className="gp-detail-actions">
            <button type="button" className="gp-btn gp-btn-quiet" onClick={onOpenFeedback}>
              打开反馈中心
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
