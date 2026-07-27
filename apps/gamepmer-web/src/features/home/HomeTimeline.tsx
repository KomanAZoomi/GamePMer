import type { DemoState, IsoDate, StagePlan } from '../../domain/model'
import {
  EMPTY_CALENDAR,
  addCalendarDays,
  calendarDaysBetween,
  monthDayLabel,
  startOfWeek,
  weekdayLabel,
  workdaySequence,
} from '../../domain/workCalendar'

interface HomeTimelineProps {
  state: DemoState
  today: IsoDate
  onOpenSchedule: () => void
}

/**
 * 首页时间线是跨项目概览。
 *
 * 一行一个资产——同一项目的多个资产并行推进，挤进一行会互相压住标签，
 * 看起来密集其实读不出任何节点。编辑、基准对比和依赖留给项目甘特。
 */
const WINDOW_DAYS = 28
/** 窗口从上一周的周一开始，这样今天线不会贴在最左边，能看到已经完成的阶段 */
const LOOKBACK_DAYS = 7

function stageTone(stage: StagePlan): string {
  if (stage.flags.includes('Rework')) return 'feedback'
  if (stage.flags.includes('PossibleDelay')) return 'risk'
  if (stage.status === 'Approved') return 'done'
  if (stage.status === 'AwaitingClient' || stage.status === 'SubmittedToClient') return 'wait'
  if (stage.status === 'InProduction') return 'active'
  return 'plan'
}

export function HomeTimeline({ state, today, onOpenSchedule }: HomeTimelineProps) {
  const windowStart = addCalendarDays(startOfWeek(today), -LOOKBACK_DAYS)
  const windowEnd = addCalendarDays(windowStart, WINDOW_DAYS - 1)
  const calendar = state.calendars[0] ?? EMPTY_CALENDAR
  const days = workdaySequence(windowStart, windowEnd, calendar)

  const percent = (date: IsoDate) => (calendarDaysBetween(windowStart, date) / WINDOW_DAYS) * 100
  const todayLeft = percent(today) + 100 / WINDOW_DAYS / 2

  const rows = state.projects.flatMap((project) =>
    project.assets
      .map((asset) => ({
        project,
        asset,
        stages: asset.stages.filter(
          (stage) => stage.currentFinish >= windowStart && stage.currentStart <= windowEnd,
        ),
      }))
      .filter((row) => row.stages.length > 0),
  )

  return (
    <section className="gp-card gp-timeline" aria-label="跨项目时间线">
      <header className="gp-card-head">
        <h2>
          跨项目时间线
          <span className="gp-deck-sub">
            {monthDayLabel(windowStart)} — {monthDayLabel(windowEnd)} · 一行一个资产 · 按当前计划
          </span>
        </h2>
        <button type="button" className="gp-btn gp-btn-quiet" onClick={onOpenSchedule}>
          打开排期管理
        </button>
      </header>

      <div className="gp-timeline-body">
        <div className="gp-timeline-labels">
          <div className="gp-timeline-corner" />
          {rows.map((row) => (
            <div
              key={`${row.project.code}/${row.asset.id}`}
              className="gp-timeline-label"
              title={`${row.project.code} · ${row.asset.name}`}
            >
              <strong>{row.asset.id}</strong>
              <span>{row.project.code}</span>
            </div>
          ))}
        </div>

        <div className="gp-timeline-grid">
          <div className="gp-timeline-axis">
            {days.map((day) => (
              <div
                key={day.date}
                className={`gp-axis-day${day.isWorkday ? '' : ' is-off'}${day.date === today ? ' is-today' : ''}`}
              >
                <span>{monthDayLabel(day.date)}</span>
                <span className="gp-axis-weekday">{weekdayLabel(day.date)}</span>
              </div>
            ))}
          </div>

          <div className="gp-timeline-rows">
            <div className="gp-today-line" style={{ left: `${todayLeft}%` }}>
              <span>今天</span>
            </div>

            {rows.map((row) => (
              <div key={`${row.project.code}/${row.asset.id}`} className="gp-timeline-row">
                {days.map((day) => (
                  <span
                    key={day.date}
                    className={`gp-row-cell${day.isWorkday ? '' : ' is-off'}`}
                    aria-hidden="true"
                  />
                ))}

                {row.stages.map((stage) => {
                  const start = stage.currentStart < windowStart ? windowStart : stage.currentStart
                  const finish = stage.currentFinish > windowEnd ? windowEnd : stage.currentFinish
                  const width = ((calendarDaysBetween(start, finish) + 1) / WINDOW_DAYS) * 100
                  return (
                    <span
                      key={stage.id}
                      className={`gp-timeline-bar is-${stageTone(stage)}`}
                      style={{ left: `${percent(start)}%`, width: `${width}%` }}
                      title={`${row.asset.id} · ${stage.name}｜${stage.currentStart} — ${stage.currentFinish}｜${stage.ownerName} · ${stage.estimatedPersonDays} 人天`}
                    >
                      {stage.name}
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className="gp-legend">
        <span className="gp-legend-item">
          <i className="gp-legend-mark is-plan" />
          计划中
        </span>
        <span className="gp-legend-item">
          <i className="gp-legend-mark is-active" />
          制作中
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
        <span className="gp-legend-item">
          <i className="gp-legend-mark is-done" />
          已验收
        </span>
        <span className="gp-legend-note">
          悬停任一条查看负责人与人天；完整基准/实际对比在项目甘特（C2）中。
        </span>
      </footer>
    </section>
  )
}
