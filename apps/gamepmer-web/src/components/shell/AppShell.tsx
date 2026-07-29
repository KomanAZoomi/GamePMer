import type { ReactNode } from 'react'
import { NAV_ITEMS, type RouteKey } from '../../app/navigation'
import type { DemoState } from '../../domain/model'
import type { SearchHit } from '../../domain/search'
import { GlobalSearch } from './GlobalSearch'

interface AppShellProps {
  route: RouteKey
  onNavigate: (key: RouteKey) => void
  demo: DemoState
  onOpenSearchHit: (hit: SearchHit) => void
  pendingMessages: number
  pendingMails: number
  onResetDemo: () => void
  children: ReactNode
}

export function AppShell({
  route,
  onNavigate,
  demo,
  onOpenSearchHit,
  pendingMessages,
  pendingMails,
  onResetDemo,
  children,
}: AppShellProps) {
  return (
    <div className="gp-shell">
      <aside className="gp-rail">
        <div className="gp-brand">
          GamePMer
          <span>GAME ART PM WORKSPACE</span>
        </div>

        <nav className="gp-nav" aria-label="全局导航">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`gp-nav-item${route === item.key ? ' is-active' : ''}`}
              aria-current={route === item.key ? 'page' : undefined}
              onClick={() => onNavigate(item.key)}
            >
              <span className="gp-nav-label">{item.label}</span>
              {!item.ready && (
                <span className="gp-nav-badge" title={`计划在${item.checkpointLabel}交付`}>
                  {item.checkpoint}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="gp-rail-section">我的工作区</div>
        <div className="gp-workspace-chip">产品美术中心</div>

        <div className="gp-user">
          <span className="gp-avatar" aria-hidden="true">
            PM
          </span>
          <span className="gp-user-meta">
            <strong>Brandon</strong>
            <span>游戏美术 PM</span>
          </span>
        </div>
      </aside>

      <div className="gp-main">
        <header className="gp-topbar">
          <GlobalSearch demo={demo} onOpen={onOpenSearchHit} />
          <div className="gp-top-actions">
            {/* 这两个是计数指示器，不是动作——做成按钮会让人以为点得开 */}
            <span className="gp-counter" title="待分流的客户反馈项">
              待分流 {pendingMessages}
            </span>
            <span className="gp-counter" title="待发出的通知草稿">
              待发通知 {pendingMails}
            </span>
            <button type="button" className="gp-btn gp-btn-quiet" onClick={onResetDemo}>
              恢复示例数据
            </button>
            {/*
              任务是投影出来的，没有「手工新建任务」这回事；
              要凭空加一条，正规入口是候选收件箱的手工录入——确认之后才生成正式记录。
            */}
            <button
              type="button"
              className="gp-btn gp-btn-primary"
              onClick={() => onNavigate('inbox')}
              title="任务由正式业务状态投影生成，不能手工新建；去候选收件箱手工录入一条，确认后自动生成对应待办"
            >
              手工录入
            </button>
          </div>
        </header>

        <main className="gp-content">{children}</main>
      </div>
    </div>
  )
}
