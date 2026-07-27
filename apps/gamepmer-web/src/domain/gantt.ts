import type { IsoDate, Project, StagePlan, WorkCalendar } from './model'
import {
  addCalendarDays,
  calendarDaysBetween,
  isWorkday,
  monthDayLabel,
  startOfWeek,
  weekdayLabel,
} from './workCalendar'

/**
 * 甘特图的几何与时间轴计算。
 *
 * 全部是纯函数：位置算错是甘特图最容易出、也最难用肉眼发现的问题，
 * 必须能单独测试，不能埋在组件的 style 属性里。
 *
 * 定位模型与已确认原型一致：日历列等分，条按百分比绝对定位，
 * 基准/当前/实际/草案四层靠垂直错位叠放在同一行。
 */

export interface GanttWindow {
  start: IsoDate
  end: IsoDate
  totalDays: number
}

export interface BarGeometry {
  visible: boolean
  /** 百分比，相对窗口宽度 */
  left: number
  width: number
  clippedStart: boolean
  clippedEnd: boolean
}

export function barGeometry(window: GanttWindow, start: IsoDate, finish: IsoDate): BarGeometry {
  if (finish < window.start || start > window.end) {
    return { visible: false, left: 0, width: 0, clippedStart: false, clippedEnd: false }
  }

  const clippedStart = start < window.start
  const clippedEnd = finish > window.end
  const from = clippedStart ? window.start : start
  const to = clippedEnd ? window.end : finish

  const offsetDays = calendarDaysBetween(window.start, from)
  const spanDays = calendarDaysBetween(from, to) + 1

  return {
    visible: true,
    left: (offsetDays / window.totalDays) * 100,
    width: (spanDays / window.totalDays) * 100,
    clippedStart,
    clippedEnd,
  }
}

/** 竖线（今天线、节点线）落在某一天格子的中心 */
export function dayCenterPercent(window: GanttWindow, date: IsoDate): number {
  const offsetDays = calendarDaysBetween(window.start, date)
  return ((offsetDays + 0.5) / window.totalDays) * 100
}

// ---------------------------------------------------------------- 条

export type BarLayer = 'baseline' | 'current' | 'actual' | 'clientWait' | 'draft'

export interface StageBar {
  layer: BarLayer
  start: IsoDate
  finish: IsoDate
  /** 区间尚未闭合（在制作中或仍在等客户），末端画成开放形态 */
  open: boolean
  label: string
}

/**
 * 一个阶段可能同时需要画多条：
 * 基准与当前不同才画基准条，避免正常阶段被两条一模一样的条压住；
 * 实际与等待客户各自成条，因为「做完了」和「客户认了」是两件事。
 */
export function stageBars(stage: StagePlan, today?: IsoDate): StageBar[] {
  const bars: StageBar[] = []
  const shifted =
    stage.baselineStart !== stage.currentStart || stage.baselineFinish !== stage.currentFinish

  if (shifted) {
    bars.push({
      layer: 'baseline',
      start: stage.baselineStart,
      finish: stage.baselineFinish,
      open: false,
      label: '基准',
    })
  }

  bars.push({
    layer: 'current',
    start: stage.currentStart,
    finish: stage.currentFinish,
    open: false,
    label: stage.name,
  })

  if (stage.actualStart) {
    const finished = stage.actualFinish
    bars.push({
      layer: 'actual',
      start: stage.actualStart,
      finish: finished ?? today ?? stage.actualStart,
      open: !finished,
      label: '实际',
    })
  }

  if (stage.submittedToClientAt) {
    const settled = stage.clientApprovedAt
    bars.push({
      layer: 'clientWait',
      start: stage.submittedToClientAt,
      finish: settled ?? today ?? stage.submittedToClientAt,
      open: !settled,
      label: settled ? '客户已验收' : '等待客户',
    })
  }

  return bars
}

// ---------------------------------------------------------------- 窗口

const WINDOW_PAD_DAYS = 3

/** 窗口由数据推导：覆盖项目全部阶段和今天，从周一开始，方便对齐周视图。 */
export function deriveGanttWindow(project: Project, today: IsoDate): GanttWindow {
  const dates: IsoDate[] = [today]
  for (const asset of project.assets) {
    for (const stage of asset.stages) {
      dates.push(stage.baselineStart, stage.baselineFinish, stage.currentStart, stage.currentFinish)
      if (stage.actualStart) dates.push(stage.actualStart)
      if (stage.actualFinish) dates.push(stage.actualFinish)
      if (stage.submittedToClientAt) dates.push(stage.submittedToClientAt)
      if (stage.clientApprovedAt) dates.push(stage.clientApprovedAt)
    }
  }

  const earliest = dates.reduce((min, date) => (date < min ? date : min), dates[0])
  const latest = dates.reduce((max, date) => (date > max ? date : max), dates[0])

  const start = startOfWeek(earliest)
  const end = addCalendarDays(latest, WINDOW_PAD_DAYS)

  return { start, end, totalDays: calendarDaysBetween(start, end) + 1 }
}

/** 草案会把阶段推到窗口之外，需要按需扩展右边界。 */
export function extendWindow(window: GanttWindow, latest: IsoDate): GanttWindow {
  if (latest <= window.end) return window
  const end = addCalendarDays(latest, WINDOW_PAD_DAYS)
  return { ...window, end, totalDays: calendarDaysBetween(window.start, end) + 1 }
}

// ---------------------------------------------------------------- 时间轴

export type AxisScale = 'day' | 'week' | 'month'

export interface AxisDay {
  date: IsoDate
  isWorkday: boolean
  isHoliday: boolean
  isToday: boolean
  dayLabel: string
  weekdayLabel: string
}

export interface AxisGroup {
  key: string
  label: string
  /** 该分组横跨多少个日历日，用于 grid 的列跨度 */
  span: number
}

export interface TimeAxis {
  days: AxisDay[]
  groups: AxisGroup[]
}

export function buildTimeAxis(
  window: GanttWindow,
  calendar: WorkCalendar,
  today: IsoDate,
  scale: AxisScale,
): TimeAxis {
  const days: AxisDay[] = []
  for (let offset = 0; offset < window.totalDays; offset += 1) {
    const date = addCalendarDays(window.start, offset)
    days.push({
      date,
      isWorkday: isWorkday(date, calendar),
      isHoliday: calendar.holidays.includes(date),
      isToday: date === today,
      dayLabel: monthDayLabel(date),
      weekdayLabel: weekdayLabel(date),
    })
  }

  return { days, groups: buildGroups(days, scale) }
}

function buildGroups(days: AxisDay[], scale: AxisScale): AxisGroup[] {
  if (scale === 'day') {
    return days.map((day) => ({ key: day.date, label: day.dayLabel, span: 1 }))
  }

  const groups: AxisGroup[] = []
  for (const day of days) {
    const key = scale === 'week' ? startOfWeek(day.date) : day.date.slice(0, 7)
    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      last.span += 1
      continue
    }
    groups.push({
      key,
      label:
        scale === 'week'
          ? `${monthDayLabel(key)} 当周`
          : `${key.slice(0, 4)} 年 ${Number(key.slice(5, 7))} 月`,
      span: 1,
    })
  }
  return groups
}
