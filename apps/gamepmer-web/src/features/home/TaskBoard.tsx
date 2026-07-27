import { groupWorkItems, type WorkItem } from '../../domain/workItems'

interface TaskBoardProps {
  items: WorkItem[]
  selectedId?: string
  onSelect: (id: string) => void
}

export function TaskBoard({ items, selectedId, onSelect }: TaskBoardProps) {
  const groups = groupWorkItems(items)

  return (
    <section className="gp-card gp-taskboard" aria-label="任务看板">
      <header className="gp-card-head">
        <h2>任务看板</h2>
        <span className="gp-count">{items.length}</span>
      </header>

      <div className="gp-taskboard-scroll">
        {groups.map(({ group, items: groupItems }) => (
          <div key={group} className="gp-task-group">
            <div className="gp-group-head">
              <span>{group}</span>
              <span>{groupItems.length}</span>
            </div>

            {groupItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`gp-task-row${item.id === selectedId ? ' is-active' : ''}`}
                aria-current={item.id === selectedId ? 'true' : undefined}
                onClick={() => onSelect(item.id)}
              >
                <span className="gp-task-title">
                  <span className="gp-task-code">{item.projectCode}</span>
                  {item.title}
                </span>
                {item.priority === 'high' && <span className="gp-task-priority">高</span>}
                <span className="gp-task-reason">{item.reason}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
