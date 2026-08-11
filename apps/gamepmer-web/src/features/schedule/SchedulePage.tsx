import { useMemo, useState } from 'react'
import type { RouteKey } from '../../app/navigation'
import { capacityBreakdown, capacityMatrix, weekStartsFrom } from '../../domain/capacity'
import { checkSchedule, summarizeConflicts } from '../../domain/conflicts'
import { activeProjects } from '../../domain/lookup'
import { MILESTONE_LABELS, collectMilestones } from '../../domain/milestones'
import {
  EMPTY_FILTER,
  countStages,
  filterOptions,
  matchMilestone,
  type ScheduleFilter,
} from '../../domain/scheduleFilter'
import { EMPTY_CALENDAR, dateRange, monthDayLabel, weekdayLabel } from '../../domain/workCalendar'
import type { WorkspaceState, WorkspaceStore } from '../workspace/workspaceStore'
import { ScheduleCombo } from './ScheduleCombo'
import { ScheduleEntryDrawer } from './ScheduleEntryDrawer'
import { ScheduleFilterBar } from './ScheduleFilterBar'

interface SchedulePageProps {
  workspace: WorkspaceState
  store: WorkspaceStore
  onNavigate: (route: RouteKey) => void
}

type View = 'combo' | 'capacity' | 'milestones'

const VIEWS: { key: View; label: string }[] = [
  { key: 'combo', label: '组合排期' },
  { key: 'capacity', label: '团队档期' },
  { key: 'milestones', label: '节点清单' },
]

const WEEK_COUNT = 4

