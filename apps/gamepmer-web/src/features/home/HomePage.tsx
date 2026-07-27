import { findAsset } from '../../domain/lookup'
import type { RouteKey } from '../../app/navigation'
import type { HomeView } from '../workspace/workspaceStore'
import type { WorkspaceState } from '../workspace/workspaceStore'
import { HomeTimeline } from './HomeTimeline'
import { SmartDetail } from './SmartDetail'
import { StageDeck } from './StageDeck'
import { TaskBoard } from './TaskBoard'

interface HomePageProps {
  workspace: WorkspaceState
  view: HomeView
  onSelect: (id: string) => void
  onNavigate: (route: RouteKey) => void
}

export function HomePage({ workspace, view, onSelect, onNavigate }: HomePageProps) {
  const { demo, today } = workspace
  const { metrics, items, selected } = view
  const asset = selected?.assetId ? findAsset(demo, selected.assetId) : undefined

  return (
    <div className="gp-home">
      <div className="gp-home-main">
        <header className="gp-page-head">
          <div>
            <h1>任务管理</h1>
            <p>
              {today} · 共 {demo.projects.length} 个在管项目 ·
              待办由项目、资产、阶段和反馈的正式状态投影生成
            </p>
          </div>
          <div className="gp-chip-row">
            <button type="button" className="gp-chip">
              筛选
            </button>
            <button type="button" className="gp-chip">
              排序
            </button>
            <button type="button" className="gp-chip">
              状态
            </button>
          </div>
        </header>

        <div className="gp-metrics">
          <Metric label="今日待办" value={metrics.todo} note="全部来自正式对象" />
          <Metric label="进行中" value={metrics.inProduction} note="已收到开工证据" />
          <Metric label="已完成" value={metrics.approved} note="客户已验收的阶段" />
          <Metric
            label="可能延期"
            value={metrics.possibleDelay}
            note={`已逾期 ${metrics.overdue}`}
            tone="risk"
          />
        </div>

        <div className="gp-work-zone">
          <TaskBoard items={items} selectedId={selected?.id} onSelect={onSelect} />
          <StageDeck
            asset={asset}
            activeStageId={selected?.stageId}
            projectCode={selected?.projectCode}
            onOpenGantt={() => onNavigate('projects')}
          />
        </div>

        <HomeTimeline state={demo} today={today} onOpenSchedule={() => onNavigate('schedule')} />
      </div>

      <aside className="gp-home-side">
        <SmartDetail
          state={demo}
          item={selected}
          onOpenSource={(route) => onNavigate(route as RouteKey)}
        />

        <section className="gp-card gp-activity" aria-label="最新动态">
          <header className="gp-card-head">
            <h2>最新动态</h2>
            <span className="gp-count">{demo.auditEvents.length}</span>
          </header>
          <ul>
            {[...demo.auditEvents]
              .sort((a, b) => b.at.localeCompare(a.at))
              .slice(0, 5)
              .map((event) => (
                <li key={event.id}>
                  <span className="gp-activity-dot" aria-hidden="true" />
                  <span className="gp-activity-text">
                    <strong>{event.action}</strong>
                    <span>
                      {event.targetId} · {event.actor}
                    </span>
                  </span>
                  <time>{event.at.slice(5, 16).replace('T', ' ')}</time>
                </li>
              ))}
          </ul>
        </section>
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
  value: number
  note: string
  tone?: 'risk'
}) {
  return (
    <div className={`gp-card gp-metric${tone === 'risk' ? ' is-risk' : ''}`}>
      <span className="gp-metric-label">{label}</span>
      <strong className="gp-metric-value">{value}</strong>
      <span className="gp-metric-note">{note}</span>
    </div>
  )
}
