import { useCallback, useEffect, useState } from 'react'
import {
  ACCENT_STORAGE_KEY,
  FLUID_DEFAULTS,
  FLUID_STORAGE_KEY,
  METRIC_PALETTE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  type Accent,
  type FluidSettings,
  type MetricPalette,
  type ResolvedTheme,
  type ThemePreference,
  flowToDuration,
  nextTheme,
  normalizeAccent,
  normalizeFluid,
  normalizeMetricPalette,
  normalizeTheme,
  resolveTheme,
} from '../../domain/theme'

/**
 * 外观偏好的副作用层：读写 localStorage、写 DOM 属性、跟随系统主题变化。
 * 取值与循环规则全部来自 domain/theme.ts 的纯函数，这里不重复判断逻辑。
 */

const LIGHT_QUERY = '(prefers-color-scheme: light)'

function lightQuery(): MediaQueryList | undefined {
  // jsdom 里 matchMedia 可能不存在，测试环境不应因此崩溃
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return undefined
  }
  return window.matchMedia(LIGHT_QUERY)
}

function read<T>(key: string, normalize: (value: unknown) => T): T {
  try {
    return normalize(localStorage.getItem(key))
  } catch {
    // 隐私模式下会抛错，用默认值继续
    return normalize(null)
  }
}

function persist(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 存不下不影响本次会话使用
  }
}

export interface Appearance {
  theme: ThemePreference
  resolvedTheme: ResolvedTheme
  accent: Accent
  metricPalette: MetricPalette
  fluid: FluidSettings
  /** 顶栏按钮：按三态顺序切到下一个 */
  cycleTheme: () => void
  setTheme: (value: ThemePreference) => void
  setAccent: (value: Accent) => void
  setMetricPalette: (value: MetricPalette) => void
  setFluid: (patch: Partial<FluidSettings>) => void
  resetFluid: () => void
}

export function useAppearance(): Appearance {
  const [theme, setThemeState] = useState<ThemePreference>(() =>
    read(THEME_STORAGE_KEY, normalizeTheme),
  )
  const [accent, setAccentState] = useState<Accent>(() =>
    read(ACCENT_STORAGE_KEY, normalizeAccent),
  )
  const [metricPalette, setMetricPaletteState] = useState<MetricPalette>(() =>
    read(METRIC_PALETTE_STORAGE_KEY, normalizeMetricPalette),
  )
  const [fluid, setFluidState] = useState<FluidSettings>(() => {
    try {
      const raw = localStorage.getItem(FLUID_STORAGE_KEY)
      return normalizeFluid(raw ? JSON.parse(raw) : null)
    } catch {
      // 存的不是合法 JSON 也不该让界面起不来
      return { ...FLUID_DEFAULTS }
    }
  })
  const [systemPrefersLight, setSystemPrefersLight] = useState<boolean>(
    () => lightQuery()?.matches ?? false,
  )

  // 只有 system 模式需要跟随系统变化，但监听常驻更简单也无副作用
  useEffect(() => {
    const query = lightQuery()
    if (!query) return
    const onChange = (event: MediaQueryListEvent) => setSystemPrefersLight(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolvedTheme = resolveTheme(theme, systemPrefersLight)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.themeResolved = resolvedTheme
    root.dataset.accent = accent
    root.dataset.metricPalette = metricPalette
    root.style.setProperty('--metric-opacity', String(fluid.opacity / 100))
    root.style.setProperty('--metric-blur', `${fluid.blur}px`)
    root.style.setProperty('--metric-flow', `${flowToDuration(fluid.flow)}s`)
    root.style.colorScheme = resolvedTheme
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta instanceof HTMLMetaElement) {
      meta.content = resolvedTheme === 'light' ? '#f5f7f5' : '#060908'
    }
  }, [theme, resolvedTheme, accent, metricPalette, fluid])

  const setTheme = useCallback((value: ThemePreference) => {
    const normalized = normalizeTheme(value)
    setThemeState(normalized)
    persist(THEME_STORAGE_KEY, normalized)
  }, [])

  const setAccent = useCallback((value: Accent) => {
    const normalized = normalizeAccent(value)
    setAccentState(normalized)
    persist(ACCENT_STORAGE_KEY, normalized)
  }, [])

  const setMetricPalette = useCallback((value: MetricPalette) => {
    const normalized = normalizeMetricPalette(value)
    setMetricPaletteState(normalized)
    persist(METRIC_PALETTE_STORAGE_KEY, normalized)
  }, [])

  const setFluid = useCallback((patch: Partial<FluidSettings>) => {
    setFluidState((current) => {
      const next = normalizeFluid({ ...current, ...patch })
      persist(FLUID_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const resetFluid = useCallback(() => {
    setFluidState(() => {
      persist(FLUID_STORAGE_KEY, JSON.stringify(FLUID_DEFAULTS))
      return { ...FLUID_DEFAULTS }
    })
  }, [])

  const cycleTheme = useCallback(() => {
    setThemeState((current) => {
      const upcoming = nextTheme(current)
      persist(THEME_STORAGE_KEY, upcoming)
      return upcoming
    })
  }, [])

  return {
    theme,
    resolvedTheme,
    accent,
    metricPalette,
    fluid,
    cycleTheme,
    setTheme,
    setAccent,
    setMetricPalette,
    setFluid,
    resetFluid,
  }
}
