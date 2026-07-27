import { describe, expect, it } from 'vitest'
import type { WorkCalendar } from './model'
import { countWorkdays, isWorkday, moveByWorkdays, nextWorkday, workdaySequence } from './workCalendar'

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
