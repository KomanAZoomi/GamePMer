import { useMemo, useRef } from 'react'
import type { DemoState, IsoDate, Project, StagePlan } from '../../domain/model'
import { stageFlagLabels, stageStatusLabel } from '../../domain/lookup'
import {
  barGeometry,
  buildTimeAxis,
  dayCenterPercent,
  deriveGanttWindow,
  stageBars,
  type AxisScale,
} from '../../domain/gantt'
import { EMPTY_CALENDAR, dateRange } from '../../domain/workCalendar'

interface ProjectGanttProps {
  state: DemoState
  project: Project
  today: IsoDate
  scale: AxisScale
  selectedStageId?: string
  onSelectStage: (stageId: string) => void
  onScaleChange: (scale: AxisScale) => void
}

const SCALES: { key: AxisScale; label: string }[] = [
  { key: 'day', label: '日' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
]

/** 每一天至少这么宽，不够就横向滚动——宁可滚动也不把日期挤成看不清的窄条 */
const MIN_DAY_WIDTH = 34

function stageTone(stage: StagePlan): string {
  if (stage.flags.includes('Rework')) return 'feedback'
  if (stage.flags.includes('PossibleDelay')) return 'risk'
  if (stage.status === 'Approved') return 'done'
  if (stage.status === 'AwaitingClient' || stage.status === 'SubmittedToClient') return 'wait'
  if (stage.status === 'InProduction') return 'active'
  return 'plan'
}

export function ProjectGantt({
  state,
  project,
  today,
  scale,
  selectedStageId,
  onSelectStage,
  onScaleChange,
}: ProjectGanttProps) {
  const calendarRef = useRef<HTMLDivElement>(null)
  const calendar = state.calendars.find((item) => item.id === project.calendarId) ?? EMPTY_CALENDAR

  const window = useMemo(() => deriveGanttWindow(project, today), [project, today])
  const axis = useMemo(
    () => buildTimeAxis(window, calendar, today, scale),
    [window, calendar, today, scale],
  )

  const gridWidth = Math.max(window.totalDays * MIN_DAY_WIDTH, 640)
  const todayLeft = dayCenterPercent(window, today)

  const scrollToToday = () => {
    const node = calendarRef.current
    if (!node) return
    node.scrollLeft = Math.max(0, (todayLeft / 100) * gridWidth - node.clientWidth / 2)
  }

  return (
    <section className="gp-card gp-gantt" aria-label="项目排期甘特">
      <header className="gp-gantt-toolbar">
        <strong>项目排期</strong>
        <span className="gp-gantt-range">
          {window.start} — {window.end} · 共 {window.totalDays} 天
        </span>

        <div className="gp-gantt-legend">
          <span>
            <i className="gp-mark is-baseline" />
            基准
          </span>
          <span>
            <i className="gp-mark is-current" />
            当前
          </span>
          <span>
            <i className="gp-mark is-actual" />
            实际
          </span>
          <span>
            <i className="gp-mark is-wait" />
            等待客户
          </span>
        </div>

        <div className="gp-gantt-actions">
          <div className="gp-scale-switch" role="group" aria-label="时间轴粒度">
            {SCALES.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`gp-scale-btn${scale === item.key ? ' is-active' : ''}`}
                aria-pressed={scale === item.key}
                onClick={() => onScaleChange(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button type="button" className="gp-btn gp-btn-quiet" onClick={scrollToToday}>
            定位今天
          </button>
        </div>
      </header>

      <div className="gp-gantt-body">
        <div className="gp-gantt-rows" role="presentation">
          <div className="gp-gantt-rowhead">
            <span>资产 / 阶段</span>
            <span>负责人</span>
            <span>状态</span>
          </div>

          {project.assets.map((asset) => (
            <div key={asset.id}>
              <div className="gp-gantt-group">
                <span className="gp-group-name">
                  {asset.id} · {asset.name}
                </span>
                <span className="gp-group-progress">
                  {asset.stages.filter((stage) => stage.status === 'Approved').length}/
                  {asset.stages.length} 已验收
                </span>
              </div>

              {asset.stages.map((stage) => (
                <button
                  key={stage.id}
                  type="button"
                  className={`gp-gantt-stagerow${stage.id === selectedStageId ? ' is-active' : ''}`}
                  onClick={() => onSelectStage(stage.id)}
                >
                  <span className="gp-stage-name">
                    {stage.name}
                    <small>{stage.estimatedPersonDays} 人天</small>
                  </span>
                  <span className="gp-stage-owner">{stage.ownerName}</span>
                  <span className={`gp-stage-status is-${stageTone(stage)}`}>
                    {stageStatusLabel(stage)}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="gp-gantt-calendar" ref={calendarRef}>
          <div className="gp-gantt-canvas" style={{ width: `${gridWidth}px` }}>
            <div className="gp-gantt-axis">
              {scale !== 'day' && (
                <div className="gp-axis-groups">
                  {axis.groups.map((group) => (
                    <div
                      key={group.key}
                      className="gp-axis-group"
                      style={{ width: `${(group.span / window.totalDays) * 100}%` }}
                    >
                      {group.label}
                    </div>
                  ))}
                </div>
              )}
              <div className="gp-axis-days">
                {axis.days.map((day) => (
                  <div
                    key={day.date}
                    className={`gp-gantt-day${day.isWorkday ? '' : ' is-off'}${day.isHoliday ? ' is-holiday' : ''}${day.isToday ? ' is-today' : ''}`}
                    title={day.isHoliday ? `${day.date} 公司休息日` : day.date}
                  >
                    <span>{day.dayLabel}</span>
                    <span className="gp-gantt-weekday">{day.isToday ? '今天' : day.weekdayLabel}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="gp-gantt-grid">
              <div className="gp-gantt-today" style={{ left: `${todayLeft}%` }} role="presentation" />

              <div className="gp-gantt-rowhead-spacer" />

              {project.assets.map((asset) => (
                <div key={asset.id}>
                  <div className="gp-gantt-grouplane">
                    {axis.days.map((day) => (
                      <span
                        key={day.date}
                        className={`gp-lane-cell${day.isWorkday ? '' : ' is-off'}`}
                        aria-hidden="true"
                      />
                    ))}
                  </div>

                  {asset.stages.map((stage) => (
                    <div
                      key={stage.id}
                      className={`gp-gantt-lane${stage.id === selectedStageId ? ' is-active' : ''}`}
                    >
                      {axis.days.map((day) => (
                        <span
                          key={day.date}
                          className={`gp-lane-cell${day.isWorkday ? '' : ' is-off'}`}
                          aria-hidden="true"
                        />
                      ))}

                      {stageBars(stage, today).map((bar) => {
                        const geometry = barGeometry(window, bar.start, bar.finish)
                        if (!geometry.visible) return null
                        const tone = bar.layer === 'current' ? ` is-${stageTone(stage)}` : ''
                        return (
                          <span
                            key={`${stage.id}-${bar.layer}`}
                            className={`gp-bar is-${bar.layer}${tone}${bar.open ? ' is-open' : ''}`}
                            style={{ left: `${geometry.left}%`, width: `${geometry.width}%` }}
                            title={`${stage.name} · ${bar.label}｜${dateRange(bar.start, bar.finish)}`}
                          >
                            {bar.layer === 'current' && (
                              <span className="gp-bar-label">{stage.name}</span>
                            )}
                          </span>
                        )
                      })}

                      {stage.clientApprovedAt && (
                        <span
                          className="gp-milestone"
                          style={{ left: `${dayCenterPercent(window, stage.clientApprovedAt)}%` }}
                          title={`客户验收 ${stage.clientApprovedAt}`}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <footer className="gp-gantt-foot">
        <span>
          基准条只在当前计划偏离基准时出现；实际条来自开工与完成证据，未闭合的区间画成开放形态。
        </span>
        <span className="gp-gantt-foot-note">
          灰底列是周末或公司休息日（{calendar.holidays.join('、') || '本窗口内无'}）。
        </span>
      </footer>
    </section>
  )
}
