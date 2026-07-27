import type { ReactNode } from 'react'
import { NAV_ITEMS, type RouteKey } from '../../app/navigation'

interface AppShellProps {
  route: RouteKey
  onNavigate: (key: RouteKey) => void
  pendingMessages: number
  pendingMails: number
  onResetDemo: () => void
  children: ReactNode
}

export function AppShell({
  route,
  onNavigate,
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
          <label className="gp-search">
            <span className="gp-visually-hidden">全局搜索</span>
            <input type="search" placeholder="搜索任务、项目、资产、文件路径…" />
          </label>
          <div className="gp-top-actions">
            <button type="button" className="gp-btn gp-btn-quiet">
              消息 {pendingMessages}
            </button>
            <button type="button" className="gp-btn gp-btn-quiet">
              邮件 {pendingMails}
            </button>
            <button type="button" className="gp-btn gp-btn-quiet" onClick={onResetDemo}>
              恢复示例数据
            </button>
            <button type="button" className="gp-btn gp-btn-primary">
              新建任务
            </button>
          </div>
        </header>

        <main className="gp-content">{children}</main>
      </div>
    </div>
  )
}
