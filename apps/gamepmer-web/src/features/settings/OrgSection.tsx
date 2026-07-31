import { useState } from 'react'
import {
  ALL_ROLES,
  OrgConfigBlocked,
  groupUsage,
  personUsage,
  type PersonDraft,
  type ProductionGroupDraft,
} from '../../domain/orgConfig'
import type { DemoState } from '../../domain/model'
import type { WorkspaceStore } from '../workspace/workspaceStore'

interface OrgSectionProps {
  demo: DemoState
  store: WorkspaceStore
}

const EMPTY_GROUP: ProductionGroupDraft = {
  name: '',
  discipline: '3D',
  leadName: '',
  dailyCapacity: 1,
}

const EMPTY_PERSON: PersonDraft = { name: '', roles: [] }

/**
 * 组织配置的编辑界面。
 *
 * 这三样以前只能来自种子数据，于是「清空演示数据、录自己的业务」走不通——
 * 报价行挑不到自己的制作组，复核找不到自己的人。
 *
 * 删除一律走领域层的门禁：被阶段占着的组、还在复核未完结案件的人都删不掉，
 * 而且要说清被谁占着。界面不自己判断，也不吞掉领域层抛出的理由。
 */
export function OrgSection({ demo, store }: OrgSectionProps) {
  const [groupDraft, setGroupDraft] = useState<ProductionGroupDraft>(EMPTY_GROUP)
  const [personDraft, setPersonDraft] = useState<PersonDraft>(EMPTY_PERSON)
  const [dayDraft, setDayDraft] = useState({ date: '', kind: 'holiday' as 'holiday' | 'extra' })
  const [error, setError] = useState<string | undefined>()

  /** 领域层抛的理由原样显示。静默失败比报错更糟——人会以为存进去了。 */
  function run(action: () => void) {
    try {
      action()
      setError(undefined)
    } catch (thrown) {
      setError(
        thrown instanceof OrgConfigBlocked ? thrown.issues.join('；') : String(thrown),
      )
    }
  }

  const calendar = demo.calendars[0]

  return (
    <>
      <header className="gp-card-head">
        <h2>
          组织配置
          <small>制作组、工作日历、成员与角色——录自己的业务之前先把这三样换成你们的</small>
        </h2>
      </header>

      {error && (
        <div className="gp-org-error" role="alert">
          {error}
        </div>
      )}

      {/* ---------------------------------------------------------- 制作组 */}
      <div className="gp-org-block">
        <h3>
          制作组 <span className="gp-count">{demo.productionGroups.length}</span>
        </h3>
        <p className="gp-settings-note">
          容量是<strong>跨项目共享资源</strong>，不挂在任何单个项目下。
          排期页的筛选只影响显示，不影响这里的数字。
        </p>
        <table className="gp-org-table" aria-label="制作组">
          <thead>
            <tr>
              <th>组名</th>
              <th>类型</th>
              <th>组长</th>
              <th>人天/工作日</th>
              <th>占用</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {demo.productionGroups.map((group) => {
              const used = groupUsage(demo, group.id)
              return (
                <tr key={group.id}>
                  <td>
                    <input
                      className="gp-input"
                      aria-label={`${group.name} 组名`}
                      defaultValue={group.name}
                      onBlur={(event) =>
                        event.target.value.trim() !== group.name &&
                        run(() =>
                          store.saveProductionGroup({ ...group, name: event.target.value }),
                        )
                      }
                    />
                  </td>
                  <td>
                    <select
                      className="gp-input"
                      aria-label={`${group.name} 类型`}
                      value={group.discipline}
                      onChange={(event) =>
                        run(() =>
                          store.saveProductionGroup({
                            ...group,
                            discipline: event.target.value as '2D' | '3D',
                          }),
                        )
                      }
                    >
                      <option value="2D">2D</option>
                      <option value="3D">3D</option>
                    </select>
                  </td>
                  <td>
                    <input
                      className="gp-input"
                      aria-label={`${group.name} 组长`}
                      defaultValue={group.leadName}
                      onBlur={(event) =>
                        event.target.value.trim() !== group.leadName &&
                        run(() =>
                          store.saveProductionGroup({ ...group, leadName: event.target.value }),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="gp-input gp-input-num"
                      type="number"
                      step="0.5"
                      min="0.5"
                      aria-label={`${group.name} 容量`}
                      defaultValue={group.dailyCapacity}
                      onBlur={(event) =>
                        Number(event.target.value) !== group.dailyCapacity &&
                        run(() =>
                          store.saveProductionGroup({
                            ...group,
                            dailyCapacity: Number(event.target.value),
                          }),
                        )
                      }
                    />
                  </td>
                  <td className="gp-org-usage">{used > 0 ? `${used} 个阶段` : '未使用'}</td>
                  <td>
                    <button
                      type="button"
                      className="gp-btn gp-btn-sm"
                      disabled={used > 0}
                      title={used > 0 ? `还挂着 ${used} 个阶段，先改到别的组` : '删除这个组'}
                      onClick={() => run(() => store.removeProductionGroup(group.id))}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="gp-org-add">
          <input
            className="gp-input"
            aria-label="新制作组名"
            placeholder="组名，例如 2D 原画 A 组"
            value={groupDraft.name}
            onChange={(event) => setGroupDraft({ ...groupDraft, name: event.target.value })}
          />
          <select
            className="gp-input"
            aria-label="新制作组类型"
            value={groupDraft.discipline}
            onChange={(event) =>
              setGroupDraft({ ...groupDraft, discipline: event.target.value as '2D' | '3D' })
            }
          >
            <option value="2D">2D</option>
            <option value="3D">3D</option>
          </select>
          <input
            className="gp-input"
            aria-label="新制作组组长"
            placeholder="组长"
            value={groupDraft.leadName}
            onChange={(event) => setGroupDraft({ ...groupDraft, leadName: event.target.value })}
          />
          <input
            className="gp-input gp-input-num"
            type="number"
            step="0.5"
            min="0.5"
            aria-label="新制作组容量"
            value={groupDraft.dailyCapacity}
            onChange={(event) =>
              setGroupDraft({ ...groupDraft, dailyCapacity: Number(event.target.value) })
            }
          />
          <button
            type="button"
            className="gp-btn gp-btn-primary"
            onClick={() =>
              run(() => {
                store.saveProductionGroup(groupDraft)
                setGroupDraft(EMPTY_GROUP)
              })
            }
          >
            新增制作组
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------- 工作日历 */}
      <div className="gp-org-block">
        <h3>工作日历 · {calendar?.name ?? '公司日历'}</h3>
        <p className="gp-settings-note">
          排期只按工作日推。公司休息日即使是周一到周五也不上班；
          特殊工作日即使是周末也上班。<strong>同一天只能是其中一种。</strong>
        </p>

        <div className="gp-day-cols">
          <div>
            <h4>公司休息日 {calendar?.holidays.length ?? 0}</h4>
            <ul className="gp-day-list" aria-label="公司休息日">
              {(calendar?.holidays ?? []).map((day) => (
                <li key={day}>
                  {day}
                  <button
                    type="button"
                    className="gp-btn gp-btn-sm"
                    aria-label={`删除休息日 ${day}`}
                    onClick={() => run(() => store.removeCalendarDay(day, 'holiday'))}
                  >
                    删除
                  </button>
                </li>
              ))}
              {(calendar?.holidays.length ?? 0) === 0 && <li className="gp-settings-muted">暂无</li>}
            </ul>
          </div>
          <div>
            <h4>特殊工作日 {calendar?.extraWorkdays.length ?? 0}</h4>
            <ul className="gp-day-list" aria-label="特殊工作日">
              {(calendar?.extraWorkdays ?? []).map((day) => (
                <li key={day}>
                  {day}
                  <button
                    type="button"
                    className="gp-btn gp-btn-sm"
                    aria-label={`删除特殊工作日 ${day}`}
                    onClick={() => run(() => store.removeCalendarDay(day, 'extra'))}
                  >
                    删除
                  </button>
                </li>
              ))}
              {(calendar?.extraWorkdays.length ?? 0) === 0 && (
                <li className="gp-settings-muted">暂无</li>
              )}
            </ul>
          </div>
        </div>

        <div className="gp-org-add">
          <input
            className="gp-input"
            type="date"
            aria-label="新增日期"
            value={dayDraft.date}
            onChange={(event) => setDayDraft({ ...dayDraft, date: event.target.value })}
          />
          <select
            className="gp-input"
            aria-label="日期类型"
            value={dayDraft.kind}
            onChange={(event) =>
              setDayDraft({ ...dayDraft, kind: event.target.value as 'holiday' | 'extra' })
            }
          >
            <option value="holiday">公司休息日</option>
            <option value="extra">特殊工作日</option>
          </select>
          <button
            type="button"
            className="gp-btn gp-btn-primary"
            disabled={!dayDraft.date}
            onClick={() =>
              run(() => {
                store.saveCalendarDay(dayDraft.date, dayDraft.kind)
                setDayDraft({ date: '', kind: dayDraft.kind })
              })
            }
          >
            加入日历
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------- 成员与角色 */}
      <div className="gp-org-block">
        <h3>
          成员与角色 <span className="gp-count">{demo.people.length}</span>
        </h3>
        <p className="gp-settings-note">
          一个人可以兼多职。<strong>组长兼 BD 时报价只需确认一次</strong>，
          但审计里两个角色都会记下来。
        </p>
        <table className="gp-org-table" aria-label="成员">
          <thead>
            <tr>
              <th>姓名</th>
              <th>角色（可多选）</th>
              <th>占用</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {demo.people.map((person) => {
              const used = personUsage(demo, person.id)
              return (
                <tr key={person.id}>
                  <td>
                    <input
                      className="gp-input"
                      aria-label={`${person.name} 姓名`}
                      defaultValue={person.name}
                      onBlur={(event) =>
                        event.target.value.trim() !== person.name &&
                        run(() => store.savePerson({ ...person, name: event.target.value }))
                      }
                    />
                  </td>
                  <td className="gp-role-picks">
                    {ALL_ROLES.map((role) => (
                      <label key={role}>
                        <input
                          type="checkbox"
                          checked={person.roles.includes(role)}
                          aria-label={`${person.name} ${role}`}
                          onChange={(event) =>
                            run(() =>
                              store.savePerson({
                                ...person,
                                roles: event.target.checked
                                  ? [...person.roles, role]
                                  : person.roles.filter((entry) => entry !== role),
                              }),
                            )
                          }
                        />
                        {role}
                      </label>
                    ))}
                  </td>
                  <td className="gp-org-usage">
                    {used.length > 0 ? `复核 ${used.join('、')}` : '未使用'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="gp-btn gp-btn-sm"
                      disabled={used.length > 0}
                      title={
                        used.length > 0
                          ? `还是 ${used.join('、')} 的复核人，先换人`
                          : '删除这个成员'
                      }
                      onClick={() => run(() => store.removePerson(person.id))}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="gp-org-add">
          <input
            className="gp-input"
            aria-label="新成员姓名"
            placeholder="姓名"
            value={personDraft.name}
            onChange={(event) => setPersonDraft({ ...personDraft, name: event.target.value })}
          />
          <div className="gp-role-picks">
            {ALL_ROLES.map((role) => (
              <label key={role}>
                <input
                  type="checkbox"
                  aria-label={`新成员 ${role}`}
                  checked={personDraft.roles.includes(role)}
                  onChange={(event) =>
                    setPersonDraft({
                      ...personDraft,
                      roles: event.target.checked
                        ? [...personDraft.roles, role]
                        : personDraft.roles.filter((entry) => entry !== role),
                    })
                  }
                />
                {role}
              </label>
            ))}
          </div>
          <button
            type="button"
            className="gp-btn gp-btn-primary"
            onClick={() =>
              run(() => {
                store.savePerson(personDraft)
                setPersonDraft(EMPTY_PERSON)
              })
            }
          >
            新增成员
          </button>
        </div>
      </div>
    </>
  )
}
