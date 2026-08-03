import { useState } from 'react'
import type { DemoState, StagePlan } from '../../domain/model'
import {
  STAGE_ACTION_LABEL,
  availableStageActions,
  naturalAction,
  stageBlockJumps,
  stageBlockingIssues,
  type StageAction,
} from '../../domain/stageFlow'

interface StageFlowActionsProps {
  state: DemoState
  stage: StagePlan
  onAdvance: (stageId: string, action: StageAction, note?: string) => void
  /** 记下客户返修原话后去分流 */
  onOpenTriage: () => void
  onOpenQuote?: (caseId: string) => void
  onSelectStage?: (stageId: string) => void
  title?: string
  /** 推进说明。反馈中心和项目总览关心的点不同，各自说自己的 */
  note?: React.ReactNode
}

/**
 * 阶段推进动作。
 *
 * 项目总览和反馈中心共用同一份实现，因为它们推的是**同一个状态机**。
 * 曾经只有项目总览有这块：PM 在反馈中心确认完排期修订，反馈项停在「返修中」，
 * 想说一句「东西已经交给客户了」却得先跳去另一个页面找同一个阶段。
 * 两处各写一遍按钮会更糟——迟早一边漏掉前置校验，把非法迁移放过去。
 *
 * **工作台只提示「可以推进了」，不替 PM 改状态**，与「不自动发信、不自动改排期」
 * 是同一条原则。动不了时不给一个点了没反应的按钮，而是把原因逐条写出来。
 */
export function StageFlowActions({
  state,
  stage,
  onAdvance,
  onOpenTriage,
  onOpenQuote,
  onSelectStage,
  title = '推进这个阶段',
  note,
}: StageFlowActionsProps) {
  const [reworking, setReworking] = useState(false)
  const [reworkNote, setReworkNote] = useState('')

  const actions = availableStageActions(state, stage.id)
  // 动不了就得说清为什么——但只说**该做的那一步**为什么做不了。
  // 把四个动作的前置全列出来，会得到三条「未开始，已交 PM 要求先到制作中」，
  // 那是在背状态机，不是在回答 PM 的问题
  const next = naturalAction(stage)
  const blockedReasons = next ? stageBlockingIssues(state, stage.id, next) : []
  const jumps = blockedReasons.length > 0 ? stageBlockJumps(state, stage.id) : []

  if (stage.status === 'Approved') return null

  return (
    <div className="gp-stage-flow" aria-label={title}>
      <h3>{title}</h3>
      {actions.length > 0 ? (
        reworking ? (
          <>
            <label className="gp-note-field" htmlFor={`gp-rework-note-${stage.id}`}>
              <span>客户原话</span>
              <textarea
                id={`gp-rework-note-${stage.id}`}
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
          {jumps.length > 0 && (onOpenQuote || onSelectStage) && (
            <div className="gp-detail-actions">
              {jumps.map((jump) => (
                <button
                  key={jump.targetId}
                  type="button"
                  className="gp-btn gp-btn-sm"
                  onClick={() =>
                    jump.kind === 'quote'
                      ? onOpenQuote?.(jump.targetId)
                      : onSelectStage?.(jump.targetId)
                  }
                >
                  {jump.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {note ?? (
        <p className="gp-assistant-note">
          推进只写实际发生的日期，<strong>不改计划、不改基准</strong>—— 计划要变得走排期重排。
        </p>
      )}
    </div>
  )
}
