import { describe, expect, it } from 'vitest'
import {
  ACCENTS,
  ACCENT_LABELS,
  ACCENT_NOTES,
  DEFAULT_ACCENT,
  DEFAULT_THEME,
  DEFAULT_METRIC_PALETTE,
  FLUID_DEFAULTS,
  FLUID_LIMITS,
  METRIC_PALETTES,
  METRIC_PALETTE_LABELS,
  METRIC_PALETTE_NOTES,
  THEME_PREFERENCES,
  flowToDuration,
  isAccent,
  isMetricPalette,
  normalizeFluid,
  normalizeMetricPalette,
  isThemePreference,
  nextTheme,
  normalizeAccent,
  normalizeTheme,
  resolveTheme,
  themeIcon,
  themeLabel,
} from './theme'

describe('主题偏好解析', () => {
  it('明确的亮/暗偏好直接生效，不受系统影响', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('light', false)).toBe('light')
    expect(resolveTheme('dark', true)).toBe('dark')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('跟随系统时才读系统偏好', () => {
    expect(resolveTheme('system', true)).toBe('light')
    expect(resolveTheme('system', false)).toBe('dark')
  })

  it('系统未表态时落到暗色——暗色是本产品的默认', () => {
    expect(resolveTheme('system', false)).toBe(DEFAULT_THEME)
  })
})

describe('三态循环', () => {
  it('按 跟随系统 → 亮色 → 暗色 循环', () => {
    expect(nextTheme('system')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('system')
  })

  it('循环三次回到原点，不会漏掉或重复某一态', () => {
    let current = DEFAULT_THEME
    const seen = [current]
    for (let i = 0; i < THEME_PREFERENCES.length; i += 1) {
      current = nextTheme(current)
      seen.push(current)
    }
    expect(seen[seen.length - 1]).toBe(DEFAULT_THEME)
    expect(new Set(seen).size).toBe(THEME_PREFERENCES.length)
  })

  it('从非法值出发也能回到合法循环，不会卡死', () => {
    expect(nextTheme('midnight' as never)).toBe('system')
  })
})

describe('持久化值归一', () => {
  it('识别合法值', () => {
    expect(isThemePreference('dark')).toBe(true)
    expect(isAccent('emerald')).toBe(true)
  })

  it('拒绝非法值', () => {
    for (const bad of ['', 'DARK', 'blue', null, undefined, 42, {}, []]) {
      expect(isThemePreference(bad)).toBe(false)
      expect(isAccent(bad)).toBe(false)
    }
  })

  it('脏数据回落到默认，不让界面卡在无主题状态', () => {
    expect(normalizeTheme(null)).toBe(DEFAULT_THEME)
    expect(normalizeTheme('rainbow')).toBe(DEFAULT_THEME)
    expect(normalizeAccent(undefined)).toBe(DEFAULT_ACCENT)
    expect(normalizeAccent('neon')).toBe(DEFAULT_ACCENT)
  })

  it('合法值原样保留', () => {
    expect(normalizeTheme('light')).toBe('light')
    expect(normalizeAccent('sakura')).toBe('sakura')
  })
})

describe('无障碍标签与图标', () => {
  it('三态图标互不相同，不只靠颜色区分', () => {
    const icons = THEME_PREFERENCES.map(themeIcon)
    expect(new Set(icons).size).toBe(THEME_PREFERENCES.length)
  })

  it('跟随系统时标签要说明当前实际落在哪一种', () => {
    expect(themeLabel('system', 'light')).toContain('亮色')
    expect(themeLabel('system', 'dark')).toContain('暗色')
    expect(themeLabel('system', 'dark')).toContain('跟随系统')
  })

  it('明确偏好时标签不加括号说明', () => {
    expect(themeLabel('dark', 'dark')).toBe('暗色')
    expect(themeLabel('light', 'light')).toBe('亮色')
  })
})

describe('强调色清单', () => {
  it('五套强调色都有中文名和选用说明', () => {
    expect(ACCENTS).toHaveLength(5)
    for (const accent of ACCENTS) {
      expect(ACCENT_LABELS[accent]).toBeTruthy()
      expect(ACCENT_NOTES[accent]).toBeTruthy()
    }
  })

  it('默认强调色是翡翠——与原鼠尾草绿同色相，保持品牌延续', () => {
    expect(DEFAULT_ACCENT).toBe('emerald')
    expect(ACCENTS).toContain(DEFAULT_ACCENT)
  })
})

describe('指标卡材质', () => {
  it('五套材质都有中文名和选用说明', () => {
    expect(METRIC_PALETTES).toHaveLength(5)
    for (const palette of METRIC_PALETTES) {
      expect(METRIC_PALETTE_LABELS[palette]).toBeTruthy()
      expect(METRIC_PALETTE_NOTES[palette]).toBeTruthy()
    }
  })

  it('脏数据回落到语义预设', () => {
    expect(normalizeMetricPalette('neon')).toBe(DEFAULT_METRIC_PALETTE)
    expect(normalizeMetricPalette(null)).toBe(DEFAULT_METRIC_PALETTE)
    expect(isMetricPalette('cyan')).toBe(true)
    expect(isMetricPalette('CYAN')).toBe(false)
  })
})

describe('流体材质参数', () => {
  it('默认值落在各自区间内', () => {
    const normalized = normalizeFluid(FLUID_DEFAULTS)
    expect(normalized).toEqual(FLUID_DEFAULTS)
  })

  it('越界值被夹回区间，不会出现不可见或卡死的材质', () => {
    const low = normalizeFluid({ opacity: -50, blur: 0, flow: 0 })
    expect(low.opacity).toBe(FLUID_LIMITS.opacity.min)
    expect(low.blur).toBe(FLUID_LIMITS.blur.min)
    expect(low.flow).toBe(FLUID_LIMITS.flow.min)

    const high = normalizeFluid({ opacity: 999, blur: 999, flow: 999 })
    expect(high.opacity).toBe(FLUID_LIMITS.opacity.max)
    expect(high.blur).toBe(FLUID_LIMITS.blur.max)
    expect(high.flow).toBe(FLUID_LIMITS.flow.max)
  })

  it('缺字段、非数字和空值都回落到默认', () => {
    expect(normalizeFluid(null)).toEqual(FLUID_DEFAULTS)
    expect(normalizeFluid({})).toEqual(FLUID_DEFAULTS)
    expect(normalizeFluid({ opacity: 'abc' })).toEqual(FLUID_DEFAULTS)
    expect(normalizeFluid({ blur: Number.NaN }).blur).toBe(FLUID_DEFAULTS.blur)
  })

  it('部分字段合法时只保留合法的那部分', () => {
    const mixed = normalizeFluid({ opacity: 60, blur: 'x' })
    expect(mixed.opacity).toBe(60)
    expect(mixed.blur).toBe(FLUID_DEFAULTS.blur)
  })

  it('流速越大动画周期越短，且有下限防止抽搐', () => {
    expect(flowToDuration(200)).toBeLessThan(flowToDuration(50))
    expect(flowToDuration(FLUID_LIMITS.flow.max)).toBeGreaterThanOrEqual(3)
    expect(flowToDuration(99999)).toBeGreaterThanOrEqual(3)
  })
})
