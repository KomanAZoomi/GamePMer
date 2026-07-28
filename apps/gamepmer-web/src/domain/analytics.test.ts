import { describe, expect, it } from 'vitest'

import { createDemoState } from '../data/seed'
import {
  DELAY_CAUSE_LABEL,
  METRIC_DEFINITION,
  deliveryMetrics,
  delayAttribution,
  estimateAccuracy,
  insights,
  projectHealth,
  stageOutcomes,
} from './analytics'
import { DEMO_TODAY } from './clock'
import type { DemoState } from './model'

const TODAY = DEMO_TODAY

/** 把一个对象树里所有字符串值摊平，用来检查有没有漏出个人维度。 */
function allStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === 'string') acc.push(value)
  else if (Array.isArray(value)) value.forEach((item) => allStrings(item, acc))
  else if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) => allStrings(item, acc))
  }
  return acc
}

/** 种子里出现过的制作人员名字。分析结果里一个都不该有。 */
function personNames(state: DemoState): string[] {
  const owners = state.projects
    .flatMap((p) => p.assets)
    .flatMap((a) => a.stages)
    .map((s) => s.ownerName)
  return [...new Set(owners)]
}

describe('分析只是投影，不产生新数据', () => {
  it('所有分析函数都不改 state', () => {
    const state = createDemoState()
    const before = JSON.stringify(state)

    stageOutcomes(state)
    deliveryMetrics(state, TODAY)
    delayAttribution(state)
    estimateAccuracy(state)
    projectHealth(state, TODAY)
    insights(state, TODAY)

    expect(JSON.stringify(state)).toBe(before)
  })

  it('每个阶段结论都能追回到具体阶段 id', () => {
    const state = createDemoState()
    const outcomes = stageOutcomes(state)
    const stageIds = state.projects
      .flatMap((p) => p.assets)
      .flatMap((a) => a.stages)
      .map((s) => s.id)

    expect(outcomes.length).toBeGreaterThan(0)
    for (const outcome of outcomes) {
      expect(stageIds).toContain(outcome.stageId)
    }
  })

  it('只统计有实际完成日的阶段——没做完的不算按期也不算延期', () => {
    const state = createDemoState()
    const outcomes = stageOutcomes(state)
    const finished = state.projects
      .flatMap((p) => p.assets)
      .flatMap((a) => a.stages)
      .filter((s) => s.actualFinish)

    expect(outcomes).toHaveLength(finished.length)
  })
})

describe('不下钻到个人', () => {
  it('分析输出里不出现任何制作人员姓名', () => {
    const state = createDemoState()
    const names = personNames(state)
    expect(names.length).toBeGreaterThan(0)

    const payload = allStrings({
      outcomes: stageOutcomes(state),
      metrics: deliveryMetrics(state, TODAY),
      attribution: delayAttribution(state),
      accuracy: estimateAccuracy(state),
      health: projectHealth(state, TODAY),
      insights: insights(state, TODAY),
    })

    for (const name of names) {
      expect(payload.some((text) => text.includes(name))).toBe(false)
    }
  })

  it('统计对象只到制作组 / 项目 / 资产 / 阶段', () => {
    const state = createDemoState()
    for (const outcome of stageOutcomes(state)) {
      expect(Object.keys(outcome)).not.toContain('ownerName')
      expect(Object.keys(outcome)).not.toContain('person')
    }
    expect(METRIC_DEFINITION.scope).toContain('不统计')
  })
})

