import type { IsoDate, WorkCalendar } from './model'

/**
 * 工作日历。全部日期按 UTC 解析，避免本机时区把日期算错一天。
 * 规则优先级：特殊工作日 > 公司休息日 > 周末。
 */

const parse = (value: IsoDate) => new Date(`${value}T00:00:00.000Z`)
const format = (value: Date): IsoDate => value.toISOString().slice(0, 10)

export const EMPTY_CALENDAR: WorkCalendar = {
  id: 'weekend-only',
  name: '仅周末休息',
  holidays: [],
  extraWorkdays: [],
}

export function isWorkday(date: IsoDate, calendar: WorkCalendar = EMPTY_CALENDAR): boolean {
  if (calendar.extraWorkdays.includes(date)) return true
  if (calendar.holidays.includes(date)) return false
  const day = parse(date).getUTCDay()
  return day !== 0 && day !== 6
}

/** 把日期顺延到最近的有效工作日（已经是工作日则原样返回）。 */
export function nextWorkday(date: IsoDate, calendar: WorkCalendar = EMPTY_CALENDAR): IsoDate {
  const cursor = parse(date)
  while (!isWorkday(format(cursor), calendar)) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return format(cursor)
}

/** 按整工作日位移。delta 为正向后、为负向前。 */
export function moveByWorkdays(
  date: IsoDate,
  delta: number,
  calendar: WorkCalendar = EMPTY_CALENDAR,
): IsoDate {
  if (delta === 0) return date

  const cursor = parse(date)
  const direction = delta > 0 ? 1 : -1
  let remaining = Math.abs(delta)

  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + direction)
    if (isWorkday(format(cursor), calendar)) remaining -= 1
  }

  return format(cursor)
}

/** 闭区间内的工作日数量，含首尾。 */
export function countWorkdays(
  start: IsoDate,
  finish: IsoDate,
  calendar: WorkCalendar = EMPTY_CALENDAR,
): number {
  const cursor = parse(start)
  const end = parse(finish)
  let count = 0

  while (cursor <= end) {
    if (isWorkday(format(cursor), calendar)) count += 1
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return count
}

export interface CalendarDay {
  date: IsoDate
  isWorkday: boolean
}

/** 区间内的全部日历日（含非工作日），供甘特时间轴渲染周末与休息日底纹。 */
export function workdaySequence(
  start: IsoDate,
  finish: IsoDate,
  calendar: WorkCalendar = EMPTY_CALENDAR,
): CalendarDay[] {
  const cursor = parse(start)
  const end = parse(finish)
  const days: CalendarDay[] = []

  while (cursor <= end) {
    const date = format(cursor)
    days.push({ date, isWorkday: isWorkday(date, calendar) })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return days
}

/** 日历日差（不看工作日），用于甘特条的像素/百分比定位。 */
export function calendarDaysBetween(start: IsoDate, finish: IsoDate): number {
  return Math.round((parse(finish).getTime() - parse(start).getTime()) / 86_400_000)
}

export function addCalendarDays(date: IsoDate, delta: number): IsoDate {
  const cursor = parse(date)
  cursor.setUTCDate(cursor.getUTCDate() + delta)
  return format(cursor)
}

/** 所在周的周一。制作组容量按周聚合。 */
export function startOfWeek(date: IsoDate): IsoDate {
  const cursor = parse(date)
  const day = cursor.getUTCDay()
  const offset = day === 0 ? -6 : 1 - day
  cursor.setUTCDate(cursor.getUTCDate() + offset)
  return format(cursor)
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

export function weekdayLabel(date: IsoDate): string {
  return WEEKDAY_LABELS[parse(date).getUTCDay()]
}

/** 紧凑日期：年份在页头已经给过，行内密集处只显示月日 */
export function shortDate(date: IsoDate): string {
  return date.slice(5)
}

export function dateRange(start: IsoDate, finish: IsoDate): string {
  return `${shortDate(start)} — ${shortDate(finish)}`
}

export function monthDayLabel(date: IsoDate): string {
  const value = parse(date)
  return `${value.getUTCMonth() + 1}/${value.getUTCDate()}`
}

/**
 * 从开始日与人天推出结束日。
 *
 * 总监录报价时选了开始日，结束日就该自己算出来——手工数工作日是纯粹的浪费，
 * 而且很容易把周末或公司休息日算进去。
 *
 * 三条规则：
 *
 * 1. **开始日算第一天。** 1 人天当天就结束，不是隔一天。
 * 2. **小数向上取整。** 0.5 人天照样占一整个工作日——
 *    人没法在半天里被切开排给两件事，排期上那一天就是被占住了。
 * 3. **开始日撞上非工作日就前移**，并把 `snapped` 标出来。
 *    阶段不可能在公司休息日开工，静默留着那个日期会一路流进甘特。
 */
export function planFromPersonDays(
  start: IsoDate,
  personDays: number,
  calendar: WorkCalendar = EMPTY_CALENDAR,
): { start: IsoDate; finish: IsoDate; snapped: boolean } | undefined {
  if (!(personDays > 0)) return undefined

  const from = nextWorkday(start, calendar)
  return {
    start: from,
    finish: moveByWorkdays(from, Math.ceil(personDays) - 1, calendar),
    snapped: from !== start,
  }
}
