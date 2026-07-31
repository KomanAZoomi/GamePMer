import { describe, expect, it } from 'vitest'

import { createBlankState, createDemoState } from '../data/seed'
import { DEMO_TODAY } from './clock'
import {
  OrgConfigBlocked,
  removeHoliday,
  removePerson,
  removeProductionGroup,
  saveHoliday,
  savePerson,
  saveProductionGroup,
} from './orgConfig'
import type { DemoState } from './model'

const BASE = { actor: 'Brandon', now: `${DEMO_TODAY}T17:00:00+08:00` }

function groups(state: DemoState) {
  return state.productionGroups
}

describe('制作组', () => {
  it('新增一个组，容量与组长都存下来', () => {
    const next = saveProductionGroup(createBlankState(), {
      ...BASE,
      draft: { name: '2D 原画 B 组', discipline: '2D', leadName: '小林', dailyCapacity: 2.5 },
    })
    const created = groups(next).at(-1)!
    expect(created.name).toBe('2D 原画 B 组')
    expect(created.dailyCapacity).toBe(2.5)
    expect(created.id).toBeTruthy()
  })

  it('改一个已有的组只动它自己，别的组不受影响', () => {
    const state = createDemoState()
    const target = groups(state)[0]
    const others = groups(state).slice(1)

    const next = saveProductionGroup(state, {
      ...BASE,
      draft: { ...target, name: '3D 角色 A 组（扩编）', dailyCapacity: 3 },
    })

    expect(groups(next).find((entry) => entry.id === target.id)!.dailyCapacity).toBe(3)
    expect(groups(next).filter((entry) => entry.id !== target.id)).toEqual(others)
  })

  it('组名不能为空，容量必须为正', () => {
    const state = createBlankState()
    expect(() =>
      saveProductionGroup(state, {
        ...BASE,
        draft: { name: '  ', discipline: '3D', leadName: 'X', dailyCapacity: 1 },
      }),
    ).toThrow(OrgConfigBlocked)
    expect(() =>
      saveProductionGroup(state, {
        ...BASE,
        draft: { name: '新组', discipline: '3D', leadName: 'X', dailyCapacity: 0 },
      }),
    ).toThrow(/容量/)
  })

  it('同名的组不允许重复建——排期上会分不清是哪一个', () => {
    const state = createDemoState()
    const existing = groups(state)[0]
    expect(() =>
      saveProductionGroup(state, {
        ...BASE,
        draft: { name: existing.name, discipline: '3D', leadName: 'X', dailyCapacity: 1 },
      }),
    ).toThrow(/已经有/)
  })

  it('还有阶段挂在上面的组不能删，并说清被谁占着', () => {
    const state = createDemoState()
    const used = state.projects
      .flatMap((project) => project.assets)
      .flatMap((asset) => asset.stages)[0].productionGroupId

    expect(() => removeProductionGroup(state, used, BASE)).toThrow(OrgConfigBlocked)
    try {
      removeProductionGroup(state, used, BASE)
    } catch (error) {
      expect((error as OrgConfigBlocked).issues.join('')).toMatch(/个阶段/)
    }
  })

  it('没人用的组可以删', () => {
    let state = saveProductionGroup(createDemoState(), {
      ...BASE,
      draft: { name: '临时外包组', discipline: '2D', leadName: '外包', dailyCapacity: 1 },
    })
    const created = groups(state).at(-1)!
    state = removeProductionGroup(state, created.id, BASE)
    expect(groups(state).some((entry) => entry.id === created.id)).toBe(false)
  })
})

