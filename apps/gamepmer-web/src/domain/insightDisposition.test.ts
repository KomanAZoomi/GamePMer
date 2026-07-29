import { describe, expect, it } from 'vitest'

import { createDemoState } from '../data/seed'
import { INSIGHT_KIND_NOTE, dispositionOf, insights } from './analytics'
import { InsightBlocked, disposeInsight } from './insightDisposition'
import type { DemoState } from './model'

const TODAY = '2026-07-27'
const ACTOR = 'Brandon'

function findingId(state: DemoState): string {
  const row = insights(state, TODAY).find((entry) => entry.kind === 'finding')
  if (!row) throw new Error('种子数据里应当至少有一条结论型洞察')
  return row.id
}

function blockerId(state: DemoState): string {
  const row = insights(state, TODAY).find((entry) => entry.kind === 'blocker')
  if (!row) throw new Error('种子数据里应当至少有一条卡点型洞察')
  return row.id
}

describe('洞察分两类', () => {
  /**
   * 用户问的就是这个：建议会不会随项目流转消失。
   * 答案取决于类型，所以类型必须是显式字段，不能靠人去记哪条是哪条。
   */
  it('每条洞察都声明自己是卡点型还是结论型', () => {
    const rows = insights(createDemoState(), TODAY)

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(['blocker', 'finding']).toContain(row.kind)
      expect(INSIGHT_KIND_NOTE[row.kind]).toBeTruthy()
    }
    expect(rows.some((row) => row.kind === 'blocker')).toBe(true)
    expect(rows.some((row) => row.kind === 'finding')).toBe(true)
  })

  it('卡点型盯的是当下还卡着的事实，事实清掉它自己就没了', () => {
    const state = createDemoState()
    expect(insights(state, TODAY).some((row) => row.id === 'feedback-triage')).toBe(true)

    // 把所有反馈项分流掉——不动洞察的任何代码
    const cleared: DemoState = {
      ...state,
      feedbackBatches: state.feedbackBatches.map((batch) => ({
        ...batch,
        items: batch.items.map((item) =>
          item.status === 'NeedsClassification' ? { ...item, status: 'Confirmed' as const } : item,
        ),
      })),
    }

    expect(insights(cleared, TODAY).some((row) => row.id === 'feedback-triage')).toBe(false)
  })
})

