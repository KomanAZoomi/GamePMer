import type { IsoDate } from './model'

/**
 * 时钟以依赖注入方式提供，不允许业务代码直接读 `new Date()`。
 *
 * Demo 时钟固定为 2026-07-27（周一）：种子数据的排期、风险状态和截图都以此为基准。
 * 不固定的话种子数据会随真实日期漂移，验收截图无法复现、同一场景无法重来。
 * 正式环境注入系统时钟。
 */
export interface Clock {
  today(): IsoDate
  now(): string
}

export const DEMO_TODAY: IsoDate = '2026-07-27'

export function createDemoClock(today: IsoDate = DEMO_TODAY): Clock {
  return {
    today: () => today,
    now: () => `${today}T09:00:00.000Z`,
  }
}

export function createSystemClock(): Clock {
  return {
    today: () => new Date().toISOString().slice(0, 10),
    now: () => new Date().toISOString(),
  }
}
