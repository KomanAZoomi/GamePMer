import type { IsoDate } from './model'

const parse = (value: IsoDate) => new Date(`${value}T00:00:00.000Z`)
const format = (value: Date): IsoDate => value.toISOString().slice(0, 10)

export function isWorkday(date: IsoDate): boolean {
  const day = parse(date).getUTCDay()
  return day !== 0 && day !== 6
}

export function moveByWorkdays(date: IsoDate, delta: number): IsoDate {
  if (delta === 0) return date

  const cursor = parse(date)
  const direction = delta > 0 ? 1 : -1
  let remaining = Math.abs(delta)

  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + direction)
    if (isWorkday(format(cursor))) remaining -= 1
  }

  return format(cursor)
}

export function countWorkdays(start: IsoDate, finish: IsoDate): number {
  const cursor = parse(start)
  const end = parse(finish)
  let count = 0

  while (cursor <= end) {
    if (isWorkday(format(cursor))) count += 1
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return count
}
