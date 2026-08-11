import { describe, expect, it } from 'vitest'
import { createDemoState } from '../data/seed'
import { DEMO_TODAY } from './clock'
import { weeklyLoad } from './capacity'
import { collectMilestones } from './milestones'
import {
  EMPTY_FILTER,
  countStages,
  filterOptions,
  isFilterActive,
  matchMilestone,
  matchStage,
} from './scheduleFilter'

const state = createDemoState()
const calendar = state.calendars[0]
const mech01Low = state.projects[0].assets[0].stages[2]

describe('matchStage', () => {
  it('空筛选放行全部', () => {
    expect(matchStage(mech01Low, 'NST_A_3D_B24', EMPTY_FILTER)).toBe(true)
  })

  it('按项目筛选', () => {
    expect(matchStage(mech01Low, 'NST_A_3D_B24', { ...EMPTY_FILTER, projectCode: 'NST_A_3D_B24' })).toBe(true)
    expect(matchStage(mech01Low, 'NST_A_3D_B24', { ...EMPTY_FILTER, projectCode: 'HLC_B_2D_B18' })).toBe(false)
  })

  it('按制作组筛选', () => {
    expect(matchStage(mech01Low, 'NST_A_3D_B24', { ...EMPTY_FILTER, groupId: 'grp-3d-a' })).toBe(true)
    expect(matchStage(mech01Low, 'NST_A_3D_B24', { ...EMPTY_FILTER, groupId: 'grp-3d-b' })).toBe(false)
  })

  it('按负责人筛选', () => {
    expect(matchStage(mech01Low, 'NST_A_3D_B24', { ...EMPTY_FILTER, owner: 'Chen' })).toBe(true)
    expect(matchStage(mech01Low, 'NST_A_3D_B24', { ...EMPTY_FILTER, owner: 'Rui' })).toBe(false)
  })

  it('只看有风险时排除无标记的阶段', () => {
    const filter = { ...EMPTY_FILTER, riskOnly: true }
    // 低模带 PossibleDelay
    expect(matchStage(mech01Low, 'NST_A_3D_B24', filter)).toBe(true)
    // 贴图没有任何标记（烘焙被 CQ-004 冻结，带 WaitingChangeQuote）
    expect(matchStage(state.projects[0].assets[0].stages[4], 'NST_A_3D_B24', filter)).toBe(false)
  })

  it('多个条件是与关系', () => {
    const filter = { ...EMPTY_FILTER, groupId: 'grp-3d-a', owner: 'Mei' }
    expect(matchStage(mech01Low, 'NST_A_3D_B24', filter)).toBe(false)
    // 贴图归 Mei
    expect(matchStage(state.projects[0].assets[0].stages[4], 'NST_A_3D_B24', filter)).toBe(true)
  })
})

describe('matchMilestone', () => {
  const milestones = collectMilestones(state, DEMO_TODAY, 14)

  it('按节点类型筛选', () => {
    const kickoffs = milestones.filter((item) =>
      matchMilestone(item, { ...EMPTY_FILTER, milestoneKind: 'kickoff' }),
    )
    expect(kickoffs.length).toBeGreaterThan(0)
    expect(kickoffs.every((item) => item.kind === 'kickoff')).toBe(true)
  })

  it('按项目筛选节点', () => {
    const filtered = milestones.filter((item) =>
      matchMilestone(item, { ...EMPTY_FILTER, projectCode: 'HLC_B_2D_B18' }),
    )
    expect(filtered.every((item) => item.projectCode === 'HLC_B_2D_B18')).toBe(true)
    expect(filtered.length).toBeGreaterThan(0)
  })

  it('只看有风险时保留待处理与受影响的节点', () => {
    const risky = milestones.filter((item) => matchMilestone(item, { ...EMPTY_FILTER, riskOnly: true }))
    expect(risky.every((item) => item.tone !== 'normal')).toBe(true)
    expect(risky.some((item) => item.kind === 'client-feedback')).toBe(true)
  })
})

describe('容量不受筛选影响', () => {
  it('按项目筛选后，制作组本周可用与已排人天保持全量', () => {
    // 这是核心正确性：筛掉 NST_C_3D_B31 不会让 3D-A 组凭空多出空闲
    const full = weeklyLoad(state, 'grp-3d-a', '2026-07-27', calendar)
    expect(full.scheduled).toBe(7)

    const shown = countStages(state, { ...EMPTY_FILTER, projectCode: 'NST_A_3D_B24' })
    expect(shown.shown).toBeLessThan(shown.total)

    // 再算一次，数字不变——容量函数根本不接受筛选参数
    expect(weeklyLoad(state, 'grp-3d-a', '2026-07-27', calendar).scheduled).toBe(7)
  })
})

describe('filterOptions', () => {
  const options = filterOptions(state)

  it('列出全部项目与制作组', () => {
    // 从种子推导而不是写死数字：这里要守的是「一个不漏」，不是「正好 N 个」。
    // 写死的话每加一个示例项目就要来改一次，而改完并不能证明什么。
    expect(options.projects).toHaveLength(state.projects.length)
    expect(options.groups).toHaveLength(state.productionGroups.length)
  })

  it('负责人去重并排序', () => {
    expect(options.owners).toEqual([...new Set(options.owners)].sort())
    expect(options.owners).toContain('Chen')
    expect(options.owners).toContain('Yuki')
  })
})

describe('isFilterActive', () => {
  it('空筛选为未激活', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false)
  })

  it('任一条件生效即为激活', () => {
    expect(isFilterActive({ ...EMPTY_FILTER, riskOnly: true })).toBe(true)
    expect(isFilterActive({ ...EMPTY_FILTER, groupId: 'grp-3d-a' })).toBe(true)
  })
})

describe('countStages', () => {
  it('给出显示数与总数', () => {
    const allStages = state.projects
      .flatMap((project) => project.assets)
      .flatMap((asset) => asset.stages)
    // 无筛选时显示数必须等于总数，且两者都等于种子里真实的阶段条数
    expect(countStages(state, EMPTY_FILTER)).toEqual({
      shown: allStages.length,
      total: allStages.length,
    })
    // 按组筛选后只剩该组的阶段
    expect(countStages(state, { ...EMPTY_FILTER, groupId: 'grp-2d-a' }).shown).toBe(
      allStages.filter((stage) => stage.productionGroupId === 'grp-2d-a').length,
    )
  })
})
