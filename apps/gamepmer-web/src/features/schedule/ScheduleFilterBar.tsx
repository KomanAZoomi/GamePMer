import { MILESTONE_LABELS, type MilestoneKind } from '../../domain/milestones'
import {
  EMPTY_FILTER,
  isFilterActive,
  type FilterOptions,
  type ScheduleFilter,
} from '../../domain/scheduleFilter'

interface ScheduleFilterBarProps {
  filter: ScheduleFilter
  options: FilterOptions
  /** 节点类型只在节点清单视图有意义 */
  showMilestoneKind: boolean
  shown: number
  total: number
  unit: string
  onChange: (filter: ScheduleFilter) => void
}

const MILESTONE_KINDS = Object.keys(MILESTONE_LABELS) as MilestoneKind[]

export function ScheduleFilterBar({
  filter,
  options,
  showMilestoneKind,
  shown,
  total,
  unit,
  onChange,
}: ScheduleFilterBarProps) {
  const active = isFilterActive(filter)

  return (
    <div className="gp-filterbar" role="search" aria-label="排期筛选">
      <span className="gp-filterbar-label">筛选</span>

      <label className="gp-filter-field">
        <span className="gp-visually-hidden">项目</span>
        <select
          className="gp-input"
          aria-label="按项目筛选"
          value={filter.projectCode}
          onChange={(event) => onChange({ ...filter, projectCode: event.target.value })}
        >
          <option value="">全部项目</option>
          {options.projects.map((project) => (
            <option key={project.code} value={project.code}>
              {project.code} · {project.name}
            </option>
          ))}
        </select>
      </label>

      <label className="gp-filter-field">
        <span className="gp-visually-hidden">制作组</span>
        <select
          className="gp-input"
          aria-label="按制作组筛选"
          value={filter.groupId}
          onChange={(event) => onChange({ ...filter, groupId: event.target.value })}
        >
          <option value="">全部制作组</option>
          {options.groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>

      <label className="gp-filter-field">
        <span className="gp-visually-hidden">负责人</span>
        <select
          className="gp-input"
          aria-label="按负责人筛选"
          value={filter.owner}
          onChange={(event) => onChange({ ...filter, owner: event.target.value })}
        >
          <option value="">全部负责人</option>
          {options.owners.map((owner) => (
            <option key={owner} value={owner}>
              {owner}
            </option>
          ))}
        </select>
      </label>

      {showMilestoneKind && (
        <label className="gp-filter-field">
          <span className="gp-visually-hidden">节点类型</span>
          <select
            className="gp-input"
            aria-label="按节点类型筛选"
            value={filter.milestoneKind}
            onChange={(event) =>
              onChange({ ...filter, milestoneKind: event.target.value as MilestoneKind | '' })
            }
          >
            <option value="">全部类型</option>
            {MILESTONE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {MILESTONE_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="gp-filter-check">
        <input
          type="checkbox"
          checked={filter.riskOnly}
          onChange={(event) => onChange({ ...filter, riskOnly: event.target.checked })}
        />
        只看有风险
      </label>

      <span className="gp-filter-count">
        显示 {shown} / {total} {unit}
      </span>

      {active && (
        <button type="button" className="gp-btn" onClick={() => onChange(EMPTY_FILTER)}>
          清除筛选
        </button>
      )}
    </div>
  )
}
