import type { RouteKey } from '../../app/navigation'
import { countWorkdays, dateRange, shortDate } from '../../domain/workCalendar'
import { EMPTY_CALENDAR } from '../../domain/workCalendar'
import type { WorkspaceState, WorkspaceStore } from '../workspace/workspaceStore'
import { ProjectGantt } from './ProjectGantt'
import { StageInspector } from './StageInspector'

interface ProjectsPageProps {
  workspace: WorkspaceState
  store: WorkspaceStore
  onNavigate: (route: RouteKey) => void
}

const PROJECT_STATUS_LABELS = {
  InProduction: '制作中',
  AwaitingClient: '等待客户',
  Closing: '结项中',
  Archived: '已归档',
} as const

export function ProjectsPage({ workspace, store, onNavigate }: ProjectsPageProps) {
  const { demo, today, selectedProjectCode, selectedStageId, axisScale } = workspace
  const project = demo.projects.find((item) => item.code === selectedProjectCode) ?? demo.projects[0]
  const calendar = demo.calendars.find((item) => item.id === project.calendarId) ?? EMPTY_CALENDAR

  const stages = project.assets.flatMap((asset) => asset.stages)
  const stage = stages.find((item) => item.id === selectedStageId)

  const approved = stages.filter((item) => item.status === 'Approved').length
  const awaitingClient = stages.filter((item) => item.status === 'AwaitingClient').length
  const reworking = stages.filter((item) => item.flags.includes('Rework')).length
  const possibleDelay = stages.filter((item) => item.flags.includes('PossibleDelay')).length
  const shiftedStages = stages.filter((item) => item.currentStart !== item.baselineStart)
  const maxShift = shiftedStages.reduce(
    (max, item) => Math.max(max, countWorkdays(item.baselineStart, item.currentStart, calendar) - 1),
    0,
  )

  const revisions = demo.revisions.filter((item) => item.projectCode === project.code)
  const activeRevisions = revisions.filter((item) => !item.revokedAt)

  return (
    <div className="gp-project-page">
      {/* 项目切换放在页头而不是左侧列表：甘特需要横向空间，
          一列常驻的项目列表会把时间轴压到读不出节点的宽度 */}
      <nav className="gp-project-switch" aria-label="项目组合">
        {demo.projects.map((item) => {
          const itemStages = item.assets.flatMap((asset) => asset.stages)
          const done = itemStages.filter((entry) => entry.status === 'Approved').length
          const risk = itemStages.some(
            (entry) => entry.flags.includes('Rework') || entry.flags.includes('PossibleDelay'),
          )
          return (
            <button
              key={item.code}
              type="button"
              className={`gp-project-tab${item.code === project.code ? ' is-active' : ''}`}
              aria-current={item.code === project.code ? 'true' : undefined}
              onClick={() => store.selectProject(item.code)}
            >
              <span className="gp-project-tab-head">
                <span className={`gp-discipline is-${item.discipline.toLowerCase()}`}>
                  {item.discipline}
                </span>
                <strong>{item.code}</strong>
                {risk && <em className="gp-project-risk">风险</em>}
              </span>
              <span className="gp-project-tab-name">{item.name}</span>
              <span className="gp-project-tab-meta">
                {PROJECT_STATUS_LABELS[item.status]} · {done}/{itemStages.length} 已验收
              </span>
            </button>
          )
        })}
      </nav>

      <div className="gp-project-main">
        <header className="gp-page-head">
          <div>
            <h1>
              {project.code} · {project.name}
            </h1>
            <p>
              客户 {project.client} · 艺术总监 {project.artDirectorName} · PM {project.pmName} ·
              {' '}
              {PROJECT_STATUS_LABELS[project.status]} · {project.assets.length} 个资产 /{' '}
              {stages.length} 个阶段
            </p>
          </div>
          <div className="gp-chip-row">
            <button type="button" className="gp-chip" onClick={() => onNavigate('schedule')}>
              排期管理
            </button>
            <button type="button" className="gp-chip" onClick={() => onNavigate('feedback')}>
              反馈中心
            </button>
          </div>
        </header>

        <div className="gp-metrics gp-metrics-5">
          <Metric label="阶段已验收" value={`${approved}/${stages.length}`} note="客户确认为准" />
          <Metric label="等待客户" value={awaitingClient} note="已提交未验收" />
          <Metric label="返修中" value={reworking} note="客户反馈引起" tone={reworking > 0 ? 'amber' : undefined} />
          <Metric
            label="可能延期"
            value={possibleDelay}
            note="缺开工或完成证据"
            tone={possibleDelay > 0 ? 'amber' : undefined}
          />
          <Metric
            label="相对基准"
            value={maxShift > 0 ? `+${maxShift}` : '0'}
            note={`工作日 · ${shiftedStages.length} 个阶段已修订 · ${activeRevisions.length} 个生效修订`}
          />
        </div>

        <ProjectGantt
          state={demo}
          project={project}
          today={today}
          scale={axisScale}
          selectedStageId={selectedStageId}
          draft={workspace.draft?.projectCode === project.code ? workspace.draft : undefined}
          onSelectStage={store.selectStage}
          onScaleChange={store.setAxisScale}
        />

        <section className="gp-card gp-revisions" aria-label="排期修订历史">
          <header className="gp-card-head">
            <h2>
              排期修订历史
              <span className="gp-deck-sub">基准不可覆盖，每次确认生成新版本</span>
            </h2>
            <span className="gp-count">{revisions.length}</span>
          </header>
          {revisions.length === 0 ? (
            <p className="gp-revision-empty">
              本项目尚无已确认的排期修订。客户反馈引起的重排在反馈中心生成草案，PM 确认后才写入这里。
            </p>
          ) : (
            <ol className="gp-revision-list">
              {revisions.map((revision) => (
                <li key={revision.id} className={revision.revokedAt ? 'is-revoked' : undefined}>
                  <span className="gp-revision-version">v{revision.version}</span>
                  <span className="gp-revision-body">
                    <strong>{revision.note}</strong>
                    {revision.revokedAt && (
                      <span className="gp-revision-revoked">
                        已于 {revision.revokedAt.slice(0, 10)} 由 {revision.revokedBy} 撤销 ·{' '}
                        {revision.revokedReason}
                      </span>
                    )}
                    <span>
                      {revision.changes
                        .map(
                          (change) =>
                            `${change.stageId.split('/')[1]}：${dateRange(change.oldStart, change.oldFinish)} → ${dateRange(change.newStart, change.newFinish)}（+${change.shiftedWorkdays} 工作日）`,
                        )
                        .join('；')}
                    </span>
                  </span>
                  <time>
                    {shortDate(revision.confirmedAt.slice(0, 10))} · {revision.confirmedBy}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <aside className="gp-project-side">
        <StageInspector
          state={demo}
          project={project}
          stage={stage}
          today={today}
          onOpenFeedback={() => onNavigate('feedback')}
          onAdvance={store.advanceStage}
          onOpenTriage={() => onNavigate('feedback')}
          onOpenQuote={(caseId) => {
            store.selectQuoteCase(caseId)
            onNavigate('quotation')
          }}
          onSelectStage={store.selectStage}
        />
      </aside>
    </div>
  )
}

function Metric({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string | number
  note: string
  tone?: 'amber'
}) {
  return (
    <div className={`gp-card gp-metric${tone === 'amber' ? ' is-risk' : ''}`}>
      <span className="gp-metric-label">{label}</span>
      <strong className="gp-metric-value">{value}</strong>
      <span className="gp-metric-note">{note}</span>
    </div>
  )
}
