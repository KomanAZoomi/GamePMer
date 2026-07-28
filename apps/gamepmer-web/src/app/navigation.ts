/**
 * 全局导航。
 *
 * 十项全部展开、不折叠、不删减——这是已确认的信息架构决策，长度是被接受的代价。
 * `checkpoint` 说明该模块在哪个检查点交付，占位页据此给出诚实的说明，而不是点了没反应。
 */

export type RouteKey =
  | 'tasks'
  | 'projects'
  | 'inbox'
  | 'schedule'
  | 'feedback'
  | 'quotation'
  | 'closeout'
  | 'files'
  | 'analytics'
  | 'settings'

export interface NavItem {
  key: RouteKey
  label: string
  summary: string
  /** 导航徽章用的短标识，必须短——导航是常驻的，徽章不能挤掉模块名 */
  checkpoint: string
  /** 占位页里的完整说法 */
  checkpointLabel: string
  ready: boolean
}

export const NAV_ITEMS: NavItem[] = [
  {
    key: 'tasks',
    label: '任务管理',
    summary: '每日控制页：从正式业务状态投影出今天最该处理的事项。',
    checkpoint: 'C1',
    checkpointLabel: '当前检查点 C1',
    ready: true,
  },
  {
    key: 'projects',
    label: '项目总览',
    summary: '按客户、类型、负责人、当前阶段和健康度查看项目组合，并进入项目详情甘特。',
    checkpoint: 'C2',
    checkpointLabel: '检查点 C2',
    ready: true,
  },
  {
    key: 'inbox',
    label: '候选收件箱',
    summary: '邮件、企微/飞书转发、截图和文件路径先成为候选记录，未经 PM 确认不改变正式数据。',
    checkpoint: 'C7',
    checkpointLabel: '检查点 C7',
    ready: true,
  },
  {
    key: 'schedule',
    label: '排期管理',
    summary: '跨项目组合排期、制作组周容量、节点清单与计划录入抽屉。',
    checkpoint: 'C3',
    checkpointLabel: '检查点 C3',
    ready: true,
  },
  {
    key: 'feedback',
    label: '反馈中心',
    summary: '客户反馈拆成资产级反馈项，分流为范围内返修或范围外追加报价。',
    checkpoint: 'C4',
    checkpointLabel: '检查点 C4',
    ready: true,
  },
  {
    key: 'quotation',
    label: '报价与变更',
    summary: '首次报价与追加报价的版本、复核和开工门禁。',
    checkpoint: 'C8',
    checkpointLabel: '检查点 C8',
    ready: true,
  },
  {
    key: 'closeout',
    label: '结项中心',
    summary: '最终包、客户确认、IT 回执与 BD 出账的证据门禁。',
    checkpoint: 'C9',
    checkpointLabel: '检查点 C9',
    ready: true,
  },
  {
    key: 'files',
    label: '文件与归档',
    summary: '制作盘、提交盘、反馈盘与备份路径的索引；工作台不移动真实文件。',
    checkpoint: '切片 6',
    checkpointLabel: '本轮之后的切片 6',
    ready: false,
  },
  {
    key: 'analytics',
    label: '智能分析',
    summary: '节点风险、客户等待、制作组负载与人天偏差，每条结论都能下钻到事实。',
    checkpoint: '切片 7',
    checkpointLabel: '本轮之后的切片 7',
    ready: false,
  },
  {
    key: 'settings',
    label: '设置中心',
    summary: '人员角色、制作组、阶段模板、工作日历、连接器与 LLM 供应商预设。',
    checkpoint: '切片 7',
    checkpointLabel: '本轮之后的切片 7',
    ready: false,
  },
]

export const DEFAULT_ROUTE: RouteKey = 'tasks'

export function isRouteKey(value: string): value is RouteKey {
  return NAV_ITEMS.some((item) => item.key === value)
}

export function findNavItem(key: RouteKey): NavItem {
  return NAV_ITEMS.find((item) => item.key === key) ?? NAV_ITEMS[0]
}
