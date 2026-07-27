import type { NavItem } from '../../app/navigation'

/**
 * 未实现模块的占位页。
 *
 * 导航必须点得动——点了没反应比明说「还没做」更糟。
 * 这里如实写出该模块要做什么、在哪个检查点交付，不放假控件、不放空仪表盘。
 */
export function PlaceholderPage({ item }: { item: NavItem }) {
  return (
    <div className="gp-placeholder">
      <div className="gp-card gp-placeholder-card">
        <span className="gp-placeholder-badge">计划在{item.checkpointLabel}交付</span>
        <h1>{item.label}</h1>
        <p>{item.summary}</p>
        <p className="gp-placeholder-note">
          本页尚未实现。当前检查点只交付「任务管理」首页与白色工作台外壳，
          按实施计划逐个检查点推进，每个检查点都会先交真实页面给你验收，再进入下一个。
        </p>
      </div>
    </div>
  )
}
