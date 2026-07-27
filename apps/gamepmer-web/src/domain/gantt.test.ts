import { describe, expect, it } from 'vitest'
import { createDemoState } from '../data/seed'
import { DEMO_TODAY } from './clock'
import type { StagePlan, WorkCalendar } from './model'
import {
  barGeometry,
  buildTimeAxis,
  deriveGanttWindow,
  stageBars,
  type GanttWindow,
} from './gantt'

const calendar: WorkCalendar = {
  id: 'cal',
  name: '公司日历',
  holidays: ['2026-08-05'],
  extraWorkdays: [],
}

const window: GanttWindow = { start: '2026-07-20', end: '2026-08-16', totalDays: 28 }

function stage(overrides: Partial<StagePlan> = {}): StagePlan {
  return {
    id: 'A/3D_MID',
    code: '3D_MID',
    name: '中模',
    assetId: 'A',
    productionGroupId: 'g',
    ownerName: 'Chen',
    estimatedPersonDays: 3,
    baselineStart: '2026-07-20',
    baselineFinish: '2026-07-22',
    currentStart: '2026-07-20',
    currentFinish: '2026-07-22',
    dependsOn: [],
    status: 'NotStarted',
    flags: [],
    ...overrides,
  }
}

describe('barGeometry', () => {
  it('窗口第一天的单日条从 0% 开始，宽度为一格', () => {
    const geometry = barGeometry(window, '2026-07-20', '2026-07-20')
    expect(geometry.left).toBeCloseTo(0)
    expect(geometry.width).toBeCloseTo(100 / 28)
  })

  it('位置按日历日推进，不受工作日影响', () => {
    const geometry = barGeometry(window, '2026-07-27', '2026-07-29')
    expect(geometry.left).toBeCloseTo((7 / 28) * 100)
    expect(geometry.width).toBeCloseTo((3 / 28) * 100)
  })

  it('超出窗口左右两侧时裁剪到窗口边界', () => {
    const geometry = barGeometry(window, '2026-07-01', '2026-09-01')
    expect(geometry.left).toBeCloseTo(0)
    expect(geometry.width).toBeCloseTo(100)
    expect(geometry.clippedStart).toBe(true)
    expect(geometry.clippedEnd).toBe(true)
  })

  it('完全落在窗口外时返回不可见', () => {
    expect(barGeometry(window, '2026-06-01', '2026-06-10').visible).toBe(false)
    expect(barGeometry(window, '2026-09-01', '2026-09-10').visible).toBe(false)
  })
})

describe('stageBars', () => {
  it('基准与当前一致时不重复画两条，只标注未发生偏移', () => {
    const bars = stageBars(stage())
    expect(bars.map((bar) => bar.layer)).toEqual(['current'])
  })

  it('当前偏离基准时基准条与当前条同时存在', () => {
    const bars = stageBars(
      stage({ currentStart: '2026-07-22', currentFinish: '2026-07-24' }),
    )
    expect(bars.map((bar) => bar.layer)).toEqual(['baseline', 'current'])
  })

  it('实际日期存在时单独成条，未完成的实际条延伸到今天', () => {
    const bars = stageBars(
      stage({ status: 'InProduction', actualStart: '2026-07-20' }),
      DEMO_TODAY,
    )
    const actual = bars.find((bar) => bar.layer === 'actual')
    expect(actual).toBeDefined()
    expect(actual?.finish).toBe(DEMO_TODAY)
    expect(actual?.open).toBe(true)
  })

  it('已完成的实际条止于实际完成日', () => {
    const bars = stageBars(
      stage({ status: 'Approved', actualStart: '2026-07-20', actualFinish: '2026-07-22' }),
      DEMO_TODAY,
    )
    const actual = bars.find((bar) => bar.layer === 'actual')
    expect(actual?.finish).toBe('2026-07-22')
    expect(actual?.open).toBe(false)
  })

  it('提交客户后未获验收的区间单独成「等待客户」条', () => {
    const bars = stageBars(
      stage({
        status: 'AwaitingClient',
        actualStart: '2026-07-20',
        actualFinish: '2026-07-22',
        submittedToClientAt: '2026-07-22',
      }),
      DEMO_TODAY,
    )
    const wait = bars.find((bar) => bar.layer === 'clientWait')
    expect(wait?.start).toBe('2026-07-22')
    expect(wait?.finish).toBe(DEMO_TODAY)
  })

  it('客户已验收时等待条止于验收日，不再延伸到今天', () => {
    const bars = stageBars(
      stage({
        status: 'Approved',
        actualStart: '2026-07-20',
        actualFinish: '2026-07-22',
        submittedToClientAt: '2026-07-22',
        clientApprovedAt: '2026-07-23',
      }),
      DEMO_TODAY,
    )
    expect(bars.find((bar) => bar.layer === 'clientWait')?.finish).toBe('2026-07-23')
  })
})

describe('deriveGanttWindow', () => {
  const state = createDemoState()
  const project = state.projects.find((item) => item.code === 'P-3D-024')!

  it('窗口覆盖项目全部阶段，并从周一开始', () => {
    const derived = deriveGanttWindow(project, DEMO_TODAY)
    const stages = project.assets.flatMap((asset) => asset.stages)
    const earliest = stages.reduce(
      (min, item) => (item.baselineStart < min ? item.baselineStart : min),
      stages[0].baselineStart,
    )
    expect(derived.start <= earliest).toBe(true)
    expect(new Date(`${derived.start}T00:00:00Z`).getUTCDay()).toBe(1)
  })

  it('窗口包含今天', () => {
    const derived = deriveGanttWindow(project, DEMO_TODAY)
    expect(derived.start <= DEMO_TODAY && DEMO_TODAY <= derived.end).toBe(true)
  })
})

describe('buildTimeAxis', () => {
  it('日视图逐日展开并标出周末与公司休息日', () => {
    const axis = buildTimeAxis(window, calendar, DEMO_TODAY, 'day')
    expect(axis.days).toHaveLength(28)
    expect(axis.days.find((day) => day.date === '2026-08-01')?.isWorkday).toBe(false) // 周六
    expect(axis.days.find((day) => day.date === '2026-08-05')?.isWorkday).toBe(false) // 公司休息日
    expect(axis.days.find((day) => day.date === '2026-08-05')?.isHoliday).toBe(true)
    expect(axis.days.find((day) => day.date === DEMO_TODAY)?.isToday).toBe(true)
  })

  it('周视图把日期聚合成周，跨度总和不变', () => {
    const axis = buildTimeAxis(window, calendar, DEMO_TODAY, 'week')
    expect(axis.groups).toHaveLength(4)
    expect(axis.groups.reduce((total, group) => total + group.span, 0)).toBe(28)
    expect(axis.groups[0].label).toContain('7/20')
  })

  it('月视图按自然月聚合', () => {
    const axis = buildTimeAxis(window, calendar, DEMO_TODAY, 'month')
    expect(axis.groups.map((group) => group.label)).toEqual(['2026 年 7 月', '2026 年 8 月'])
    expect(axis.groups[0].span).toBe(12) // 7/20 - 7/31
  })
})
