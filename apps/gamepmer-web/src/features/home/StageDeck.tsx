import type { Asset, StagePlan } from '../../domain/model'
import { stageFlagLabels, stageStatusLabel } from '../../domain/lookup'
import { dateRange } from '../../domain/workCalendar'

interface StageDeckProps {
  asset?: Asset
  activeStageId?: string
  projectCode?: string
  onOpenGantt: () => void
}

function statusTone(stage: StagePlan): string {
  if (stage.flags.includes('Rework')) return 'feedback'
  if (stage.flags.includes('PossibleDelay')) return 'risk'
  if (stage.status === 'Approved') return 'done'
  if (stage.status === 'AwaitingClient' || stage.status === 'SubmittedToClient') return 'wait'
  if (stage.status === 'InProduction') return 'active'
  return 'idle'
}

export function StageDeck({ asset, activeStageId, projectCode, onOpenGantt }: StageDeckProps) {
  if (!asset) {
    return (
      <section className="gp-card gp-deck" aria-label="资产阶段流">
        <p className="gp-deck-empty">选中一条待办后，这里显示它所属资产的完整阶段流。</p>
      </section>
    )
  }

  const approved = asset.stages.filter((stage) => stage.status === 'Approved').length

  return (
    <section className="gp-card gp-deck" aria-label={`${asset.id} 阶段流`}>
      <header className="gp-card-head">
        <h2>
          {asset.id} · {asset.name}
          <span className="gp-deck-sub">
            {projectCode} · {asset.discipline} 制作流程
          </span>
        </h2>
        <button type="button" className="gp-btn gp-btn-quiet" onClick={onOpenGantt}>
          打开项目甘特
        </button>
      </header>

      <ol className="gp-deck-track">
        {asset.stages.map((stage, index) => {
          const flags = stageFlagLabels(stage)
          return (
            <li
              key={stage.id}
              className={`gp-deck-card is-${statusTone(stage)}${stage.id === activeStageId ? ' is-current' : ''}`}
            >
              <span className="gp-deck-index">阶段 {String(index + 1).padStart(2, '0')}</span>
              <strong className="gp-deck-name">{stage.name}</strong>
              <span className="gp-deck-status">{stageStatusLabel(stage)}</span>
              {flags.length > 0 && <span className="gp-deck-flags">{flags.join(' · ')}</span>}
              <span className="gp-deck-dates" title={`${stage.currentStart} — ${stage.currentFinish}`}>
                {dateRange(stage.currentStart, stage.currentFinish)}
              </span>
              <span className="gp-deck-owner">
                {stage.ownerName} · {stage.estimatedPersonDays} 人天
              </span>
            </li>
          )
        })}
      </ol>

      <footer className="gp-deck-foot">
        <span>
          <strong>
            {approved}/{asset.stages.length}
          </strong>
          阶段已获客户验收
        </span>
        <span className="gp-deck-note">
          阶段流按当前计划日期排列；完整时间轴、基准对比与依赖关系在项目甘特中查看。
        </span>
      </footer>
    </section>
  )
}
