import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { clampPosition, hasSettled, smoothStep, wheelToDelta } from './deckLayout'

/**
 * 驱动阶段流层叠的观察位置。
 *
 * 位置是连续浮点数：滚轮往目标累加小数，每帧指数平滑逼近，
 * 所以滚一下是连续滑动而不是跳一格。计算规则全在 deckLayout.ts 的纯函数里，
 * 这里只负责接事件、跑动画帧和收尾。
 */

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export interface DeckPosition {
  /** 当前观察位置，可能是小数 */
  position: number
  /** 距离最近的整数阶段下标 */
  nearestIndex: number
  /** 直接落到某一阶段（点击卡片、外部选中） */
  goTo: (index: number, immediate?: boolean) => void
  /** 相对移动（方向键、按钮） */
  step: (direction: number) => void
  /**
   * 挂到滚动区域上。必须用 ref 而不是 React 的 onWheel——
   * React 把 wheel 注册成被动监听器，里面的 preventDefault 会被忽略，
   * 结果是滚轮既翻不动阶段、又把整页滚走。
   */
  viewportRef: RefObject<HTMLDivElement | null>
  /** 切到平铺视图时关掉滚轮劫持 */
  setEnabled: (value: boolean) => void
  onPointerDown: (event: React.PointerEvent) => void
  onPointerMove: (event: React.PointerEvent) => void
  onPointerUp: (event: React.PointerEvent) => void
  isDragging: boolean
}

export function useDeckPosition(count: number, activeIndex: number): DeckPosition {
  const [position, setPosition] = useState(() => clampPosition(activeIndex, count))
  const [isDragging, setDragging] = useState(false)

  const target = useRef(clampPosition(activeIndex, count))
  const frame = useRef<number | null>(null)
  const lastFrameTime = useRef(0)
  const dragStartX = useRef<number | null>(null)
  const dragOrigin = useRef(0)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const enabled = useRef(true)

  const stopAnimation = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }, [])

  const runAnimation = useCallback(() => {
    if (frame.current !== null) return
    lastFrameTime.current = performance.now()

    const tick = (now: number) => {
      const elapsed = now - lastFrameTime.current
      lastFrameTime.current = now
      let settled = false
      setPosition((current) => {
        const next = smoothStep(current, target.current, elapsed)
        settled = hasSettled(next, target.current)
        return next
      })
      if (settled) {
        frame.current = null
        return
      }
      frame.current = requestAnimationFrame(tick)
    }

    frame.current = requestAnimationFrame(tick)
  }, [])

  const commit = useCallback(
    (next: number, immediate = false) => {
      target.current = clampPosition(next, count)
      if (immediate || prefersReducedMotion()) {
        stopAnimation()
        setPosition(target.current)
        return
      }
      runAnimation()
    },
    [count, runAnimation, stopAnimation],
  )

  // 外部选中（点任务看板、搜索跳转）要把层叠带到对应阶段
  useEffect(() => {
    commit(activeIndex)
  }, [activeIndex, commit])

  useEffect(() => stopAnimation, [stopAnimation])

  const goTo = useCallback((index: number, immediate = false) => commit(index, immediate), [commit])

  const step = useCallback(
    (direction: number) => commit(Math.round(target.current) + direction),
    [commit],
  )

  useEffect(() => {
    const node = viewportRef.current
    if (!node) return

    const onWheel = (event: WheelEvent) => {
      if (!enabled.current) return
      const delta = wheelToDelta(event.deltaY, event.deltaX, event.deltaMode)
      if (!delta) return
      // 已经贴在边界还继续往外滚：把事件让回页面，否则用户会觉得页面卡住
      const next = target.current + delta
      if (clampPosition(next, count) === target.current) return
      event.preventDefault()
      commit(next)
    }

    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [commit, count])

  /** 平铺视图下要把滚轮交回浏览器做横向滚动 */
  const setEnabled = useCallback((value: boolean) => {
    enabled.current = value
  }, [])

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return
      dragStartX.current = event.clientX
      dragOrigin.current = target.current
      setDragging(true)
    },
    [],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (dragStartX.current === null) return
      const offset = event.clientX - dragStartX.current
      // 往左拖 = 看后面的阶段，与滚动方向一致
      commit(dragOrigin.current - offset / 112, true)
    },
    [commit],
  )

  const onPointerUp = useCallback(() => {
    if (dragStartX.current === null) return
    dragStartX.current = null
    setDragging(false)
    // 松手吸附到最近的阶段，不停在两张卡中间
    commit(Math.round(target.current))
  }, [commit])

  return {
    position,
    nearestIndex: clampPosition(Math.round(position), count),
    goTo,
    step,
    viewportRef,
    setEnabled,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    isDragging,
  }
}
