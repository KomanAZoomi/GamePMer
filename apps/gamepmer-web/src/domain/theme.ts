/**
 * 外观偏好：主题与强调色。
 *
 * 本文件只放纯函数——取值、归一化、循环顺序和解析规则。
 * 读写 localStorage、改 DOM 属性这些副作用放在 features/appearance 里，
 * 这样偏好逻辑可以脱离浏览器单独测试。
 */

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const
export type ThemePreference = (typeof THEME_PREFERENCES)[number]

/** 实际落到 DOM 上的主题，只有明确的两种，没有 system */
export type ResolvedTheme = 'light' | 'dark'

export const ACCENTS = ['emerald', 'ocean', 'iris', 'amber', 'sakura'] as const
export type Accent = (typeof ACCENTS)[number]

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: '跟随系统',
  light: '亮色',
  dark: '暗色',
}

export const ACCENT_LABELS: Record<Accent, string> = {
  emerald: '翡翠',
  ocean: '静海',
  iris: '鸢尾',
  amber: '琥珀',
  sakura: '绯樱',
}

/** 强调色说明：设置页展示，帮 PM 判断该选哪套，而不是只给五个色点 */
export const ACCENT_NOTES: Record<Accent, string> = {
  emerald: '默认。与原鼠尾草绿同色相，正式计划与已确认状态',
  ocean: '冷静清晰，适合长时间盯排期和甘特',
  iris: '偏理性科技感，适合以分析为主的使用习惯',
  amber: '冲刺感强，节点压迫感更明显',
  sakura: '更轻的视觉重量，适合内容审阅为主的场景',
}

/** 暗色是默认值：JS 未执行时 CSS 也应落在暗色，而不是半成品状态 */
export const DEFAULT_THEME: ThemePreference = 'dark'
export const DEFAULT_ACCENT: Accent = 'emerald'

export const THEME_STORAGE_KEY = 'gamepmer.appearance.theme'
export const ACCENT_STORAGE_KEY = 'gamepmer.appearance.accent'

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value)
  )
}

export function isAccent(value: unknown): value is Accent {
  return typeof value === 'string' && (ACCENTS as readonly string[]).includes(value)
}

/** 非法或缺失的持久化值一律回落到默认，不让脏数据把界面卡在无主题状态 */
export function normalizeTheme(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : DEFAULT_THEME
}

export function normalizeAccent(value: unknown): Accent {
  return isAccent(value) ? value : DEFAULT_ACCENT
}

/**
 * 把偏好解析成实际主题。
 * 系统偏好由调用方注入，便于测试，也避免在纯函数里碰 matchMedia。
 */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersLight: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersLight ? 'light' : 'dark'
  return preference
}

/** 顶栏按钮的循环顺序：跟随系统 → 亮色 → 暗色 → 跟随系统 */
export function nextTheme(preference: ThemePreference): ThemePreference {
  const index = THEME_PREFERENCES.indexOf(normalizeTheme(preference))
  return THEME_PREFERENCES[(index + 1) % THEME_PREFERENCES.length]
}

/** 顶栏按钮图标：三态各自可辨，不只靠颜色区分 */
export function themeIcon(preference: ThemePreference): string {
  if (preference === 'system') return '◐'
  return preference === 'light' ? '☀' : '☾'
}

/**
 * 无障碍标签。system 模式下额外说明当前实际落在哪一种，
 * 否则用户无法从「跟随系统」四个字判断现在是亮还是暗。
 */
export function themeLabel(
  preference: ThemePreference,
  resolved: ResolvedTheme,
): string {
  if (preference === 'system') {
    return `${THEME_LABELS.system}（当前${THEME_LABELS[resolved]}）`
  }
  return THEME_LABELS[preference]
}

/* ================================================================
 * 指标卡流体材质
 *
 * 参考项目给四张卡提供了 Cyan / Original / Rain / Chrome 四套材质，
 * 外加自定义颜色与透明度、模糊、流速三个滑块。这里保留同样的可调范围，
 * 但有一条不让步：第四张「可能延期」始终走暖色（琥珀→红），
 * 且边框与注释保持琥珀语义——材质可以换，状态不能被换糊涂。
 * ================================================================ */

export const METRIC_PALETTES = ['semantic', 'cyan', 'original', 'rain', 'chrome'] as const
export type MetricPalette = (typeof METRIC_PALETTES)[number]

export const METRIC_PALETTE_LABELS: Record<MetricPalette, string> = {
  semantic: '语义',
  cyan: '青蓝',
  original: '霓虹',
  rain: '雨夜',
  chrome: '铬金属',
}

export const METRIC_PALETTE_NOTES: Record<MetricPalette, string> = {
  semantic: '默认。三张卡分别取强调色、石板灰与鼠尾草，与全站语义同源',
  cyan: '青绿到深靛，冷静清透，适合长时间盯盘',
  original: '品红、橙与紫罗兰，饱和度最高，演示和汇报时最抓眼',
  rain: '蓝橙对撞压在深底上，反差强但不刺眼',
  chrome: '近白到石墨的无彩阶，最安静，把注意力全留给数字',
}

export const DEFAULT_METRIC_PALETTE: MetricPalette = 'semantic'
export const METRIC_PALETTE_STORAGE_KEY = 'gamepmer.appearance.metricPalette'

export function isMetricPalette(value: unknown): value is MetricPalette {
  return (
    typeof value === 'string' && (METRIC_PALETTES as readonly string[]).includes(value)
  )
}

export function normalizeMetricPalette(value: unknown): MetricPalette {
  return isMetricPalette(value) ? value : DEFAULT_METRIC_PALETTE
}

/** 材质三参数。数值都是整数百分比或像素，便于直接进 CSS 变量 */
export interface FluidSettings {
  /** 流体场整体不透明度，% */
  opacity: number
  /** 高斯模糊半径，px。调小会露出渐变边界，调大更像玻璃 */
  blur: number
  /** 漂移速度，%。100 为基准，越大越快 */
  flow: number
}

export const FLUID_DEFAULTS: FluidSettings = { opacity: 100, blur: 26, flow: 100 }

export const FLUID_LIMITS = {
  opacity: { min: 30, max: 100, step: 5 },
  blur: { min: 8, max: 44, step: 2 },
  flow: { min: 40, max: 220, step: 10 },
} as const

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

/** 越界或脏数据一律夹回合法区间，不让界面出现不可见或卡死的材质 */
export function normalizeFluid(value: unknown): FluidSettings {
  const raw = (value ?? {}) as Partial<FluidSettings>
  return {
    opacity: clampNumber(
      raw.opacity,
      FLUID_LIMITS.opacity.min,
      FLUID_LIMITS.opacity.max,
      FLUID_DEFAULTS.opacity,
    ),
    blur: clampNumber(raw.blur, FLUID_LIMITS.blur.min, FLUID_LIMITS.blur.max, FLUID_DEFAULTS.blur),
    flow: clampNumber(raw.flow, FLUID_LIMITS.flow.min, FLUID_LIMITS.flow.max, FLUID_DEFAULTS.flow),
  }
}

/** 流速百分比换算成动画周期秒数：越快周期越短，但留下限避免抽搐 */
export function flowToDuration(flow: number): number {
  const safe = clampNumber(flow, FLUID_LIMITS.flow.min, FLUID_LIMITS.flow.max, FLUID_DEFAULTS.flow)
  return Math.max(3, Math.round((900 / safe) * 10) / 10)
}

export const FLUID_STORAGE_KEY = 'gamepmer.appearance.fluid'
