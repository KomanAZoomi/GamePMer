/**
 * 阶段流侧向层叠的位置计算。
 *
 * 手法移植自 octopus-kaogong-workbench：用一个**连续浮点位置**而不是离散索引
 * 表示「当前看到哪儿」，滚轮往目标位置累加小数，每帧做帧率无关的指数平滑。
 * 这是它滑动手感顺的根本原因——大多数轮播是 index + transition，一格一格跳。
 *
 * 与 kaogong 的关键差异：**不循环**。
 * 那边九个备考模块是同质可循环的集合，转盘转到头接回开头很自然；
 * 这里是 `StagePlan` 序列，「下一阶段等上一阶段客户验收」是串行规则，
 * 首尾相接会让人以为 LOD 之后又回到中模。所以位置被夹在两端。
 */

/*
 * 相邻卡片的水平间距（px）。
 *
 * kaogong 用 46px 配 134px 宽的卡片——它的卡片是装饰性纸片，非选中卡的文字
 * 直接 opacity:.14 藏掉，所以重叠多少都无所谓。这里的阶段卡带日期、负责人和
 * 人天，藏掉就失去了「一眼看清前后阶段」的意义，因此步距必须留够。
 */
const STEP_X = 74

/** 层叠翻转角：当前卡接近正面，其余卡侧立但仍能读出阶段名 */
const ROTATE_CURRENT = -10
const ROTATE_STACKED = -46

/** 与 tokens.css 的 --z-deck-card / --z-deck-focus 保持一致 */
const DECK_BASE_Z = 20
const DECK_FOCUS_Z = 60

export interface DeckCardTransform {
  x: number
  y: number
  z: number
  rotate: number
  scale: number
  opacity: number
  zIndex: number
  /** 太靠后的卡片不该抢焦点，也不该能被点到 */
  interactive: boolean
}

/** 位置只在 [0, count-1] 内有效；越界一律夹回，避免出现空场景 */
export function clampPosition(position: number, count: number): number {
  if (count <= 0) return 0
  if (!Number.isFinite(position)) return 0
  return Math.min(count - 1, Math.max(0, position))
}

/**
 * 帧率无关的指数平滑。
 * 同样的 elapsed 总量下，拆成多帧还是一帧推进，结果应当接近一致，
 * 否则掉帧时动画会变慢，高刷屏上又会变快。
 */
export function smoothStep(current: number, target: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return current
  // 上限 32ms：切后台再切回来时 elapsed 会非常大，不能让卡片瞬移
  const clamped = Math.min(32, elapsedMs)
  const factor = 1 - Math.exp(-clamped / 170)
  const next = current + (target - current) * factor
  // 收敛到足够近就直接吸附，避免无限逼近导致动画帧永不停止
  return Math.abs(target - next) < 0.002 ? target : next
}

/** 是否已经到位——用于决定何时停掉动画帧 */
export function hasSettled(current: number, target: number): boolean {
  return Math.abs(target - current) < 0.002
}

/**
 * 算出某张卡在给定观察位置下的变换。
 * 纯函数：同样输入永远同样输出，不读 DOM、不读时间。
 */
export function cardTransform(
  index: number,
  position: number,
  count: number,
): DeckCardTransform {
  const delta = index - position
  const distance = Math.abs(delta)
  const isCurrent = distance < 0.5

  const x = delta * STEP_X
  const y = Math.min(distance, 5) * 2.5
  const z = isCurrent ? 105 : 58 - Math.min(distance, 5) * 7
  const rotate = isCurrent
    ? ROTATE_CURRENT
    : Math.max(-64, ROTATE_STACKED - Math.min(distance, 6) * 1.8)
  const scale = isCurrent ? 1.03 : Math.max(0.88, 0.98 - distance * 0.02)

  // 远处的卡片淡出，但保留一点可见度，让人知道序列还在继续
  const opacity = Math.max(0.34, 1 - distance * 0.14)

  /*
   * 越靠近当前位置越靠前；右侧卡片压在左侧卡片之上，形成一致的层叠方向。
   * 取值对齐 tokens.css 的层级刻度：--z-deck-card(20) 是层叠基线，
   * --z-deck-focus(60) 是聚焦卡。以前这里直接写 58–90，和 CSS 里的
   * 2/3/4/40 是两套互不知情的尺子，浮层与卡片谁压谁全靠巧合。
   */
  const zIndex = isCurrent
    ? DECK_FOCUS_Z
    : Math.max(DECK_BASE_Z, Math.round(DECK_FOCUS_Z - 8 - distance * 4))

  return {
    x,
    y,
    z,
    rotate,
    scale,
    opacity,
    zIndex,
    interactive: distance < count,
  }
}

/** 滚轮增量换算成位置增量。像素/行/页三种滚动模式都要归一 */
export function wheelToDelta(deltaY: number, deltaX: number, deltaMode: number): number {
  const dominant = Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX
  if (!dominant) return 0
  // 0=像素 1=行 2=页
  const scaled = deltaMode === 1 ? dominant * 16 : deltaMode === 2 ? dominant * 400 : dominant
  return Math.max(-140, Math.min(140, scaled)) / 145
}