describe('客户等待与团队延期分开算', () => {
  it('四类归因齐全且互不重叠', () => {
    const rows = delayAttribution(createDemoState())
    const causes = rows.map((row) => row.cause)

    expect(new Set(causes).size).toBe(causes.length)
    expect(causes).toEqual(
      expect.arrayContaining(['client-wait', 'rework', 'team-delay', 'dependency']),
    )
    expect(Object.keys(DELAY_CAUSE_LABEL)).toHaveLength(4)
  })

  it('归因占比加起来是 100%（没有延期时全为 0）', () => {
    const rows = delayAttribution(createDemoState())
    const total = rows.reduce((sum, row) => sum + row.share, 0)
    const workdays = rows.reduce((sum, row) => sum + row.workdays, 0)

    if (workdays === 0) expect(total).toBe(0)
    else expect(total).toBeCloseTo(1, 5)
  })

  it('客户等待不计入团队延期占比', () => {
    const state = createDemoState()
    const metrics = deliveryMetrics(state, TODAY)
    const rows = delayAttribution(state)
    const clientWait = rows.find((row) => row.cause === 'client-wait')!
    const teamDelay = rows.find((row) => row.cause === 'team-delay')!

    // 两个数字各算各的，不会因为客户拖了就抬高团队延期
    expect(metrics.clientWaitShare).toBeCloseTo(clientWait.share, 5)
    expect(metrics.teamDelayShare).toBeCloseTo(teamDelay.share, 5)
    expect(metrics.clientWaitShare + metrics.teamDelayShare).toBeLessThanOrEqual(1.00001)
  })

  it('制作延期与客户等待互不相消——一个阶段可以既做晚了、之后又等了客户', () => {
    const state = createDemoState()
    const outcomes = stageOutcomes(state)

    // 种子里 RELAY-01 的高模就是这种：多花了两个工作日，之后又等了客户确认
    const both = outcomes.find(
      (outcome) => outcome.delayWorkdays > 0 && outcome.clientWaitWorkdays > 0,
    )
    expect(both).toBeTruthy()
    // 制作延期发生在提交客户之前，客户还没看到东西，不可能是客户造成的
    expect(both!.cause).toBe('team-delay')

    const rows = delayAttribution(state)
    expect(rows.find((row) => row.cause === 'team-delay')!.workdays).toBeGreaterThan(0)
    expect(rows.find((row) => row.cause === 'client-wait')!.workdays).toBeGreaterThan(0)
  })
})

describe('按期交付率', () => {
  it('实际完成 ≤ 当前计划完成才算按期', () => {
    const state = createDemoState()
    const outcomes = stageOutcomes(state)
    const onTime = outcomes.filter((outcome) => outcome.onTime).length

    expect(deliveryMetrics(state, TODAY).onTimeRate).toBeCloseTo(onTime / outcomes.length, 5)
  })

  it('口径写在常量里，界面与计算用同一份', () => {
    expect(METRIC_DEFINITION.onTimeRate).toContain('当前计划')
    expect(METRIC_DEFINITION.clientWait).toContain('单独')
  })
})

describe('人天预估偏差', () => {
  it('按阶段类型汇总，带样本数——一条样本得不出结论', () => {
    const rows = estimateAccuracy(createDemoState())

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.samples).toBeGreaterThan(0)
      expect(row.estimated).toBeGreaterThan(0)
    }
  })

  it('偏差是实际相对预估的百分比', () => {
    const rows = estimateAccuracy(createDemoState())
    for (const row of rows) {
      expect(row.deltaPct).toBeCloseTo((row.actual - row.estimated) / row.estimated, 5)
    }
  })
})

describe('项目健康度', () => {
  it('每个在管项目一行，归因构成加起来是该项目的全部延期', () => {
    const state = createDemoState()
    const rows = projectHealth(state, TODAY)

    expect(rows).toHaveLength(state.projects.length)
    for (const row of rows) {
      const sum = row.attribution.reduce((acc, entry) => acc + entry.workdays, 0)
      expect(sum).toBeCloseTo(row.delayWorkdays, 5)
    }
  })

  it('变更金额取自已开工的追加报价，与报价页一致', () => {
    const state = createDemoState()
    const main = projectHealth(state, TODAY).find((row) => row.projectCode === 'NST_A_3D_B24')!

    // CQ-004 还没开工，不该计入
    expect(main.changeAmount).toBe(0)
  })
})

describe('AI 洞察', () => {
  it('每条洞察都带依据条数，且标明未执行', () => {
    const rows = insights(createDemoState(), TODAY)

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.evidence).toBeTruthy()
      expect(row.evidenceCount).toBeGreaterThan(0)
      expect(row.executed).toBe(false)
    }
  })

  it('洞察从事实推导，没有事实就不硬凑', () => {
    const empty: DemoState = { ...createDemoState(), projects: [], feedbackBatches: [] }
    expect(insights(empty, TODAY)).toEqual([])
  })
})
