import { describe, expect, it } from 'vitest'
import type { WorkCalendar } from './model'
import { countWorkdays, isWorkday, moveByWorkdays, nextWorkday, planFromPersonDays, workdaySequence } from './workCalendar'

// 2026-08-05 是周三，设为公司休息日；2026-08-08 是周六，设为特殊工作日。
const calendar: WorkCalendar = {
  id: 'cal-cn',
  name: '公司日历',
  holidays: ['2026-08-05'],
  extraWorkdays: ['2026-08-08'],
}

describe('isWorkday', () => {
  it('周一到周五是工作日', () => {
    expect(isWorkday('2026-07-27', calendar)).toBe(true) // 周一
    expect(isWorkday('2026-07-31', calendar)).toBe(true) // 周五
  })

  it('周末不是工作日', () => {
    expect(isWorkday('2026-08-01', calendar)).toBe(false) // 周六
    expect(isWorkday('2026-08-02', calendar)).toBe(false) // 周日
  })

  it('公司休息日即使在周中也不是工作日', () => {
    expect(isWorkday('2026-08-05', calendar)).toBe(false)
  })

  it('特殊工作日即使在周末也是工作日', () => {
    expect(isWorkday('2026-08-08', calendar)).toBe(true)
  })
})

describe('moveByWorkdays', () => {
  it('不跨周末时逐日推进', () => {
    expect(moveByWorkdays('2026-07-27', 2, calendar)).toBe('2026-07-29')
  })

  it('跨过周末', () => {
    expect(moveByWorkdays('2026-07-31', 1, calendar)).toBe('2026-08-03')
  })

  it('跨过公司休息日', () => {
    // 8/4 周二 +1 个工作日：跳过 8/5 休息日，落到 8/6 周四
    expect(moveByWorkdays('2026-08-04', 1, calendar)).toBe('2026-08-06')
  })

  it('特殊工作日参与顺延计数', () => {
    // 8/7 周五 +1 个工作日：落在 8/8（周六，但被设为特殊工作日）
    expect(moveByWorkdays('2026-08-07', 1, calendar)).toBe('2026-08-08')
  })

  it('可以向前回溯', () => {
    expect(moveByWorkdays('2026-08-03', -1, calendar)).toBe('2026-07-31')
  })

  it('位移为 0 时返回原日期', () => {
    expect(moveByWorkdays('2026-07-27', 0, calendar)).toBe('2026-07-27')
  })
})

describe('nextWorkday', () => {
  it('已经是工作日时返回自身', () => {
    expect(nextWorkday('2026-07-27', calendar)).toBe('2026-07-27')
  })

  it('落在周末时顺延到下一个工作日', () => {
    expect(nextWorkday('2026-08-01', calendar)).toBe('2026-08-03')
  })

  it('落在公司休息日时顺延', () => {
    expect(nextWorkday('2026-08-05', calendar)).toBe('2026-08-06')
  })
})

describe('countWorkdays', () => {
  it('闭区间计数，含首尾', () => {
    expect(countWorkdays('2026-07-27', '2026-07-31', calendar)).toBe(5)
  })

  it('跨周末只数工作日', () => {
    expect(countWorkdays('2026-07-30', '2026-08-04', calendar)).toBe(4) // 7/30 7/31 8/3 8/4
  })

  it('区间内的公司休息日不计入', () => {
    expect(countWorkdays('2026-08-03', '2026-08-07', calendar)).toBe(4) // 8/3 8/4 8/6 8/7
  })

  it('起止相同且是工作日时为 1', () => {
    expect(countWorkdays('2026-07-27', '2026-07-27', calendar)).toBe(1)
  })
})

describe('workdaySequence', () => {
  it('返回区间内全部日历日，并标注是否工作日', () => {
    expect(workdaySequence('2026-07-31', '2026-08-03', calendar)).toEqual([
      { date: '2026-07-31', isWorkday: true },
      { date: '2026-08-01', isWorkday: false },
      { date: '2026-08-02', isWorkday: false },
      { date: '2026-08-03', isWorkday: true },
    ])
  })
})

/**
 * 从人天推节点。
 *
 * 总监录报价时选了开始日，结束日就该按人天自动算出来——手工数工作日是纯粹的浪费，
 * 而且很容易把周末或公司休息日算进去。
 */
describe('按人天推出结束日', () => {
  // 2026-08-05 是公司休息日
  const calendar: WorkCalendar = {
    id: 'cal-2026',
    name: '公司日历 2026',
    holidays: ['2026-08-05'],
    extraWorkdays: [],
  }

  it('1 人天当天就结束——开始日自己算第一天', () => {
    expect(planFromPersonDays('2026-08-03', 1, calendar)).toEqual({
      start: '2026-08-03',
      finish: '2026-08-03',
      snapped: false,
    })
  })

  it('跨周末顺延：周五开始 2 人天，结束落到下周一', () => {
    // 2026-08-07 是周五
    expect(planFromPersonDays('2026-08-07', 2, calendar)!.finish).toBe('2026-08-10')
  })

  it('跨公司休息日顺延：8/4 开始 3 人天，跳过 8/5', () => {
    // 8/4 周二、8/5 休息、8/6 周四、8/7 周五
    expect(planFromPersonDays('2026-08-04', 3, calendar)!.finish).toBe('2026-08-07')
  })

  /** 0.5 人天也占一个工作日——人不能在半天里被切成两半排给两件事 */
  it('小数人天向上取整占整个工作日', () => {
    expect(planFromPersonDays('2026-08-03', 0.5, calendar)!.finish).toBe('2026-08-03')
    expect(planFromPersonDays('2026-08-03', 1.5, calendar)!.finish).toBe('2026-08-04')
  })

  /**
   * 开始日落在非工作日时**前移到下一个工作日**，并标记 snapped。
   * 阶段不可能在公司休息日开工，静默留着那个日期会一路流进甘特。
   */
  it('开始日撞上休息日时前移，并明确告知', () => {
    const result = planFromPersonDays('2026-08-05', 2, calendar)!
    expect(result.start).toBe('2026-08-06')
    expect(result.finish).toBe('2026-08-07')
    expect(result.snapped).toBe(true)
  })

  it('开始日撞上周末时同样前移', () => {
    // 2026-08-08 周六
    const result = planFromPersonDays('2026-08-08', 1, calendar)!
    expect(result.start).toBe('2026-08-10')
    expect(result.snapped).toBe(true)
  })

  it('人天为 0 或负数时算不出节点，返回 undefined', () => {
    expect(planFromPersonDays('2026-08-03', 0, calendar)).toBeUndefined()
    expect(planFromPersonDays('2026-08-03', -1, calendar)).toBeUndefined()
  })

  it('算出来的区间里工作日数正好等于取整后的人天', () => {
    for (const days of [1, 2, 3, 5, 8]) {
      const result = planFromPersonDays('2026-08-03', days, calendar)!
      expect(countWorkdays(result.start, result.finish, calendar), `${days} 人天`).toBe(days)
    }
  })
})
