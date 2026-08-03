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
  /** 跳过去的同时把录入面板打开——否则这个入口等于只换了个页 */
  onStartQuoteEntry: () => void
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
  onStartQuoteEntry,
  children,
}: AppShellProps) {
  return (
    <div className="gp-shell">
      <aside className="gp-rail">
        <div className="gp-brand">
          GamePMer
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

        {/*
          「我的工作区」是分区标签，不是第 11 条导航。
          原来它和上面十条同为一列纯文本，扫下来会当成又一个模块。
        */}
        <div className="gp-rail-group">
          <div className="gp-rail-section">我的工作区</div>
          <div className="gp-workspace-chip">产品美术中心</div>
        </div>

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
              顶栏这个位置只放一个动作，它必须指向业务的真实起点。
              整条链路是从**需求**开始的：BD 谈下来一条新活或一笔追加，先立案再报价。
              原来这里写「手工录入」并跳去候选收件箱，看不出是在录什么——
              收件箱是「外部消息进来」的入口，不是「新活来了」的入口。
            */}
            <button
              type="button"
              className="gp-btn gp-btn-primary"
              onClick={() => {
                onStartQuoteEntry()
                onNavigate('quotation')
              }}
              title="BD 新需求或追加报价从这里立案，交总监出人天与节点"
            >
              新增需求
            </button>
          </div>
        </header>

        <main className="gp-content">{children}</main>
      </div>
    </div>
  )
}
