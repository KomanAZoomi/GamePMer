import { activeProjects, findAsset } from '../../domain/lookup'
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
              {demo.projects.length === 0 ? (
                <>
                  {today} · 还没有任何项目 ·
                  待办是正式状态的投影，没有项目就没有待办——先去「报价与变更」立案
                </>
              ) : (
                <>
                  {today} · 共 {activeProjects(demo).length} 个在管项目 ·
                  待办由项目、资产、阶段和反馈的正式状态投影生成
                </>
              )}
            </p>
          </div>
          <div className="gp-chip-row">
            {/* 首页筛选尚未实现。留个能点的空壳比明说还没做更糟，所以禁用并写明去处 */}
            <button
              type="button"
              className="gp-chip"
              disabled
              title="首页筛选尚未实现。排期管理页已有按项目、制作组、负责人和风险筛选，可先在那里用"
            >
              筛选
            </button>
            <button type="button" className="gp-chip" disabled title="排序尚未实现，当前按优先级排列">
              排序
            </button>
            <button type="button" className="gp-chip" disabled title="状态筛选尚未实现">
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

/** 倾斜幅度刻意压得很小：卡片要像被压住的实体，不是会翻转的玩具 */
const TILT_X = 4
const TILT_Y = 6

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
  /*
   * 指针位置只写进 CSS 变量，由样式表决定怎么用——高光位置和微倾斜都在 CSS 里。
   * 这样 JS 不需要拼 transform 字符串，降低动态效果时也只要在 CSS 里关掉即可。
   */
  function trackPointer(event: React.PointerEvent<HTMLDivElement>) {
    const card = event.currentTarget
    const bounds = card.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
    card.style.setProperty('--pointer-x', `${x * 100}%`)
    card.style.setProperty('--pointer-y', `${y * 100}%`)
    card.style.setProperty('--metric-rx', `${(0.5 - y) * TILT_X}deg`)
    card.style.setProperty('--metric-ry', `${(x - 0.5) * TILT_Y}deg`)
  }

  function resetPointer(event: React.PointerEvent<HTMLDivElement>) {
    const card = event.currentTarget
    card.style.removeProperty('--pointer-x')
    card.style.removeProperty('--pointer-y')
    card.style.setProperty('--metric-rx', '0deg')
    card.style.setProperty('--metric-ry', '0deg')
  }

  return (
    <div
      className={`gp-card gp-metric${tone === 'risk' ? ' is-risk' : ''}`}
      onPointerMove={trackPointer}
      onPointerLeave={resetPointer}
    >
      <span className="gp-metric-label">{label}</span>
      <strong className="gp-metric-value">{value}</strong>
      <span className="gp-metric-note">{note}</span>
    </div>
  )
}