export function SchedulePage({ workspace, store, onNavigate }: SchedulePageProps) {
  const { demo, today } = workspace
  const calendar = demo.calendars[0] ?? EMPTY_CALENDAR
  const [view, setView] = useState<View>('combo')
  const [entryAssetId, setEntryAssetId] = useState<string | undefined>()
  const [openWeek, setOpenWeek] = useState<{ groupId: string; weekStart: string } | undefined>()
  const [filter, setFilter] = useState<ScheduleFilter>(EMPTY_FILTER)

  const weeks = useMemo(() => weekStartsFrom(today, WEEK_COUNT, -1), [today])
  // 容量按全量项目计算，不接受筛选参数——筛掉几个项目就显示出空闲会把结论算反
  const matrix = useMemo(() => capacityMatrix(demo, weeks, calendar), [demo, weeks, calendar])
  const conflicts = useMemo(() => checkSchedule(demo, today), [demo, today])
  const allMilestones = useMemo(() => collectMilestones(demo, today, 14), [demo, today])
  const milestones = useMemo(
    () => allMilestones.filter((item) => matchMilestone(item, filter)),
    [allMilestones, filter],
  )
  const summary = summarizeConflicts(conflicts)
  const options = useMemo(() => filterOptions(demo), [demo])
  const stageCount = useMemo(() => countStages(demo, filter), [demo, filter])
  const visibleGroups = matrix.filter((row) => !filter.groupId || row.group.id === filter.groupId)

  const entry = useMemo(() => {
    if (!entryAssetId) return undefined
    for (const project of demo.projects) {
      const asset = project.assets.find((item) => item.id === entryAssetId)
      if (asset) return { project, asset }
    }
    return undefined
  }, [demo, entryAssetId])

  const breakdown = openWeek
    ? capacityBreakdown(demo, openWeek.groupId, openWeek.weekStart, calendar)
    : []

  return (
    <div className="gp-schedule">
      <header className="gp-page-head">
        <div>
          <h1>排期管理与团队档期</h1>
          <p>
            {today}（周{weekdayLabel(today)}）· {activeProjects(demo).length} 个在管项目 ·{' '}
            {demo.productionGroups.length} 个制作组 · 检出{' '}
            <b className={summary.blocking > 0 ? 'gp-over' : undefined}>{summary.blocking} 项阻断</b> 与{' '}
            <b className={summary.warning > 0 ? 'gp-warn' : undefined}>{summary.warning} 项预警</b>
          </p>
        </div>
        <div className="gp-tabs" role="tablist">
          {VIEWS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={view === item.key}
              className={`gp-tab${view === item.key ? ' is-active' : ''}`}
              onClick={() => setView(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <ScheduleFilterBar
        filter={filter}
        options={options}
        showMilestoneKind={view === 'milestones'}
        shown={view === 'milestones' ? milestones.length : stageCount.shown}
        total={view === 'milestones' ? allMilestones.length : stageCount.total}
        unit={view === 'milestones' ? '个节点' : '个阶段'}
        onChange={setFilter}
      />

      <div className="gp-schedule-body">
        <div className="gp-schedule-main">
          {view === 'combo' && (
            <ScheduleCombo
              state={demo}
              today={today}
              filter={filter}
              onOpenEntry={(assetId) => setEntryAssetId(assetId)}
            />
          )}

          {view === 'capacity' && (
            <section className="gp-card" aria-label="团队档期">
              <header className="gp-card-head">
                <h2>
                  团队档期 · 按周
                  <span className="gp-deck-sub">
                    可用人天 = 每日容量 × 该周工作日数；已排人天按阶段区间内的工作日均摊，跨周自动拆分。
                    <b>数字始终按全部项目计算，筛选只决定显示哪几行。</b>
                  </span>
                </h2>
              </header>
              <div className="gp-capacity-scroll">
                <table className="gp-capacity-table">
                  <thead>
                    <tr>
                      <th>制作组</th>
                      {weeks.map((week) => (
                        <th key={week}>
                          {monthDayLabel(week)} 当周{week === weekStartsFrom(today, 1)[0] ? '（本周）' : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleGroups.map((row) => (
                      <tr key={row.group.id}>
                        <th scope="row">
                          {row.group.name}
                          <small>
                            组长 {row.group.leadName} · {row.group.dailyCapacity} 人天/日
                          </small>
                        </th>
                        {row.weeks.map((week) => {
                          const over = week.overBy > 0
                          const full = !over && week.utilization >= 1
                          const tone = over ? 'is-over' : full ? 'is-full' : ''
                          const isOpen =
                            openWeek?.groupId === row.group.id && openWeek.weekStart === week.weekStart
                          return (
                            <td key={week.weekStart}>
                              <button
                                type="button"
                                className={`gp-capacity-cell ${tone}${isOpen ? ' is-open' : ''}`}
                                aria-label={`${row.group.name} ${week.weekStart} 当周占用明细`}
                                onClick={() =>
                                  setOpenWeek(
                                    isOpen ? undefined : { groupId: row.group.id, weekStart: week.weekStart },
                                  )
                                }
                              >
                                <span className="gp-capacity-bar">
                                  <span
                                    className="gp-capacity-fill"
                                    style={{ width: `${Math.min(100, week.utilization * 100)}%` }}
                                  />
                                </span>
                                <b>
                                  {week.scheduled} / {week.available}
                                </b>
                                <small>
                                  {over
                                    ? `超 ${week.overBy} 人天`
                                    : full
                                      ? '满载 · 无缓冲'
                                      : `余 ${Math.round((week.available - week.scheduled) * 100) / 100} 人天`}
                                  {week.workdays < 5 && ` · ${week.workdays} 个工作日`}
                                </small>
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {openWeek && (
                <div className="gp-breakdown">
                  <h3>
                    {demo.productionGroups.find((item) => item.id === openWeek.groupId)?.name} ·{' '}
                    {openWeek.weekStart} 当周占用明细
                  </h3>
                  {breakdown.length === 0 ? (
                    <p className="gp-breakdown-empty">该周没有占用。</p>
                  ) : (
                    <ul>
                      {breakdown.map((item) => (
                        <li key={item.stageId}>
                          <span>
                            <strong>
                              {item.assetId} · {item.stageName}
                            </strong>
                            {item.projectCode} · {item.ownerName} · {dateRange(item.start, item.finish)}
                          </span>
                          <b>{item.personDays} 人天</b>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="gp-breakdown-note">
                    等待客户与等待变更报价的阶段不消耗人天，但仍占项目时间线；容量只统计到制作组，不记录具体制作人员。
                  </p>
                </div>
              )}
            </section>
          )}

          {view === 'milestones' && (
            <section className="gp-card" aria-label="节点清单">
              <header className="gp-card-head">
                <h2>
                  节点清单 · 未来 14 天
                  <span className="gp-deck-sub">全部由正式状态派生，没有独立存储的节点记录</span>
                </h2>
                <span className="gp-count">{milestones.length}</span>
              </header>
              <div className="gp-milestone-scroll">
                <table className="gp-milestone-table">
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>类型</th>
                      <th>项目 / 资产 / 阶段</th>
                      <th>负责人</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {milestones.map((item) => (
                      <tr key={item.id} className={item.date === today ? 'is-today' : undefined}>
                        <td className="gp-milestone-date">
                          {monthDayLabel(item.date)} {weekdayLabel(item.date)}
                        </td>
                        <td>
                          <span className={`gp-pill is-${item.kind}`}>{MILESTONE_LABELS[item.kind]}</span>
                        </td>
                        <td>
                          {item.projectCode} / {item.assetId}
                          {item.stageName && item.stageName !== '—' ? ` / ${item.stageName}` : ''}
                        </td>
                        <td>{item.ownerName ?? '—'}</td>
                        <td className={item.tone === 'risk' ? 'gp-over' : item.tone === 'warn' ? 'gp-warn' : undefined}>
                          {item.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {entry && (
            <ScheduleEntryDrawer
              state={demo}
              asset={entry.asset}
              projectCode={entry.project.code}
              today={today}
              onCancel={() => setEntryAssetId(undefined)}
              onConfirm={(rows, reason, note) => {
                store.confirmScheduleEntry(entry.project.code, entry.asset.id, rows, reason, note)
                setEntryAssetId(undefined)
              }}
            />
          )}
        </div>

        <aside className="gp-schedule-side">
          <section className="gp-card" aria-label="冲突检查">
            <header className="gp-card-head">
              <h2>
                冲突检查
                <span className="gp-deck-sub">阻断=数据错了，预警=有风险但可确认</span>
              </h2>
              <span className="gp-count">{conflicts.length}</span>
            </header>
            <div className="gp-conflicts">
              {conflicts.length === 0 ? (
                <p className="gp-breakdown-empty">当前排期没有检出问题。</p>
              ) : (
                conflicts.map((item) => (
                  <div
                    key={item.id}
                    className={`gp-conflict is-${item.severity === 'blocking' ? 'blocking' : 'warning'}`}
                  >
                    <span className="gp-conflict-sev" aria-hidden="true">
                      !
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                      {item.projectCode && (
                        <button
                          type="button"
                          className="gp-linklike"
                          onClick={() => onNavigate(item.kind === 'pending-feedback-capacity' ? 'feedback' : 'projects')}
                        >
                          {item.kind === 'pending-feedback-capacity' ? '打开反馈中心 →' : '查看项目甘特 →'}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <p className="gp-breakdown-note">
              还会检查：结束早于开始、日期落在非工作日、同资产阶段区间重叠、依赖倒置、缺少制作组或负责人。
              这些属于阻断，出现在录入草案时会禁止确认写入。
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}