describe('结论型洞察的处置', () => {
  it('采纳后留痕，卡片上能看到上次处置', () => {
    const state = createDemoState()
    const id = findingId(state)

    const next = disposeInsight(state, {
      insightId: id,
      verdict: 'adopted',
      actor: ACTOR,
      now: TODAY,
    })

    const disposition = dispositionOf(next, id)
    expect(disposition?.verdict).toBe('adopted')
    expect(disposition?.at).toBe(TODAY)
    expect(disposition?.actor).toBe(ACTOR)
  })

  /**
   * 「暂不采纳」必须写理由。半年后同一条结论又冒出来，
   * 没人记得上次为什么否了——这条洞察就白提了。
   */
  it('暂不采纳必须写理由，不写直接阻断且不留任何副作用', () => {
    const state = createDemoState()
    const id = findingId(state)

    expect(() =>
      disposeInsight(state, { insightId: id, verdict: 'deferred', reason: '  ', actor: ACTOR, now: TODAY }),
    ).toThrow(InsightBlocked)

    try {
      disposeInsight(state, { insightId: id, verdict: 'deferred', actor: ACTOR, now: TODAY })
    } catch {
      /* 忽略 */
    }
    expect(state.insightDispositions).toHaveLength(0)
    expect(dispositionOf(state, id)).toBeUndefined()
  })

  it('采纳不需要理由——「我会去做」不用解释，「我不做」才要', () => {
    const state = createDemoState()
    expect(() =>
      disposeInsight(state, { insightId: findingId(state), verdict: 'adopted', actor: ACTOR, now: TODAY }),
    ).not.toThrow()
  })

  it('卡点型不接受处置：它不是决策建议，办完了自己会走', () => {
    const state = createDemoState()

    expect(() =>
      disposeInsight(state, { insightId: blockerId(state), verdict: 'adopted', actor: ACTOR, now: TODAY }),
    ).toThrow(InsightBlocked)
    expect(state.insightDispositions).toHaveLength(0)
  })

  it('不存在的洞察不能处置', () => {
    const state = createDemoState()
    expect(() =>
      disposeInsight(state, { insightId: 'no-such-insight', verdict: 'adopted', actor: ACTOR, now: TODAY }),
    ).toThrow(InsightBlocked)
  })

  it('可以改主意：保留全部历史，界面读最新一条', () => {
    const state = createDemoState()
    const id = findingId(state)

    const once = disposeInsight(state, {
      insightId: id,
      verdict: 'deferred',
      reason: '本季度报价已经报出去了，改模板要等下一批',
      actor: ACTOR,
      now: '2026-07-27',
    })
    const twice = disposeInsight(once, {
      insightId: id,
      verdict: 'adopted',
      actor: ACTOR,
      now: '2026-07-28',
    })

    expect(twice.insightDispositions.filter((entry) => entry.insightId === id)).toHaveLength(2)
    expect(dispositionOf(twice, id)?.verdict).toBe('adopted')
    expect(dispositionOf(twice, id)?.at).toBe('2026-07-28')
  })

  it('处置写审计，理由原样进审计', () => {
    const state = createDemoState()
    const id = findingId(state)
    const reason = '本季度报价已经报出去了，改模板要等下一批'

    const next = disposeInsight(state, {
      insightId: id,
      verdict: 'deferred',
      reason,
      actor: ACTOR,
      now: TODAY,
    })

    const audit = next.auditEvents.at(-1)!
    expect(audit.targetKind).toBe('Insight')
    expect(audit.targetId).toBe(id)
    expect(audit.actor).toBe(ACTOR)
    expect(audit.reason).toBe(reason)
  })

  /**
   * 处置只是记录 PM 的态度。**采纳不等于工作台替你做了**——
   * 报价模板、排期和通知一个字节都没动。
   */
  it('采纳不改任何正式数据', () => {
    const state = createDemoState()
    const next = disposeInsight(state, {
      insightId: findingId(state),
      verdict: 'adopted',
      actor: ACTOR,
      now: TODAY,
    })

    expect(next.projects).toEqual(state.projects)
    expect(next.quoteCases).toEqual(state.quoteCases)
    expect(next.quoteVersions).toEqual(state.quoteVersions)
    expect(next.feedbackBatches).toEqual(state.feedbackBatches)
    expect(next.revisions).toEqual(state.revisions)
    expect(next.notificationDrafts).toEqual(state.notificationDrafts)
  })

  it('处置过的洞察仍然照常出现，只是多带一条处置记录', () => {
    const state = createDemoState()
    const id = findingId(state)
    const next = disposeInsight(state, {
      insightId: id,
      verdict: 'adopted',
      actor: ACTOR,
      now: TODAY,
    })

    const row = insights(next, TODAY).find((entry) => entry.id === id)
    expect(row).toBeDefined()
    expect(row?.disposition?.verdict).toBe('adopted')
    // 结论仍然成立就还得挂着——处置的是态度，不是事实
    expect(row?.executed).toBe(false)
  })

  it('结论不成立之后，洞察消失但处置记录留着', () => {
    const state = createDemoState()
    const id = findingId(state)
    const next = disposeInsight(state, {
      insightId: id,
      verdict: 'adopted',
      actor: ACTOR,
      now: TODAY,
    })

    const wiped: DemoState = { ...next, projects: [], feedbackBatches: [] }
    expect(insights(wiped, TODAY)).toEqual([])
    expect(dispositionOf(wiped, id)?.verdict).toBe('adopted')
  })
})
