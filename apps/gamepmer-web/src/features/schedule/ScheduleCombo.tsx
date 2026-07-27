import { useMemo } from 'react'
import type { DemoState, IsoDate, StagePlan } from '../../domain/model'
import { barGeometry, buildTimeAxis, dayCenterPercent, type GanttWindow } from '../../domain/gantt'
import { weeklyLoad, weekStartsFrom } from '../../domain/capacity'
import { matchStage, type ScheduleFilter } from '../../domain/scheduleFilter'
import { EMPTY_CALENDAR, addCalendarDays, calendarDaysBetween, startOfWeek } from '../../domain/workCalendar'

interface ScheduleComboProps {
  state: DemoState
  today: IsoDate
  filter: ScheduleFilter
  onOpenEntry: (assetId: string) => void
}

const WEEKS = 4
const MIN_DAY_WIDTH = 32

function stageTone(stage: StagePlan): string {
  if (stage.flags.includes('Rework')) return 'feedback'
  if (stage.flags.includes('PossibleDelay')) return 'risk'
  if (stage.status === 'Approved') return 'done'
  if (stage.status === 'AwaitingClient' || stage.status === 'SubmittedToClient') return 'wait'
  if (stage.status === 'InProduction') return 'active'
  return 'plan'
}

/**
 * 组合排期按**制作组**分组。
 *
 * 项目甘特已经按资产回答了「这个项目排得怎么样」；
 * 只有把同一个组横跨多个项目的阶段并排放，才看得出「团队装不装得下」。
 */