describe('工作日历', () => {
  it('加一个公司休息日，排期计算立刻能看到', () => {
    const next = saveHoliday(createBlankState(), { ...BASE, date: '2026-09-30', kind: 'holiday' })
    expect(next.calendars[0].holidays).toContain('2026-09-30')
  })

  it('加特殊工作日，和休息日分开存', () => {
    const next = saveHoliday(createBlankState(), { ...BASE, date: '2026-10-10', kind: 'extra' })
    expect(next.calendars[0].extraWorkdays).toContain('2026-10-10')
    expect(next.calendars[0].holidays).not.toContain('2026-10-10')
  })

  it('同一天不能既是休息日又是工作日', () => {
    const state = saveHoliday(createBlankState(), { ...BASE, date: '2026-09-30', kind: 'holiday' })
    expect(() => saveHoliday(state, { ...BASE, date: '2026-09-30', kind: 'extra' })).toThrow(
      /已经是/,
    )
  })

  it('重复添加同一天不会加两遍', () => {
    let state = saveHoliday(createBlankState(), { ...BASE, date: '2026-09-30', kind: 'holiday' })
    state = saveHoliday(state, { ...BASE, date: '2026-09-30', kind: 'holiday' })
    expect(state.calendars[0].holidays.filter((day) => day === '2026-09-30')).toHaveLength(1)
  })

  it('日期格式不对直接拒绝，不写进去让排期算出鬼来', () => {
    expect(() =>
      saveHoliday(createBlankState(), { ...BASE, date: '2026/09/30', kind: 'holiday' }),
    ).toThrow(/日期/)
  })

  it('删掉一个休息日', () => {
    let state = saveHoliday(createBlankState(), { ...BASE, date: '2026-09-30', kind: 'holiday' })
    state = removeHoliday(state, { ...BASE, date: '2026-09-30', kind: 'holiday' })
    expect(state.calendars[0].holidays).not.toContain('2026-09-30')
  })
})

describe('成员与角色', () => {
  it('新增成员，多个角色一起存', () => {
    const next = savePerson(createBlankState(), {
      ...BASE,
      draft: { name: '小方', roles: ['组长', 'BD'] },
    })
    const created = next.people.at(-1)!
    expect(created.name).toBe('小方')
    expect(created.roles).toEqual(['组长', 'BD'])
  })

  it('至少要有一个角色——没有角色的人在流程里什么都做不了', () => {
    expect(() =>
      savePerson(createBlankState(), { ...BASE, draft: { name: '小方', roles: [] } }),
    ).toThrow(/角色/)
  })

  it('改角色时保留 id，指向它的报价案件不会断', () => {
    const state = createDemoState()
    const reviewer = state.people.find((entry) => entry.roles.includes('组长'))!
    const next = savePerson(state, {
      ...BASE,
      draft: { ...reviewer, roles: ['组长', 'BD', '艺术总监'] },
    })
    expect(next.people.find((entry) => entry.id === reviewer.id)!.roles).toContain('艺术总监')
    expect(next.quoteCases).toEqual(state.quoteCases)
  })

  it('还挂着未完结报价案件的复核人不能删', () => {
    const state = createDemoState()
    const open = state.quoteCases.find(
      (entry) => entry.status !== 'KickoffSent' && entry.status !== 'NotEngaged',
    )!
    expect(() => removePerson(state, open.reviewerPersonId, BASE)).toThrow(OrgConfigBlocked)
  })

  it('没被引用的成员可以删', () => {
    let state = savePerson(createDemoState(), {
      ...BASE,
      draft: { name: '实习生小陆', roles: ['组长'] },
    })
    const created = state.people.at(-1)!
    state = removePerson(state, created.id, BASE)
    expect(state.people.some((entry) => entry.id === created.id)).toBe(false)
  })
})

describe('每次改动都进审计', () => {
  it('新增制作组、加休息日、改成员各写一条', () => {
    const state = createBlankState()
    const before = state.auditEvents.length

    let next = saveProductionGroup(state, {
      ...BASE,
      draft: { name: '新组', discipline: '3D', leadName: 'X', dailyCapacity: 2 },
    })
    next = saveHoliday(next, { ...BASE, date: '2026-09-30', kind: 'holiday' })
    next = savePerson(next, { ...BASE, draft: { name: '小方', roles: ['BD'] } })

    expect(next.auditEvents.length).toBe(before + 3)
    expect(next.auditEvents.every((entry) => entry.actor === BASE.actor)).toBe(true)
  })
})
