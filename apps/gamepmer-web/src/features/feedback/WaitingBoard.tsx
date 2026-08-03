import type { RouteKey } from '../../app/navigation'
import type { DemoState } from '../../domain/model'
import { type WaitingCard, type WaitingOn, waitingBoard } from '../../domain/waitingBoard'

interface WaitingBoardViewProps {
  demo: DemoState
  today: string
  onSelectFeedbackItem: (itemId: string) => void
  onSelectStage: (stageId: string) => void
  onMarkSent: (notificationId: string, via: string) => void
  onAdvance: (stageId: string, action: 'submit-to-client') => void
  onNavigate: (route: RouteKey) => void
}

const COLUMNS: { key: WaitingOn; title: string; hint: string }[] = [
  { key: 'me', title: '等我处理', hint: '今天能动的活都在这一栏' },
  { key: 'team', title: '等团队提交', hint: '球在制作组那边' },
  { key: 'client', title: '等客户反馈', hint: '球在客户那边，等待单独归因' },
]

/**
 * 「现在在等谁」看板。
 *
 * 一个阶段反复走这条循环：等团队做 → 交我 → 我提交客户 → 等客户回话 →
 * 我判范围定排期 → 我把返修发给团队 → 又回到等团队。客户验收通过才离场。
 *
 * 三栏都从排期和反馈**推导**，不存第四份状态——存了迟早和甘特对不上，
 * 而 PM 会信错的那一份。「等我」单独一栏，是因为另外两栏干着急没用。
 */
export function WaitingBoardView({
  demo,
  today,
  onSelectFeedbackItem,
  onSelectStage,
  onMarkSent,
  onAdvance,
  onNavigate,
}: WaitingBoardViewProps) {
  const board = waitingBoard(demo, today)
  const buckets = { me: board.me, team: board.team, client: board.client }

  return (
    <section className="gp-card gp-waiting-board" aria-label="在等谁看板">
      <header className="gp-card-head">
        <h2>
          现在在等谁
          <span className="gp-deck-sub">
            资产提交后就进入这条循环：等团队 → 交我 → 等客户 → 我判范围发返修 → 又回到等团队。
            客户验收通过才离场。
          </span>
        </h2>
        <span className="gp-count">{board.me.length + board.team.length + board.client.length}</span>
      </header>

      <div className="gp-board-columns">
        {COLUMNS.map((column) => {
          const cards = buckets[column.key]
          return (
            <div
              key={column.key}
              className={`gp-board-column is-${column.key}`}
              aria-label={column.title}
            >
              <header>
                <h3>
                  {column.title}
                  <span className="gp-board-count">{cards.length}</span>
                </h3>
                <p>{column.hint}</p>
              </header>

              {cards.length === 0 ? (
                <p className="gp-board-empty">
                  {column.key === 'me' ? '没有等我处理的事。' : '这一栏是空的。'}
                </p>
              ) : (
                cards.map((card) => (
                  <BoardCard
                    key={card.id}
                    card={card}
                    onSelectFeedbackItem={onSelectFeedbackItem}
                    onSelectStage={onSelectStage}
                    onMarkSent={onMarkSent}
                    onAdvance={onAdvance}
                    onNavigate={onNavigate}
                  />
                ))
              )}
            </div>
          )
        })}
      </div>

      <footer className="gp-board-foot">
        <span>
          已验收离场 <strong>{board.approved}</strong> 个阶段
        </span>
        {board.readyForCloseout.length > 0 ? (
          <>
            <span className="gp-board-ready">
              <strong>{board.readyForCloseout.join('、')}</strong> 全部资产已验收，可以进结项
            </span>
            <button
              type="button"
              className="gp-btn gp-btn-primary gp-btn-sm"
              onClick={() => onNavigate('closeout')}
            >
              去结项中心
            </button>
          </>
        ) : (
          <span className="gp-board-hint">
            一个项目的阶段全部验收后，结项中心第一道门「全部资产验收」自动亮——
            那是事实推导的，不用手工打勾。
          </span>
        )}
      </footer>
    </section>
  )
}

function BoardCard({
  card,
  onSelectFeedbackItem,
  onSelectStage,
  onMarkSent,
  onAdvance,
  onNavigate,
}: {
  card: WaitingCard
} & Omit<WaitingBoardViewProps, 'demo' | 'today'>) {
  return (
    <article className={`gp-board-card is-${card.kind}`}>
      <header>
        <strong>{card.stageName}</strong>
        <span className="gp-board-project">{card.projectCode}</span>
      </header>
      <p className="gp-board-headline">{card.headline}</p>
      <p className="gp-board-detail">{card.detail}</p>

      <p className="gp-board-meta">
        计划完成 {card.plannedFinish}
        {card.waitedWorkdays > 0 && ` · 已等 ${card.waitedWorkdays} 个工作日`}
      </p>

      {card.warnings.map((warning) => (
        <p key={warning} className="gp-board-warning">
          {warning}
        </p>
      ))}

      <div className="gp-board-actions">
        {/*
          卡片上只放这一步真正该做的动作。摆一排「万一要用」的按钮，
          等于让人每次都先想一遍哪个是对的。
        */}
        {card.kind === 'triage' && card.sourceId && (
          <button
            type="button"
            className="gp-btn gp-btn-sm gp-btn-primary"
            onClick={() => onSelectFeedbackItem(card.sourceId!)}
          >
            去判范围
          </button>
        )}
        {card.kind === 'send-rework' && card.sourceId && (
          <button
            type="button"
            className="gp-btn gp-btn-sm gp-btn-primary"
            onClick={() => {
              // 组长和艺术总监各一封，只标一封等于没发全，卡片会赖在「等我」不走
              for (const id of card.relatedIds ?? [card.sourceId!]) {
                onMarkSent(id, '公司邮件系统（Outlook）')
              }
            }}
          >
            反馈已发给团队
          </button>
        )}
        {card.kind === 'hand-to-client' && (
          <button
            type="button"
            className="gp-btn gp-btn-sm gp-btn-primary"
            onClick={() => onAdvance(card.stageId, 'submit-to-client')}
          >
            已提交客户
          </button>
        )}
        <button
          type="button"
          className="gp-btn gp-btn-sm gp-btn-quiet"
          onClick={() => {
            onSelectStage(card.stageId)
            onNavigate('projects')
          }}
        >
          看排期
        </button>
      </div>
    </article>
  )
}
