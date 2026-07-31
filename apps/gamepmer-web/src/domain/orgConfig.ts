import type {
  AuditEvent,
  DemoState,
  Person,
  PersonRole,
  ProductionGroup,
  WorkCalendar,
} from './model'

/**
 * 组织配置：制作组、工作日历、成员与角色。
 *
 * 这三样以前只能来自种子数据，设置页是只读的——于是「清空演示数据、录自己的真实业务」
 * 走不通：报价行挑不到自己的制作组，复核找不到自己的人。
 *
 * 两条贯穿始终的规则：
 * 1. **被引用的不许删。** 删掉一个还挂着阶段的制作组，那些阶段就指向一个不存在的组，
 *    容量算不出来、甘特画不出来，而且错误发生在很远的地方。宁可在这里挡住并说清被谁占着。
 * 2. **改动保留 id。** 改名、调容量、加角色都不换 id，指向它的排期与报价案件才不会断。
 */

export class OrgConfigBlocked extends Error {
  constructor(readonly issues: string[]) {
    super(`组织配置无法保存：${issues.join('；')}`)
    this.name = 'OrgConfigBlocked'
  }
}

export interface OrgActor {
  actor: string
  now: string
}

function nextId(existing: string[], prefix: string): string {
  const pattern = new RegExp(`^${prefix}(\\d+)$`)
  const max = existing.reduce((acc, id) => {
    const hit = id.match(pattern)
    return hit ? Math.max(acc, Number(hit[1])) : acc
  }, 0)
  return `${prefix}${max + 1}`
}

function audit(state: DemoState, input: OrgActor, entry: Omit<AuditEvent, 'id' | 'at' | 'actor'>): AuditEvent {
  return {
    id: nextId(state.auditEvents.map((event) => event.id), 'AE-ORG-'),
    at: input.now,
    actor: input.actor,
    ...entry,
  }
}

// ---------------------------------------------------------------- 制作组

export interface ProductionGroupDraft {
  /** 有 id 是改，没有是新增 */
  id?: string
  name: string
  discipline: '2D' | '3D'
  leadName: string
  dailyCapacity: number
}

export interface SaveGroupInput extends OrgActor {
  draft: ProductionGroupDraft
}

/** 这个组被多少个阶段占着。删之前要说得出具体数字，不能只说「被占用」。 */
export function groupUsage(state: DemoState, groupId: string): number {
  return state.projects
    .flatMap((project) => project.assets)
    .flatMap((asset) => asset.stages)
    .filter((stage) => stage.productionGroupId === groupId).length
}

export function saveProductionGroup(state: DemoState, input: SaveGroupInput): DemoState {
  const { draft } = input
  const name = draft.name.trim()
  const issues: string[] = []

  if (!name) issues.push('组名不能为空')
  if (!draft.leadName.trim()) issues.push('组长不能为空')
  if (!(draft.dailyCapacity > 0)) issues.push('每日容量必须大于 0，否则这个组排不进任何活')
  if (
    state.productionGroups.some((entry) => entry.name === name && entry.id !== draft.id)
  ) {
    issues.push(`已经有一个叫「${name}」的制作组了`)
  }
  if (issues.length > 0) throw new OrgConfigBlocked(issues)

  const isNew = !draft.id
  const id = draft.id ?? nextId(state.productionGroups.map((entry) => entry.id), 'grp-')
  const saved: ProductionGroup = {
    id,
    name,
    discipline: draft.discipline,
    leadName: draft.leadName.trim(),
    dailyCapacity: draft.dailyCapacity,
  }
  const before = state.productionGroups.find((entry) => entry.id === id)

  return {
    ...state,
    productionGroups: isNew
      ? [...state.productionGroups, saved]
      : state.productionGroups.map((entry) => (entry.id === id ? saved : entry)),
    auditEvents: [
      ...state.auditEvents,
      audit(state, input, {
        action: isNew ? '新增制作组' : '修改制作组',
        targetKind: 'ProductionGroup',
        targetId: id,
        before: before && `${before.name} · ${before.dailyCapacity} 人天/日`,
        after: `${saved.name} · ${saved.dailyCapacity} 人天/日`,
      }),
    ],
  }
}

export function removeProductionGroup(
  state: DemoState,
  groupId: string,
  input: OrgActor,
): DemoState {
  const group = state.productionGroups.find((entry) => entry.id === groupId)
  if (!group) throw new OrgConfigBlocked([`找不到制作组 ${groupId}`])

  const used = groupUsage(state, groupId)
  if (used > 0) {
    throw new OrgConfigBlocked([
      `「${group.name}」还挂着 ${used} 个阶段，删掉这些阶段就没有制作组了。` +
        `先把它们改到别的组，或者改这个组的名字而不是删它。`,
    ])
  }

  return {
    ...state,
    productionGroups: state.productionGroups.filter((entry) => entry.id !== groupId),
    auditEvents: [
      ...state.auditEvents,
      audit(state, input, {
        action: '删除制作组',
        targetKind: 'ProductionGroup',
        targetId: groupId,
        before: `${group.name} · ${group.dailyCapacity} 人天/日`,
      }),
    ],
  }
}

// ---------------------------------------------------------------- 工作日历

export type CalendarDayKind = 'holiday' | 'extra'