export function ScheduleCombo({ state, today, filter, onOpenEntry }: ScheduleComboProps) {
  const calendar = state.calendars[0] ?? EMPTY_CALENDAR

  const window = useMemo<GanttWindow>(() => {
    const start = addCalendarDays(startOfWeek(today), -7)
    const end = addCalendarDays(start, WEEKS * 7 - 1)
    return { start, end, totalDays: calendarDaysBetween(start, end) + 1 }
  }, [today])

  const axis = useMemo(
    () => buildTimeAxis(window, calendar, today, 'day'),
    [window, calendar, today],
  )

  const weeks = useMemo(() => weekStartsFrom(today, WEEKS, -1), [today])

  const groups = useMemo(
    () =>
      state.productionGroups
        .filter((group) => !filter.groupId || group.id === filter.groupId)
        .map((group) => {
          const stages: { stage: StagePlan; projectCode: string; assetId: string }[] = []
          for (const project of state.projects) {
            for (const asset of project.assets) {
              for (const stage of asset.stages) {
                if (stage.productionGroupId !== group.id) continue
                if (stage.currentFinish < window.start || stage.currentStart > window.end) continue
                if (!matchStage(stage, project.code, filter)) continue
                stages.push({ stage, projectCode: project.code, assetId: asset.id })
              }
            }
          }
          stages.sort((a, b) => a.stage.currentStart.localeCompare(b.stage.currentStart))
          // 容量条按全量算：筛掉的阶段照样占着这个组的档期
          const loads = weeks.map((weekStart) => weeklyLoad(state, group.id, weekStart, calendar))
          return { group, stages, loads }
        }),
    [state, window, weeks, calendar, filter],
  )

  const gridWidth = Math.max(window.totalDays * MIN_DAY_WIDTH, 640)
  const todayLeft = dayCenterPercent(window, today)

  return (
    <section className="gp-card gp-combo" aria-label="组合排期">
      <header className="gp-card-head">
        <h2>
          组合排期 · 按制作组
          <span className="gp-deck-sub">
            {window.start} — {window.end} · 同一个组跨项目的阶段排在一起，超载区间才看得见
          </span>
        </h2>
      </header>

      <div className="gp-combo-body">
        <div className="gp-combo-rows">
          <div className="gp-combo-head">
            <span>制作组 / 阶段</span>
            <span>项目</span>
            <span>人天</span>
          </div>

          {groups.map(({ group, stages, loads }) => {
            const overWeeks = loads.filter((load) => load.overBy > 0 || load.utilization >= 1)
            return (
              <div key={group.id}>
                <div className="gp-combo-group">
                  <span className="gp-combo-groupname">
                    {group.name} · {group.leadName}
                  </span>
                  <span
                    className="gp-combo-groupcap"
                    title={`每工作日 ${group.dailyCapacity} 人天${overWeeks.length > 0 ? `；${overWeeks.length} 周满载或超载` : ''}`}
                  >
                    {group.dailyCapacity} 人天/日
                    {overWeeks.length > 0 && <em className="gp-warn"> · {overWeeks.length} 周吃紧</em>}
                  </span>
                </div>

                {stages.length === 0 ? (
                  <div className="gp-combo-empty">本窗口内无符合筛选条件的排期</div>
                ) : (
                  stages.map(({ stage, projectCode, assetId }) => (
                    <button
                      key={stage.id}
                      type="button"
                      className="gp-combo-row"
                      onClick={() => onOpenEntry(assetId)}
                      title={`录入 ${assetId} 的计划`}
                    >
                      <span className="gp-combo-stage">
                        {assetId} {stage.name}
                        <small>
                          {stage.ownerName}
                          {stage.flags.length > 0 && ' · 有风险'}
                        </small>
                      </span>
                      <span className="gp-combo-project">{projectCode}</span>
                      <span className="gp-combo-days">{stage.estimatedPersonDays}</span>
                    </button>
                  ))
                )}
              </div>
            )
          })}
        </div>

        <div className="gp-combo-calendar">
          <div className="gp-combo-canvas" style={{ width: `${gridWidth}px` }}>
            <div className="gp-axis-days gp-combo-axis">
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

            <div className="gp-combo-lanes">
              <div className="gp-gantt-today" style={{ left: `${todayLeft}%` }} role="presentation" />

              {groups.map(({ group, stages, loads }) => (
                <div key={group.id}>
                  <div className="gp-combo-grouplane">
                    {loads.map((load) => {
                      if (load.available === 0 || load.utilization < 1) return null
                      const geometry = barGeometry(window, load.weekStart, load.weekEnd)
                      if (!geometry.visible) return null
                      return (
                        <span
                          key={load.weekStart}
                          className={`gp-overload${load.overBy > 0 ? ' is-over' : ' is-full'}`}
                          style={{ left: `${geometry.left}%`, width: `${geometry.width}%` }}
                          title={`${group.name} ${load.weekStart} 当周 ${load.scheduled}/${load.available} 人天`}
                        >
                          {load.overBy > 0 ? `超 ${load.overBy} 人天` : '满载'}
                        </span>
                      )
                    })}
                  </div>

                  {stages.length === 0 ? (
                    <div className="gp-combo-lane" />
                  ) : (
                    stages.map(({ stage, assetId }) => {
                      const geometry = barGeometry(window, stage.currentStart, stage.currentFinish)
                      return (
                        <div key={stage.id} className="gp-combo-lane">
                          {axis.days.map((day) => (
                            <span
                              key={day.date}
                              className={`gp-lane-cell${day.isWorkday ? '' : ' is-off'}`}
                              aria-hidden="true"
                            />
                          ))}
                          {geometry.visible && (
                            <span
                              className={`gp-bar is-current is-${stageTone(stage)}`}
                              style={{ left: `${geometry.left}%`, width: `${geometry.width}%` }}
                              title={`${assetId} · ${stage.name}｜${stage.currentStart} — ${stage.currentFinish}`}
                            >
                              <span className="gp-bar-label">{stage.name}</span>
                            </span>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <footer className="gp-legend">
        <span className="gp-legend-item">
          <i className="gp-legend-mark is-active" />
          当前计划
        </span>
        <span className="gp-legend-item">
          <i className="gp-legend-mark is-wait" />
          等待客户
        </span>
        <span className="gp-legend-item">
          <i className="gp-legend-mark is-feedback" />
          客户反馈返修
        </span>
        <span className="gp-legend-item">
          <i className="gp-legend-mark is-risk" />
          可能延期
        </span>
        <span className="gp-legend-note">点任一阶段行打开该资产的批量录入</span>
      </footer>
    </section>
  )
}
