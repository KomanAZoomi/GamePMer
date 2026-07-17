import { countWorkdays, moveByWorkdays } from './workCalendar'

describe('工作日历', () => {
  it('将周五后的一工作日移动到下周一', () => {
    expect(moveByWorkdays('2026-07-17', 1)).toBe('2026-07-20')
  })

  it('在日期区间中排除周末', () => {
    expect(countWorkdays('2026-07-17', '2026-07-21')).toBe(3)
  })
})
