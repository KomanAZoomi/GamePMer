import { useMemo, useState } from 'react'
import type { Asset, DemoState, RevisionReason } from '../../domain/model'
import { checkStageRows, type Conflict, type StageRow } from '../../domain/conflicts'
import { buildStageRows, cascadeShift, diffRows, updateRow } from '../../domain/scheduleEntry'
import { weeklyLoad } from '../../domain/capacity'
import { EMPTY_CALENDAR, countWorkdays, startOfWeek } from '../../domain/workCalendar'

interface ScheduleEntryDrawerProps {
  state: DemoState
  asset: Asset
  projectCode: string
  today: string
  onCancel: () => void
  onConfirm: (rows: StageRow[], reason: RevisionReason, note: string) => void
}

const REASONS: { value: RevisionReason; label: string }[] = [
  { value: 'team-delay', label: '团队延期' },
  { value: 'client-wait', label: '客户等待' },
  { value: 'client-feedback', label: '客户反馈' },
  { value: 'scope-change', label: '范围变更' },
  { value: 'capacity-conflict', label: '容量冲突' },
]

export function ScheduleEntryDrawer({
  state,
  asset,
  projectCode,
  today,
  onCancel,
  onConfirm,
}: ScheduleEntryDrawerProps) {
  const calendar = state.calendars[0] ?? EMPTY_CALENDAR
  const [rows, setRows] = useState<StageRow[]>(() => buildStageRows(asset))
  const [reason, setReason] = useState<RevisionReason>('team-delay')
  const [note, setNote] = useState('')

  const conflicts = useMemo(() => checkStageRows(rows, calendar), [rows, calendar])
  const diff = useMemo(() => diffRows(asset, rows, calendar), [asset, rows, calendar])
  const blocking = conflicts.filter((item) => item.severity === 'blocking')
  const warnings = conflicts.filter((item) => item.severity === 'warning')
  const changed = diff.changes.length + diff.attributeChanges.length

  const rowConflicts = (id: string) => conflicts.filter((item) => item.targetId === id)

  // 改动会把哪个组的哪一周推到什么程度——录入时就要看见，不能等确认后才发现超载
  const impact = useMemo(() => {
    const touched = new Set(
      [...diff.changes.map((item) => item.stageId), ...diff.attributeChanges.map((item) => item.stageId)],
    )
    if (touched.size === 0) return []

    const groups = new Set(rows.filter((row) => touched.has(row.id)).map((row) => row.productionGroupId))
    const weekStart = startOfWeek(today)

    return [...groups]
      .filter(Boolean)
      .map((groupId) => {
        const group = state.productionGroups.find((item) => item.id === groupId)
        const before = weeklyLoad(state, groupId, weekStart, calendar)
        const extra = rows
          .filter((row) => touched.has(row.id) && row.productionGroupId === groupId)
          .reduce((total, row) => {
            const workdays = countWorkdays(row.start, row.finish, calendar)
            if (workdays === 0) return total
            const perDay = row.estimatedPersonDays / workdays
            const overlapEnd = row.finish < weeklyEnd(weekStart) ? row.finish : weeklyEnd(weekStart)
            const overlapStart = row.start > weekStart ? row.start : weekStart
            if (overlapStart > overlapEnd) return total
            return total + perDay * countWorkdays(overlapStart, overlapEnd, calendar)
          }, 0)

        const original = rows
          .filter((row) => touched.has(row.id) && row.productionGroupId === groupId)
          .reduce((total, row) => {
            const stage = asset.stages.find((item) => item.id === row.id)
            if (!stage) return total
            const workdays = countWorkdays(stage.currentStart, stage.currentFinish, calendar)
            if (workdays === 0) return total
            const perDay = stage.estimatedPersonDays / workdays
            const overlapEnd =
              stage.currentFinish < weeklyEnd(weekStart) ? stage.currentFinish : weeklyEnd(weekStart)
            const overlapStart = stage.currentStart > weekStart ? stage.currentStart : weekStart
            if (overlapStart > overlapEnd) return total
            return total + perDay * countWorkdays(overlapStart, overlapEnd, calendar)
          }, 0)

        const after = round(before.scheduled - original + extra)
        return {
          groupId,
          name: group?.name ?? groupId,
          available: before.available,
          before: before.scheduled,
          after,
          over: round(Math.max(0, after - before.available)),
        }
      })
      .filter((item) => item.before !== item.after)
  }, [asset, calendar, diff, rows, state, today])

  return (
    <section className="gp-card gp-entry" aria-label="批量录入计划">
      <header className="gp-entry-head">
        <div>
          <h2>
            批量录入计划 · {projectCode} / {asset.id}
          </h2>
          <p>每个资产展开到可验收阶段。草案不写入正式计划，基准日期不会被覆盖。</p>
        </div>
        <button type="button" className="gp-btn" onClick={onCancel}>
          关闭
        </button>
      </header>

      <div className="gp-entry-toolbar">
        <span className="gp-entry-hint">
          {asset.discipline === '3D'
            ? '3D PBR：中模 → 高模 → 低模 → 烘焙 → 贴图 → LOD'
            : '2D：草图 → 细化 50% → 完成稿'}
        </span>
        <button
          type="button"
          className="gp-btn"
          onClick={() => setRows((current) => cascadeShift(current, calendar))}
        >
          顺延后续阶段
        </button>
        <button type="button" className="gp-btn" onClick={() => setRows(buildStageRows(asset))}>
          还原为当前计划
        </button>
        <span className={`gp-entry-state${changed > 0 ? ' is-dirty' : ''}`}>
          {changed > 0 ? `草案有 ${changed} 处改动 · 未写入正式计划` : '草案与当前计划一致'}
        </span>
      </div>

      <div className="gp-entry-scroll">
        <table className="gp-entry-table">
          <thead>
            <tr>
              <th>阶段</th>
              <th>制作组</th>
              <th>人天</th>
              <th>开始</th>
              <th>结束</th>
              <th>工作日</th>
              <th>依赖</th>
              <th>负责人</th>
              <th>校验</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const issues = rowConflicts(row.id)
              const rowBlocking = issues.some((item) => item.severity === 'blocking')
              const rowWarning = !rowBlocking && issues.length > 0
              const workdays = row.finish >= row.start ? countWorkdays(row.start, row.finish, calendar) : 0
              const dependency = rows.find((item) => row.dependsOn.includes(item.id))
              const stage = asset.stages.find((item) => item.id === row.id)
              const locked = stage?.status === 'Approved'

              return (
                <tr
                  key={row.id}
                  className={rowBlocking ? 'is-blocking' : rowWarning ? 'is-warning' : undefined}
                >
                  <td className="gp-entry-stage">{row.stageName}</td>
                  <td>
                    <select
                      className="gp-input"
                      aria-label={`${row.stageName} 制作组`}
                      value={row.productionGroupId}
                      disabled={locked}
                      onChange={(event) =>
                        setRows((current) =>
                          updateRow(current, row.id, { productionGroupId: event.target.value }),
                        )
                      }
                    >
                      {state.productionGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="gp-input gp-input-num"
                      type="number"
                      min={0}
                      step={0.5}
                      aria-label={`${row.stageName} 预估人天`}
                      value={row.estimatedPersonDays}
                      disabled={locked}
                      onChange={(event) =>
                        setRows((current) =>
                          updateRow(current, row.id, { estimatedPersonDays: Number(event.target.value) }),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="gp-input gp-input-date"
                      type="date"
                      aria-label={`${row.stageName} 开始日`}
                      value={row.start}
                      disabled={locked}
                      onChange={(event) =>
                        setRows((current) => updateRow(current, row.id, { start: event.target.value }))
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="gp-input gp-input-date"
                      type="date"
                      aria-label={`${row.stageName} 结束日`}
                      value={row.finish}
                      disabled={locked}
                      onChange={(event) =>
                        setRows((current) => updateRow(current, row.id, { finish: event.target.value }))
                      }
                    />
                  </td>
                  <td className="gp-entry-num">{workdays}</td>
                  <td className="gp-entry-dep">{dependency?.stageName ?? '—'}</td>
                  <td>
                    <input
                      className="gp-input gp-input-owner"
                      aria-label={`${row.stageName} 负责人`}
                      value={row.ownerName}
                      disabled={locked}
                      onChange={(event) =>
                        setRows((current) => updateRow(current, row.id, { ownerName: event.target.value }))
                      }
                    />
                  </td>
                  <td className="gp-entry-check">
                    {locked ? (
                      <span className="gp-flag is-locked">已验收 · 锁定</span>
                    ) : issues.length === 0 ? (
                      <span className="gp-flag is-ok">通过</span>
                    ) : (
                      <span className={`gp-flag ${rowBlocking ? 'is-blocking' : 'is-warning'}`}>
                        {issues[0].title}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {conflicts.length > 0 && (
        <ul className="gp-entry-issues">
          {conflicts.map((item: Conflict) => (
            <li key={item.id} className={item.severity === 'blocking' ? 'is-blocking' : 'is-warning'}>
              <strong>{item.title}</strong>
              {item.detail}
            </li>
          ))}
        </ul>
      )}

      <footer className="gp-entry-foot">
        <div className="gp-entry-summary">
          {impact.length > 0 ? (
            impact.map((item) => (
              <p key={item.groupId}>
                <strong>{item.name}</strong>本周已排 {item.before} → <strong>{item.after}</strong> /{' '}
                {item.available} 人天
                {item.over > 0 && <span className="gp-over">（超 {item.over}）</span>}
              </p>
            ))
          ) : changed > 0 ? (
            <p>本次改动没有改变本周的制作组档期总量（跨周分摊后相互抵消）。</p>
          ) : (
            <p>尚无改动。修改日期、人天或制作组后，这里显示对制作组档期的影响。</p>
          )}
          <p className="gp-entry-gate">
            <span className={blocking.length > 0 ? 'gp-over' : undefined}>{blocking.length} 项阻断</span>
            {' · '}
            <span className={warnings.length > 0 ? 'gp-warn' : undefined}>{warnings.length} 项预警</span>
            {' · '}
            阻断未清空不可确认；确认后生成新修订版本，基准保留。
          </p>
        </div>

        <div className="gp-entry-actions">
          <label className="gp-entry-field">
            <span>修订原因</span>
            <select
              className="gp-input"
              value={reason}
              onChange={(event) => setReason(event.target.value as RevisionReason)}
            >
              {REASONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="gp-entry-field gp-entry-note">
            <span>备注</span>
            <input
              className="gp-input"
              value={note}
              placeholder="说明这次调整的依据"
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <button type="button" className="gp-btn" onClick={onCancel}>
            放弃草案
          </button>
          <button
            type="button"
            className="gp-btn gp-btn-primary"
            disabled={blocking.length > 0 || changed === 0}
            onClick={() => onConfirm(rows, reason, note)}
          >
            {blocking.length > 0 ? '确认写入（被阻断）' : '确认写入'}
          </button>
        </div>
      </footer>
    </section>
  )
}

function weeklyEnd(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 6)
  return date.toISOString().slice(0, 10)
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
