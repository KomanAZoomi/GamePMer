import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Asset, StagePlan } from '../../domain/model'
import { stageFlagLabels, stageStatusLabel } from '../../domain/lookup'
import { dateRange } from '../../domain/workCalendar'
import { cardTransform } from './deckLayout'
import { useDeckPosition } from './useDeckPosition'

interface StageDeckProps {
  asset?: Asset
  activeStageId?: string
  projectCode?: string
  onOpenGantt: () => void
}

type DeckView = 'stack' | 'flat'

function statusTone(stage: StagePlan): string {
  if (stage.flags.includes('Rework')) return 'feedback'
  if (stage.flags.includes('PossibleDelay')) return 'risk'
  if (stage.status === 'Approved') return 'done'
  if (stage.status === 'AwaitingClient' || stage.status === 'SubmittedToClient') return 'wait'
  if (stage.status === 'InProduction') return 'active'
  return 'idle'
}

export function StageDeck({ asset, activeStageId, projectCode, onOpenGantt }: StageDeckProps) {
  /*
   * 层叠是默认视图，但保留平铺开关：一次要比对全部阶段日期时，
   * 平铺比层叠更好扫读。视图偏好只影响展示，不影响选中的阶段。
   */
  const [view, setView] = useState<DeckView>('stack')

  const stages = asset?.stages ?? []
  const activeIndex = Math.max(
    0,
    stages.findIndex((stage) => stage.id === activeStageId),
  )
  const deck = useDeckPosition(stages.length, activeIndex)
  const { goTo, setEnabled } = deck

  // 平铺视图把滚轮交回浏览器，否则横向滚动列表会滚不动
  useEffect(() => {
    setEnabled(view === 'stack')
  }, [view, setEnabled])

  // 换资产时直接落位，不要从上一个资产的位置滑过来
  useEffect(() => {
    goTo(activeIndex, true)
  }, [asset?.id, activeIndex, goTo])

  if (!asset) {
    return (
      <section className="gp-card gp-deck" aria-label="资产阶段流">
        <p className="gp-deck-empty">选中一条待办后，这里显示它所属资产的完整阶段流。</p>
      </section>
    )
  }

  const approved = stages.filter((stage) => stage.status === 'Approved').length
  const focused = stages[deck.nearestIndex]

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      deck.step(1)
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      deck.step(-1)
    }
    if (event.key === 'Home') {
      event.preventDefault()
      deck.goTo(0)
    }
    if (event.key === 'End') {
      event.preventDefault()
      deck.goTo(stages.length - 1)
    }
  }

  return (
    <section className="gp-card gp-deck" aria-label={`${asset.id} 阶段流`}>
      <header className="gp-card-head">
        <h2>
          {asset.id} · {asset.name}
          <span className="gp-deck-sub">
            {projectCode} · {asset.discipline} 制作流程
          </span>
        </h2>
        <div className="gp-deck-actions">
          <div className="gp-deck-views" role="group" aria-label="阶段流视图">
            <button
              type="button"
              className={`gp-deck-view${view === 'stack' ? ' is-active' : ''}`}
              aria-pressed={view === 'stack'}
              onClick={() => setView('stack')}
              title="层叠：突出当前阶段，前后阶段仍然可见"
            >
              层叠
            </button>
            <button
              type="button"
              className={`gp-deck-view${view === 'flat' ? ' is-active' : ''}`}
              aria-pressed={view === 'flat'}
              onClick={() => setView('flat')}
              title="平铺：一次比对全部阶段的日期与状态"
            >
              平铺
            </button>
          </div>
          <button type="button" className="gp-btn gp-btn-quiet" onClick={onOpenGantt}>
            打开项目甘特
          </button>
        </div>
      </header>

      <div
        ref={deck.viewportRef}
        className={`gp-deck-viewport is-${view}${deck.isDragging ? ' is-dragging' : ''}`}
        onPointerDown={view === 'stack' ? deck.onPointerDown : undefined}
        onPointerMove={view === 'stack' ? deck.onPointerMove : undefined}
        onPointerUp={view === 'stack' ? deck.onPointerUp : undefined}
        onPointerCancel={view === 'stack' ? deck.onPointerUp : undefined}
      >
        <ol
          className="gp-deck-track"
          tabIndex={view === 'stack' ? 0 : -1}
          onKeyDown={view === 'stack' ? onKeyDown : undefined}
          aria-label={
            view === 'stack'
              ? '阶段层叠：方向键切换，Home/End 跳到首尾'
              : '阶段列表'
          }
        >
          {stages.map((stage, index) => {
            const flags = stageFlagLabels(stage)
            const isCurrent = stage.id === activeStageId
            const isFocused = index === deck.nearestIndex

            // 层叠视图下用 CSS 变量驱动变换；平铺视图交回普通流式布局
            const style: CSSProperties =
              view === 'stack'
                ? (() => {
                    const t = cardTransform(index, deck.position, stages.length)
                    return {
                      '--card-x': `${t.x}px`,
                      '--card-y': `${t.y}px`,
                      '--card-z': `${t.z}px`,
                      '--card-rotate': `${t.rotate}deg`,
                      '--card-scale': `${t.scale}`,
                      '--card-opacity': `${t.opacity}`,
                      zIndex: t.zIndex,
                    } as CSSProperties
                  })()
                : {}

            return (
              <li
                key={stage.id}
                className={`gp-deck-card is-${statusTone(stage)}${isCurrent ? ' is-current' : ''}${
                  isFocused ? ' is-focused' : ''
                }`}
                style={style}
                aria-current={isFocused ? 'true' : undefined}
                onClick={view === 'stack' ? () => deck.goTo(index) : undefined}
              >
                <span className="gp-deck-index">阶段 {String(index + 1).padStart(2, '0')}</span>
                <strong className="gp-deck-name">{stage.name}</strong>
                <span className="gp-deck-status">{stageStatusLabel(stage)}</span>
                {flags.length > 0 && <span className="gp-deck-flags">{flags.join(' · ')}</span>}
                <span
                  className="gp-deck-dates"
                  title={`${stage.currentStart} — ${stage.currentFinish}`}
                >
                  {dateRange(stage.currentStart, stage.currentFinish)}
                </span>
                <span className="gp-deck-owner">
                  {stage.ownerName} · {stage.estimatedPersonDays} 人天
                </span>
              </li>
            )
          })}
        </ol>
      </div>

      <footer className="gp-deck-foot">
        <span>
          <strong>
            {approved}/{stages.length}
          </strong>
          阶段已获客户验收
        </span>
        {view === 'stack' && focused && (
          <span className="gp-deck-focused">
            第 {deck.nearestIndex + 1} 阶段 · {focused.name}
          </span>
        )}
        <span className="gp-deck-note">
          阶段流按当前计划日期排列；完整时间轴、基准对比与依赖关系在项目甘特中查看。
        </span>
      </footer>
    </section>
  )
}
