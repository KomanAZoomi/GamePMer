import { describe, expect, it } from 'vitest'
import {
  cardTransform,
  clampPosition,
  hasSettled,
  smoothStep,
  wheelToDelta,
} from './deckLayout'

describe('位置夹取', () => {
  it('不循环——首尾不相接，因为阶段是串行的', () => {
    expect(clampPosition(-3, 6)).toBe(0)
    expect(clampPosition(9, 6)).toBe(5)
  })

  it('区间内原样保留小数位置', () => {
    expect(clampPosition(2.4, 6)).toBeCloseTo(2.4)
  })

  it('空序列和非法值都不会算出 NaN', () => {
    expect(clampPosition(2, 0)).toBe(0)
    expect(clampPosition(Number.NaN, 6)).toBe(0)
    expect(clampPosition(Number.POSITIVE_INFINITY, 6)).toBe(0)
  })
})

describe('帧率无关平滑', () => {
  it('朝目标推进', () => {
    const next = smoothStep(0, 5, 16)
    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(5)
  })

  it('拆成多帧与合成一帧的结果接近——掉帧不该让动画变慢', () => {
    let split = 0
    for (let i = 0; i < 2; i += 1) split = smoothStep(split, 5, 16)
    const single = smoothStep(0, 5, 32)
    expect(Math.abs(split - single)).toBeLessThan(0.05)
  })

  it('超长间隔被限流，切回后台不会瞬移', () => {
    const huge = smoothStep(0, 5, 5000)
    const capped = smoothStep(0, 5, 32)
    expect(huge).toBeCloseTo(capped, 6)
  })

  it('足够接近时直接吸附，动画帧才停得下来', () => {
    expect(smoothStep(4.9995, 5, 16)).toBe(5)
    expect(hasSettled(5, 5)).toBe(true)
    expect(hasSettled(3, 5)).toBe(false)
  })

  it('elapsed 为 0 或负数时保持不动', () => {
    expect(smoothStep(2, 5, 0)).toBe(2)
    expect(smoothStep(2, 5, -10)).toBe(2)
  })
})

describe('卡片变换', () => {
  const COUNT = 6

  it('当前卡最靠前、最大、最不透明', () => {
    const current = cardTransform(2, 2, COUNT)
    const neighbour = cardTransform(3, 2, COUNT)
    expect(current.z).toBeGreaterThan(neighbour.z)
    expect(current.scale).toBeGreaterThan(neighbour.scale)
    expect(current.opacity).toBeGreaterThan(neighbour.opacity)
    expect(current.zIndex).toBeGreaterThan(neighbour.zIndex)
  })

  it('当前卡接近正面，其余卡侧立——这是层叠的视觉基础', () => {
    expect(cardTransform(2, 2, COUNT).rotate).toBeGreaterThan(
      cardTransform(4, 2, COUNT).rotate,
    )
  })

  it('左右两侧沿 x 轴对称展开', () => {
    const left = cardTransform(1, 3, COUNT)
    const right = cardTransform(5, 3, COUNT)
    expect(left.x).toBeLessThan(0)
    expect(right.x).toBeGreaterThan(0)
    expect(Math.abs(left.x)).toBeCloseTo(Math.abs(right.x))
  })

  it('远处卡片淡出但不消失——序列还在继续这件事要看得见', () => {
    const far = cardTransform(0, 5, COUNT)
    expect(far.opacity).toBeGreaterThan(0.3)
    expect(far.opacity).toBeLessThan(0.6)
  })

  it('小数位置不产生跳变——连续位置是顺滑手感的前提', () => {
    const a = cardTransform(3, 2.0, COUNT)
    const b = cardTransform(3, 2.05, COUNT)
    expect(Math.abs(a.x - b.x)).toBeLessThan(5)
    expect(Math.abs(a.scale - b.scale)).toBeLessThan(0.05)
  })

  it('任何位置下都有且只有一张卡被判定为当前', () => {
    for (const position of [0, 1, 2.4, 3, 5]) {
      const currents = Array.from({ length: COUNT }, (_, index) =>
        cardTransform(index, position, COUNT),
      ).filter((card) => card.zIndex === 60)
      expect(currents.length).toBeLessThanOrEqual(1)
    }
  })

  it('缩放和不透明度始终为正，不会算出反向或不可见的卡片', () => {
    for (let index = 0; index < COUNT; index += 1) {
      const card = cardTransform(index, 0, COUNT)
      expect(card.scale).toBeGreaterThan(0)
      expect(card.opacity).toBeGreaterThan(0)
    }
  })
})

describe('滚轮归一', () => {
  it('像素、行、页三种模式方向一致且逐级放大', () => {
    const pixel = wheelToDelta(100, 0, 0)
    const line = wheelToDelta(100, 0, 1)
    const page = wheelToDelta(100, 0, 2)
    expect(pixel).toBeGreaterThan(0)
    expect(Math.abs(line)).toBeGreaterThanOrEqual(Math.abs(pixel))
    expect(Math.abs(page)).toBeGreaterThanOrEqual(Math.abs(line))
  })

  it('取主导轴——横向滚动同样能翻阶段', () => {
    expect(wheelToDelta(0, 100, 0)).toBeGreaterThan(0)
    expect(wheelToDelta(5, 100, 0)).toBeCloseTo(wheelToDelta(0, 100, 0))
  })

  it('无滚动时不动', () => {
    expect(wheelToDelta(0, 0, 0)).toBe(0)
  })

  it('单次增量被限幅，猛滚一下不会直接跳到末尾', () => {
    expect(Math.abs(wheelToDelta(99999, 0, 0))).toBeLessThanOrEqual(1)
  })
})
