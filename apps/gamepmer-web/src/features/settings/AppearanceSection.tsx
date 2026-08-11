import {
  ACCENTS,
  ACCENT_LABELS,
  ACCENT_NOTES,
  FLUID_DEFAULTS,
  FLUID_LIMITS,
  METRIC_PALETTES,
  METRIC_PALETTE_LABELS,
  METRIC_PALETTE_NOTES,
  THEME_LABELS,
  THEME_PREFERENCES,
  themeLabel,
} from '../../domain/theme'
import type { Appearance } from '../appearance/useAppearance'

interface AppearanceSectionProps {
  appearance: Appearance
}

/**
 * 外观设置：主题偏好与界面强调色。
 *
 * 强调色只改一个色相通道，明暗阶梯由 tokens.css 的公式派生，
 * 所以按钮、状态、选中态、焦点环和甘特条会整体跟着走，不需要逐处调色。
 */
export function AppearanceSection({ appearance }: AppearanceSectionProps) {
  const {
    theme,
    resolvedTheme,
    accent,
    metricPalette,
    fluid,
    setTheme,
    setAccent,
    setMetricPalette,
    setFluid,
    resetFluid,
  } = appearance

  const isDefaultFluid =
    fluid.opacity === FLUID_DEFAULTS.opacity &&
    fluid.blur === FLUID_DEFAULTS.blur &&
    fluid.flow === FLUID_DEFAULTS.flow

  return (
    <>
      <header className="gp-card-head">
        <h2>
          外观
          <span className="gp-settings-sub">
            当前 {themeLabel(theme, resolvedTheme)} · 强调色「{ACCENT_LABELS[accent]}」
          </span>
        </h2>
      </header>

      <div className="gp-settings-scroll">
        <section className="gp-appearance-block" aria-labelledby="gp-appearance-theme">
          <h3 id="gp-appearance-theme">显示主题</h3>
          <p className="gp-settings-note">
            默认暗色。长时间核对密集排期时如果觉得吃力，切到亮色即可，两套都是完整方案，
            不是互相反色出来的。选「跟随系统」时会随系统亮暗自动切换。
          </p>
          <div className="gp-theme-choices" role="group" aria-label="选择显示主题">
            {THEME_PREFERENCES.map((option) => (
              <button
                key={option}
                type="button"
                className={`gp-theme-choice${option === theme ? ' is-active' : ''}`}
                aria-pressed={option === theme}
                onClick={() => setTheme(option)}
              >
                <span className="gp-theme-choice-name">{THEME_LABELS[option]}</span>
                {option === 'system' && (
                  <span className="gp-theme-choice-note">
                    当前解析为{THEME_LABELS[resolvedTheme]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        <section className="gp-appearance-block" aria-labelledby="gp-appearance-accent">
          <h3 id="gp-appearance-accent">界面强调色</h3>
          <p className="gp-settings-note">
            强调色只影响「正式计划 / 已确认 / 主操作」这一类语义的着色。
            客户反馈的琥珀和风险的克制红不随它改变——那两个是状态色，换了会让人读错状态。
          </p>
          <div className="gp-accent-swatches" role="group" aria-label="选择界面强调色">
            {ACCENTS.map((option) => (
              <button
                key={option}
                type="button"
                className={`gp-accent-swatch${option === accent ? ' is-active' : ''}`}
                data-accent-option={option}
                aria-pressed={option === accent}
                onClick={() => setAccent(option)}
                title={ACCENT_NOTES[option]}
              >
                <i aria-hidden="true" />
                <span>{ACCENT_LABELS[option]}</span>
              </button>
            ))}
          </div>
          <p className="gp-settings-note gp-appearance-current">
            {ACCENT_LABELS[accent]}：{ACCENT_NOTES[accent]}
          </p>
        </section>

        <section className="gp-appearance-block" aria-labelledby="gp-appearance-metric">
          <h3 id="gp-appearance-metric">指标卡材质</h3>
          <p className="gp-settings-note">
            只影响首页四张指标卡的流体背景，不改任何数字和状态。
            「可能延期」在所有材质下都保持暖色与琥珀边框——材质可以换，状态不能被换糊涂。
          </p>
          <div className="gp-metric-palettes" role="group" aria-label="选择指标卡材质">
            {METRIC_PALETTES.map((option) => (
              <button
                key={option}
                type="button"
                className={`gp-metric-palette${option === metricPalette ? ' is-active' : ''}`}
                data-palette-option={option}
                aria-pressed={option === metricPalette}
                onClick={() => setMetricPalette(option)}
                title={METRIC_PALETTE_NOTES[option]}
              >
                <i aria-hidden="true" />
                <span>{METRIC_PALETTE_LABELS[option]}</span>
              </button>
            ))}
          </div>
          <p className="gp-settings-note gp-appearance-current">
            {METRIC_PALETTE_LABELS[metricPalette]}：{METRIC_PALETTE_NOTES[metricPalette]}
          </p>

          <div className="gp-fluid-controls">
            <label>
              <span>
                流体不透明度 <output>{fluid.opacity}%</output>
              </span>
              <input
                type="range"
                min={FLUID_LIMITS.opacity.min}
                max={FLUID_LIMITS.opacity.max}
                step={FLUID_LIMITS.opacity.step}
                value={fluid.opacity}
                onChange={(event) => setFluid({ opacity: Number(event.target.value) })}
              />
            </label>
            <label>
              <span>
                背景模糊 <output>{fluid.blur}px</output>
              </span>
              <input
                type="range"
                min={FLUID_LIMITS.blur.min}
                max={FLUID_LIMITS.blur.max}
                step={FLUID_LIMITS.blur.step}
                value={fluid.blur}
                onChange={(event) => setFluid({ blur: Number(event.target.value) })}
              />
            </label>
            <label>
              <span>
                流动速度 <output>{(fluid.flow / 100).toFixed(2)}×</output>
              </span>
              <input
                type="range"
                min={FLUID_LIMITS.flow.min}
                max={FLUID_LIMITS.flow.max}
                step={FLUID_LIMITS.flow.step}
                value={fluid.flow}
                onChange={(event) => setFluid({ flow: Number(event.target.value) })}
              />
            </label>
          </div>

          <button
            type="button"
            className="gp-btn gp-btn-quiet gp-fluid-reset"
            onClick={resetFluid}
            disabled={isDefaultFluid}
            title={isDefaultFluid ? '当前已是默认参数' : '把三个滑块恢复到默认值'}
          >
            恢复默认参数
          </button>

          <p className="gp-settings-note">
            系统设置里开启「减少动态效果」时，流体漂移与卡片倾斜会自动停用，
            只保留配色层次；此处的参数仍然生效。
          </p>
        </section>

        <section className="gp-appearance-block" aria-labelledby="gp-appearance-scope">
          <h3 id="gp-appearance-scope">这些设置存在哪里</h3>
          <p className="gp-settings-note">
            主题与强调色只保存在本机浏览器，不进业务数据，也不随「恢复示例数据」重置。
            换一台机器或换浏览器需要重新选择。
          </p>
        </section>
      </div>
    </>
  )
}
