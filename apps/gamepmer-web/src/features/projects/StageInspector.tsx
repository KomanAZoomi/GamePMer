import { useState } from 'react'
import type { DemoState, Project, StagePlan } from '../../domain/model'
import { groupName, stageFlagLabels, stageStatusLabel } from '../../domain/lookup'
import {
  STAGE_ACTION_LABEL,
  availableStageActions,
  naturalAction,
  stageBlockJumps,
  stageBlockingIssues,
  type StageAction,
} from '../../domain/stageFlow'
import { countWorkdays, dateRange, shortDate } from '../../domain/workCalendar'
import { EMPTY_CALENDAR } from '../../domain/workCalendar'

interface StageInspectorProps {
  state: DemoState
  project: Project
  stage?: StagePlan
  today: string
  onOpenFeedback: () => void
  onAdvance: (stageId: string, action: StageAction, note?: string) => void
  onOpenTriage: () => void
  onOpenQuote: (caseId: string) => void
  onSelectStage: (stageId: string) => void
}

const REASON_LABELS: Record<string, string> = {
  'client-feedback': '客户反馈',
  'client-wait': '客户等待',
  'team-delay': '团队延期',
  'scope-change': '范围变更',
  'capacity-conflict': '容量冲突',
}

export function StageInspector({
  state,
  project,
  stage,
  today,
  onOpenFeedback,
  onAdvance,
  onOpenTriage,
  onOpenQuote,
  onSelectStage,
}: StageInspectorProps) {
  // hooks 必须无条件调用，所以放在早退之前
  const [reworking, setReworking] = useState(false)
  const [reworkNote, setReworkNote] = useState('')

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

  const actions = availableStageActions(state, stage.id)
  // 动不了就得说清为什么——但只说**该做的那一步**为什么做不了。
  // 把四个动作的前置全列出来，会得到三条「未开始，已交 PM 要求先到制作中」，
  // 那是在背状态机，不是在回答 PM 的问题
  const next = naturalAction(stage)
  const blockedReasons = next ? stageBlockingIssues(state, stage.id, next) : []
  const jumps = blockedReasons.length > 0 ? stageBlockJumps(state, stage.id) : []

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

      {/*
        推进动作。**工作台只提示「可以开工了」，不替 PM 改状态**——
        与「不自动发信、不自动改排期」是同一条原则。
        动不了时不给一个点了没反应的按钮，而是把原因逐条写出来。
      */}
      {stage.status !== 'Approved' && (
        <div className="gp-stage-flow">
          <h3>推进这个阶段</h3>
          {actions.length > 0 ? (
            reworking ? (
              <>
                <label className="gp-note-field" htmlFor="gp-rework-note">
                  <span>客户原话</span>
                  <textarea
                    id="gp-rework-note"
                    aria-label="客户原话"
                    className="gp-input"
                    rows={2}
                    placeholder="客户具体说要改什么。范围内外由你在反馈中心判，这里先原样记下来"
                    value={reworkNote}
                    onChange={(event) => setReworkNote(event.target.value)}
                  />
                </label>
                <div className="gp-detail-actions">
                  <button
                    type="button"
                    className="gp-btn gp-btn-primary"
                    disabled={!reworkNote.trim()}
                    title={reworkNote.trim() ? undefined : '不记下客户说了什么，之后没法判范围内外'}
                    onClick={() => {
                      onAdvance(stage.id, 'client-rework', reworkNote)
                      setReworkNote('')
                      setReworking(false)
                      onOpenTriage()
                    }}
                  >
                    记下并去分流
                  </button>
                  <button
                    type="button"
                    className="gp-btn"
                    onClick={() => {
                      setReworking(false)
                      setReworkNote('')
                    }}
                  >
                    取消
                  </button>
                </div>
                <p className="gp-assistant-note">
                  记下来会生成一条<strong>待分流</strong>的资产级反馈项。
                  范围内走返修排期，范围外走追加报价——那个分岔就在分流那一步。
                </p>
              </>
            ) : (
              <div className="gp-detail-actions">
                {actions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    className={`gp-btn${action === actions[0] ? ' gp-btn-primary' : ''}`}
                    onClick={() =>
                      action === 'client-rework' ? setReworking(true) : onAdvance(stage.id, action)
                    }
                  >
                    {STAGE_ACTION_LABEL[action]}
                  </button>
                ))}
              </div>
            )
          ) : (
            <>
              <ul className="gp-stage-flow-blocked">
                {blockedReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {/* 说清为什么动不了只是一半，另一半是「那我该去哪」 */}
              {jumps.length > 0 && (
                <div className="gp-detail-actions">
                  {jumps.map((jump) => (
                    <button
                      key={jump.targetId}
                      type="button"
                      className="gp-btn gp-btn-sm"
                      onClick={() =>
                        jump.kind === 'quote' ? onOpenQuote(jump.targetId) : onSelectStage(jump.targetId)
                      }
                    >
                      {jump.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <p className="gp-assistant-note">
            推进只写实际发生的日期，<strong>不改计划、不改基准</strong>——
            计划要变得走排期重排。
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
            反馈的范围判定与排期重排在反馈中心完成，本页只展示事实。
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