export interface CalendarDayInput extends OrgActor {
  date: string
  kind: CalendarDayKind
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function ensureCalendar(state: DemoState): WorkCalendar {
  return (
    state.calendars[0] ?? {
      id: 'cal-company',
      name: '公司日历',
      holidays: [],
      extraWorkdays: [],
    }
  )
}

/**
 * 加一天。
 *
 * 休息日与特殊工作日**互斥**：同一天不能既放假又上班。
 * 这个冲突如果放过去，`isWorkday` 的结果就取决于两个数组谁先被检查——
 * 那种 bug 只会在跨节假日的排期上冒出来，查起来极痛苦。
 */
export function saveHoliday(state: DemoState, input: CalendarDayInput): DemoState {
  if (!ISO_DAY.test(input.date)) {
    throw new OrgConfigBlocked([`日期要写成 2026-09-30 这种格式，当前是「${input.date}」`])
  }

  const calendar = ensureCalendar(state)
  const other = input.kind === 'holiday' ? calendar.extraWorkdays : calendar.holidays
  if (other.includes(input.date)) {
    throw new OrgConfigBlocked([
      `${input.date} 已经是${input.kind === 'holiday' ? '特殊工作日' : '公司休息日'}了，` +
        `同一天不能既放假又上班——先把原来那条删掉`,
    ])
  }

  const field = input.kind === 'holiday' ? 'holidays' : 'extraWorkdays'
  if (calendar[field].includes(input.date)) return state

  const updated: WorkCalendar = {
    ...calendar,
    [field]: [...calendar[field], input.date].sort(),
  }

  return {
    ...state,
    calendars:
      state.calendars.length > 0
        ? state.calendars.map((entry) => (entry.id === calendar.id ? updated : entry))
        : [updated],
    auditEvents: [
      ...state.auditEvents,
      audit(state, input, {
        action: input.kind === 'holiday' ? '新增公司休息日' : '新增特殊工作日',
        targetKind: 'WorkCalendar',
        targetId: calendar.id,
        after: input.date,
      }),
    ],
  }
}

export function removeHoliday(state: DemoState, input: CalendarDayInput): DemoState {
  const calendar = ensureCalendar(state)
  const field = input.kind === 'holiday' ? 'holidays' : 'extraWorkdays'
  const updated: WorkCalendar = {
    ...calendar,
    [field]: calendar[field].filter((day) => day !== input.date),
  }

  return {
    ...state,
    calendars: state.calendars.map((entry) => (entry.id === calendar.id ? updated : entry)),
    auditEvents: [
      ...state.auditEvents,
      audit(state, input, {
        action: input.kind === 'holiday' ? '删除公司休息日' : '删除特殊工作日',
        targetKind: 'WorkCalendar',
        targetId: calendar.id,
        before: input.date,
      }),
    ],
  }
}

// ---------------------------------------------------------------- 成员与角色

export interface PersonDraft {
  id?: string
  name: string
  roles: PersonRole[]
}

export interface SavePersonInput extends OrgActor {
  draft: PersonDraft
}

/** 这个人现在被哪些还没完结的案件指着。 */
export function personUsage(state: DemoState, personId: string): string[] {
  return state.quoteCases
    .filter(
      (entry) =>
        entry.reviewerPersonId === personId &&
        entry.status !== 'KickoffSent' &&
        entry.status !== 'NotEngaged' &&
        entry.status !== 'Abandoned',
    )
    .map((entry) => entry.id)
}

export function savePerson(state: DemoState, input: SavePersonInput): DemoState {
  const { draft } = input
  const name = draft.name.trim()
  const issues: string[] = []

  if (!name) issues.push('姓名不能为空')
  if (draft.roles.length === 0) issues.push('至少要选一个角色，没有角色的人在流程里什么都做不了')
  if (state.people.some((entry) => entry.name === name && entry.id !== draft.id)) {
    issues.push(`已经有一个叫「${name}」的成员了`)
  }
  if (issues.length > 0) throw new OrgConfigBlocked(issues)

  const isNew = !draft.id
  const id = draft.id ?? nextId(state.people.map((entry) => entry.id), 'p-')
  // 去重：同一个角色勾两次没有意义，也会让「兼几职」的判断出错
  const roles = [...new Set(draft.roles)]
  const saved: Person = { id, name, roles }
  const before = state.people.find((entry) => entry.id === id)

  return {
    ...state,
    people: isNew ? [...state.people, saved] : state.people.map((entry) => (entry.id === id ? saved : entry)),
    auditEvents: [
      ...state.auditEvents,
      audit(state, input, {
        action: isNew ? '新增成员' : '修改成员角色',
        targetKind: 'Person',
        targetId: id,
        before: before && `${before.name} · ${before.roles.join('/')}`,
        after: `${saved.name} · ${saved.roles.join('/')}`,
      }),
    ],
  }
}

export function removePerson(state: DemoState, personId: string, input: OrgActor): DemoState {
  const person = state.people.find((entry) => entry.id === personId)
  if (!person) throw new OrgConfigBlocked([`找不到成员 ${personId}`])

  const used = personUsage(state, personId)
  if (used.length > 0) {
    throw new OrgConfigBlocked([
      `${person.name} 还是 ${used.join('、')} 的复核人，删了这些案件就没人能复核。` +
        `先把复核人改成别人，或者只改角色不删人。`,
    ])
  }

  return {
    ...state,
    people: state.people.filter((entry) => entry.id !== personId),
    auditEvents: [
      ...state.auditEvents,
      audit(state, input, {
        action: '删除成员',
        targetKind: 'Person',
        targetId: personId,
        before: `${person.name} · ${person.roles.join('/')}`,
      }),
    ],
  }
}

export const ALL_ROLES: PersonRole[] = ['PM', '艺术总监', '组长', 'BD', 'IT']
