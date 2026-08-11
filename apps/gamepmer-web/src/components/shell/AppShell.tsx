import type { ReactNode } from 'react'
import { NAV_ITEMS, type RouteKey } from '../../app/navigation'
import type { DemoState } from '../../domain/model'
import type { SearchHit } from '../../domain/search'
import { THEME_LABELS, nextTheme, themeIcon, themeLabel } from '../../domain/theme'
import type { Appearance } from '../../features/appearance/useAppearance'
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
  appearance: Appearance
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
  appearance,
  children,
}: AppShellProps) {
  return (
    <div className="gp-shell">
      {/*
        键盘用户第一次 Tab 就能跳过十项导航直达主内容。
        平时隐藏，聚焦时才浮出来——这是无障碍的标准做法，不是装饰。
      */}
      <a className="gp-skip-link" href="#gp-main-content">
        跳到主内容
      </a>
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
              主题切换。三态循环：跟随系统 → 亮色 → 暗色。
              图标三态各不相同，不靠颜色单独表意；标签在 system 下额外说明
              当前实际落在哪一种，否则「跟随系统」四个字看不出现在是亮还是暗。
            */}
            <button
              type="button"
              className="gp-theme-toggle"
              onClick={appearance.cycleTheme}
              aria-label={`切换显示主题，当前${themeLabel(appearance.theme, appearance.resolvedTheme)}`}
              title={`${themeLabel(appearance.theme, appearance.resolvedTheme)} · 点击切换为${
                THEME_LABELS[nextTheme(appearance.theme)]
              }`}
            >
              <span className="gp-theme-toggle-icon" aria-hidden="true">
                {themeIcon(appearance.theme)}
              </span>
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

        <main className="gp-content" id="gp-main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}
