import { useMemo, useState } from 'react'
import type { RouteKey } from '../../app/navigation'
import { groupName } from '../../domain/lookup'
import type { FeedbackBatch, FeedbackItem } from '../../domain/model'
import {
  FEEDBACK_NEXT_STOP,
  activeRevisionFor,
  revisionNotified,
  stageFeedbackSummary,
  untouchedAssets,
} from '../../domain/replan'
import { EMPTY_CALENDAR, countWorkdays, dateRange } from '../../domain/workCalendar'
import type { WorkspaceState, WorkspaceStore } from '../workspace/workspaceStore'
import { StageFlowActions } from '../stageflow/StageFlowActions'
import { DraftPreview } from './DraftPreview'
import { WaitingBoardView } from './WaitingBoard'
import { NotificationList } from './NotificationList'

interface FeedbackPageProps {
  workspace: WorkspaceState
  store: WorkspaceStore
  onNavigate: (route: RouteKey) => void
}

const SCOPE_LABELS: Record<FeedbackItem['scope'], string> = {
  'in-scope': '范围内返修',
  'out-of-scope': '范围外追加',
  'no-change': '无需修改',
  unclassified: '待分流',
}

const STATUS_LABELS: Record<FeedbackItem['status'], string> = {
  NeedsClassification: '待分流',
  Confirmed: '已判定范围内',
  InRework: '返修中',
  WaitingChangeQuote: '等待变更报价',
  Resubmitted: '已重提',
  Closed: '已关闭',
}

export function FeedbackPage({ workspace, store, onNavigate }: FeedbackPageProps) {
  const { demo, today, draft, selectedFeedbackItemId } = workspace
  const calendar = demo.calendars[0] ?? EMPTY_CALENDAR
  const [note, setNote] = useState('')

  /**
   * 批次跟着选中的反馈项走。
   *
   * 这里原来写死 `feedbackBatches[0]`——于是第二个批次永远看不到，
   * 从别处（收件箱确认、阶段返修）新建的批次也打不开。
   */
  const batch: FeedbackBatch | undefined =
    demo.feedbackBatches.find((entry) =>
      entry.items.some((item) => item.id === selectedFeedbackItemId),
    ) ?? demo.feedbackBatches[0]
  const selected =
    batch?.items.find((item) => item.id === selectedFeedbackItemId) ?? batch?.items[0]

  const project = demo.projects.find((item) => item.code === batch?.projectCode)
  const asset = project?.assets.find((item) => item.id === selected?.assetId)
  const stage = asset?.stages.find((item) => item.id === selected?.stageId)

  const pending = batch?.items.filter((item) => item.status === 'NeedsClassification').length ?? 0
  const changeRequest = demo.changeRequests.find(
    (item) => item.sourceFeedbackItemId === selected?.id,
  )

  const untouched = useMemo(
    () => (draft ? untouchedAssets(demo, draft) : []),
    [demo, draft],
  )

  const stageSummary = stageFeedbackSummary(demo, selected?.stageId ?? '')
  const activeRevision = selected ? activeRevisionFor(demo, selected.id) : undefined
  const notified = activeRevision ? revisionNotified(demo, activeRevision.id) : false

  const notifications = demo.notificationDrafts.filter(
    (item) => item.sourceKind === 'schedule-revision',
  )

  const boardView = (
    <WaitingBoardView
      demo={demo}
      today={today}
      onSelectFeedbackItem={store.selectFeedbackItem}
      onSelectStage={store.selectStage}
      onMarkSent={store.markNotificationSent}
      onAdvance={store.advanceStage}
      onNavigate={onNavigate}
    />
  )

  if (!batch || !selected) {
    return (
      <div className="gp-feedback">
        <header className="gp-page-head">
          <div>
            <h1>反馈中心</h1>
            <p>现在在等谁 · 资产提交后的反复循环 · {today}</p>
          </div>
        </header>
        {boardView}
        <div className="gp-card gp-placeholder-card">
          <p>当前没有客户反馈批次。看板会在资产提交后自动出现卡片。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="gp-feedback">
      <header className="gp-page-head">
        <div>
          <h1>反馈中心</h1>
          <p>
            批次归档 · 资产拆分 · 范围判断 · 返修重排 · {today} · 待处理 {pending} 项
          </p>
        </div>
        <div className="gp-chip-row">
          <button type="button" className="gp-chip" onClick={() => onNavigate('projects')}>
            项目甘特
          </button>
          <button type="button" className="gp-chip" onClick={() => onNavigate('schedule')}>
            排期管理
          </button>
        </div>
      </header>

      {boardView}

      <div className="gp-feedback-body">
        <aside className="gp-card gp-batch-list" aria-label="反馈批次">
          <header className="gp-card-head">
            <h2>反馈批次</h2>
            <span className="gp-count">{demo.feedbackBatches.length}</span>
          </header>
          {demo.feedbackBatches.map((entry) => (
            // 每张卡都写死 is-active 时，看起来全都选中了，而且哪张都点不动
            <button
              key={entry.id}
              type="button"
              className={`gp-batch-card${entry.id === batch?.id ? ' is-active' : ''}`}
              onClick={() => store.selectFeedbackItem(entry.items[0]?.id ?? '')}
            >
              <div className="gp-batch-head">
                <strong>{entry.id}</strong>
                <span className="gp-pill is-feedback">
                  {entry.items.some((item) => item.status === 'NeedsClassification')
                    ? '等待 PM 确认分流'
                    : '已分流'}
                </span>
              </div>
              <p className="gp-batch-meta">
                {entry.projectCode} · {entry.client}
              </p>
              <p className="gp-batch-meta">
                {entry.receivedAt.slice(0, 16).replace('T', ' ')} · {entry.items.length} 项修改
              </p>
              <p className="gp-batch-summary">{entry.summary}</p>
              <p className="gp-batch-path gp-path">{entry.feedbackDrivePath}</p>
              <p className="gp-batch-meta">
                客户等待归因 {entry.clientWaitWorkdays} 个工作日（与团队延期分开统计）
              </p>
            </button>
          ))}
        </aside>

        <section className="gp-card gp-item-list" aria-label="资产级反馈项">
          <header className="gp-card-head">
            <h2>
              {batch.id} · 资产级反馈项
              <span className="gp-deck-sub">
                一次反馈拆成多项，每项各自判定范围——同一批次可以走两条不同路径
              </span>
            </h2>
            <span className="gp-count">{batch.items.length}</span>
          </header>

          {/*
            表格自己横向滚动。七列在 1280 的中栏里放不下，
            靠单元格换行挤进去的结果是「MECH-01 / 3D_HIGH」拆成三行、
            「处理状态」被切掉一半——看着乱，而且真读不到。
          */}
          <div className="gp-table-scroll">
            <table className="gp-item-table">
            <thead>
              <tr>
                <th>序号</th>
                <th>资产 / 阶段</th>
                <th>修改内容</th>
                <th>范围判断</th>
                <th>负责人</th>
                <th>预估</th>
                <th>处理状态</th>
              </tr>
            </thead>
            <tbody>
              {batch.items.map((item, index) => (
                <tr
                  key={item.id}
                  className={item.id === selected.id ? 'is-active' : undefined}
                  onClick={() => store.selectFeedbackItem(item.id)}
                >
                  <td>{String(index + 1).padStart(2, '0')}</td>
                  <td>
                    {item.assetId} / {item.stageId.split('/')[1]}
                  </td>
                  <td className="gp-item-title">
                    <button type="button" onClick={() => store.selectFeedbackItem(item.id)}>
                      {item.title}
                    </button>
                  </td>
                  <td>
                    <span
                      className={`gp-pill ${
                        item.scope === 'in-scope'
                          ? 'is-plan'
                          : item.scope === 'out-of-scope'
                            ? 'is-feedback'
                            : item.scope === 'no-change'
                              ? 'is-no-change'
                              : 'is-plain'
                      }`}
                    >
                      {SCOPE_LABELS[item.scope]}
                    </span>
                  </td>
                  <td>{item.ownerName}</td>
                  <td>{item.estimatedReworkDays} 工作日</td>
                  <td>{STATUS_LABELS[item.status]}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>

          {draft && (
            <DraftPreview
              state={demo}
              draft={draft}
              untouchedAssets={untouched}
              note={note}
              onNoteChange={setNote}
              onMove={store.moveDraft}
              onCancel={() => {
                store.cancelDraft()
                setNote('')
              }}
              onConfirm={() => {
                store.confirmDraft(note || '客户反馈引起的返修重排')
                setNote('')
              }}
            />
          )}

          {notifications.length > 0 && (
            <NotificationList
              notifications={notifications}
              onMarkSent={store.markNotificationSent}
              onUnmark={store.unmarkNotificationSent}
            />
          )}
        </section>

        <aside className="gp-card gp-item-detail" aria-label="反馈项详情">
          <div className="gp-detail-kicker">反馈项详情</div>
          <div className="gp-detail-id">
            {batch.id} / {selected.id.split('/')[1]}
          </div>
          <h2 className="gp-detail-title">{selected.title}</h2>

          <div className="gp-pill-row">
            <span
              className={`gp-pill ${selected.scope === 'unclassified' ? 'is-plain' : selected.scope === 'in-scope' ? 'is-plan' : 'is-feedback'}`}
            >
              {SCOPE_LABELS[selected.scope]}
            </span>
            <span className="gp-pill is-plain">{STATUS_LABELS[selected.status]}</span>
          </div>

          <p className="gp-detail-reason">{selected.originalText}</p>

          <dl className="gp-detail-grid">
            <div>
              <dt>关联项目</dt>
              <dd>{batch.projectCode}</dd>
            </div>
            <div>
              <dt>资产 / 阶段</dt>
              <dd>
                {selected.assetId} / {stage?.name}
              </dd>
            </div>
            <div>
              <dt>制作组</dt>
              <dd>{stage ? groupName(demo, stage.productionGroupId) : '—'}</dd>
            </div>
            <div>
              <dt>修改负责人</dt>
              <dd>{selected.ownerName}</dd>
            </div>
            <div>
              <dt>预计返修</dt>
              <dd>{selected.estimatedReworkDays} 个工作日</dd>
            </div>
            <div>
              <dt>影响节点</dt>
              <dd>
                {asset
                  ? asset.stages.filter(
                      (item) =>
                        item.status !== 'Approved' &&
                        asset.stages.indexOf(item) >= asset.stages.findIndex((s) => s.id === selected.stageId),
                    ).length
                  : 0}{' '}
                项
              </dd>
            </div>
          </dl>

          <div className="gp-evidence">
            <h3>原始证据</h3>
            <ul>
              {batch.evidence.map((evidence) => (
                <li key={evidence.id}>
                  <span className="gp-evidence-kind">{evidence.label}</span>
                  <span className="gp-path">{evidence.locator}</span>
                </li>
              ))}
            </ul>
          </div>

          {selected.aiSuggestion && (
            <div className="gp-assistant">
              <h3>AI 判断依据</h3>
              <p>
                建议归类为
                <strong>{SCOPE_LABELS[selected.aiSuggestion.scope]}</strong>：
                {selected.aiSuggestion.rationale}
              </p>
              <p className="gp-assistant-note">
                建议未执行。范围判定必须由 PM 做出，AI 不会自动分流、自动改排期或自动发信。
              </p>
            </div>
          )}

          {stage && (
            <div className="gp-evidence">
              <h3>当前排期</h3>
              <p className="gp-inspector-text">
                基准 {dateRange(stage.baselineStart, stage.baselineFinish)} · 当前{' '}
                {dateRange(stage.currentStart, stage.currentFinish)}
                {stage.submittedToClientAt &&
                  ` · 已提交客户 ${stage.submittedToClientAt}，等待 ${Math.max(0, countWorkdays(stage.submittedToClientAt, today, calendar) - 1)} 个工作日`}
              </p>
            </div>
          )}

          {changeRequest && (
            <div className="gp-assistant">
              <h3>已创建变更单</h3>
              <p className="gp-inspector-text">
                <strong>{changeRequest.id}</strong> · {changeRequest.title}
              </p>
              <p className="gp-assistant-note">
                受影响资产冻结在「等待变更报价」，其余资产继续制作。追加报价、复核与变更开工去<strong>报价与变更</strong>办。
              </p>
            </div>
          )}

          <div className="gp-detail-actions gp-feedback-actions">
            {selected.status === 'NeedsClassification' ? (
              <>
                {/*
                  三条路，不是两条。一批反馈里常夹着「这个可以」「没问题」——
                  它既不返修也不追加报价。只给范围内/范围外，等于逼 PM
                  往正式数据里塞一条假的返修或一张假的变更单。
                */}
                <button
                  type="button"
                  className="gp-btn gp-btn-primary gp-btn-wide"
                  onClick={() => store.classifyFeedback(selected.id, 'in-scope')}
                >
                  判为范围内
                </button>
                <button
                  type="button"
                  className="gp-btn"
                  onClick={() => store.classifyFeedback(selected.id, 'out-of-scope')}
                >
                  判为范围外
                </button>
                <button
                  type="button"
                  className="gp-btn"
                  onClick={() => store.classifyFeedback(selected.id, 'no-change')}
                >
                  无需修改 · 直接了结
                </button>
              </>
            ) : selected.status === 'Confirmed' || selected.status === 'WaitingChangeQuote' ? (
              <>
                <button
                  type="button"
                  className="gp-btn"
                  onClick={() => store.reclassifyFeedback(selected.id)}
                >
                  重新判定
                </button>
                {selected.scope === 'in-scope' ? (
                  <button
                    type="button"
                    className="gp-btn gp-btn-primary"
                    onClick={() => store.startReplan(selected.id)}
                    disabled={Boolean(draft)}
                  >
                    {draft ? '草案已生成' : '生成排期草案'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="gp-btn gp-btn-primary"
                    onClick={() => onNavigate('quotation')}
                  >
                    去追加报价
                  </button>
                )}
              </>
            ) : selected.status === 'Closed' && selected.scope === 'no-change' ? (
              <button
                type="button"
                className="gp-btn"
                onClick={() => store.reclassifyFeedback(selected.id)}
              >
                重新判定
              </button>
            ) : (
              <button type="button" className="gp-btn" onClick={() => onNavigate('projects')}>
                查看项目甘特
              </button>
            )}
          </div>

          {/*
            阶段上的反馈全部了结之后，下一步是请客户验收这个阶段——
            那才是「流转到下一阶段」的真正动作。以前它只藏在项目总览的阶段推进里，
            PM 在反馈中心判完最后一条，页面却不说接下来该去哪。
          */}
          {stageSummary.total > 0 && (
            <div className={`gp-stage-settle${stageSummary.allSettled ? ' is-ready' : ''}`}>
              {stageSummary.allSettled ? (
                <>
                  <p>
                    <strong>{stage?.name ?? selected.stageId}</strong> 上的 {stageSummary.total}{' '}
                    条反馈已全部了结。下一步是请客户验收这个阶段——
                    <strong>验收通过后，依赖它的下一阶段才能开工</strong>。
                  </p>
                </>
              ) : (
                <>
                  <p>
                    {stage?.name ?? selected.stageId} 上还有 <strong>{stageSummary.open}</strong>{' '}
                    条反馈没了结，全部了结后才谈得上请客户验收这个阶段。
                  </p>
                  {/*
                    只说「还剩 1 条」是死路——反馈项不是在这里手工勾完成的，
                    InRework / Resubmitted 的出口都在阶段推进上。这里把
                    「卡在哪」翻译成「去哪办」。
                  */}
                  <ul className="gp-settle-blockers" aria-label="反馈了结卡点">
                    {stageSummary.blocking.map(({ status, count }) => {
                      const stop = FEEDBACK_NEXT_STOP[status as Exclude<typeof status, 'Closed'>]
                      return (
                        <li key={status}>
                          <strong>
                            {count} 条{stop.label}
                          </strong>
                          <span>
                            → {stop.where === '本页' ? '就在这一页' : stop.where}·{stop.action}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </div>
          )}

          {/*
            阶段推进直接放在反馈卡片上，和项目总览共用同一个组件。
            一条反馈的处理不该被切成两页：判完范围、确认排期，接着就是
            「交 PM → 提交客户 → 等二次反馈」，中途跳页只会让人丢掉上下文。
          */}
          {stage && (
            <StageFlowActions
              state={demo}
              stage={stage}
              onAdvance={store.advanceStage}
              onOpenTriage={() => undefined}
              title="推进这条反馈所在阶段"
              note={
                <p className="gp-assistant-note">
                  推进只写实际发生的日期，<strong>不改计划、不改基准</strong>。
                  「已提交客户」= 这条反馈已重提，接下来等客户二次反馈；客户点头才算了结。
                </p>
              }
            />
          )}

          {(selected.status === 'Confirmed' || selected.status === 'WaitingChangeQuote') && (
            <p className="gp-reclassify-note">
              判错了可以「重新判定」退回待分流
              {selected.scope === 'out-of-scope' && '，变更单与冻结标记会一并撤销'}。
            </p>
          )}

          {selected.status === 'InRework' && activeRevision && (
            <div className="gp-revoke-box">
              <p>
                已确认排期修订 <strong>v{activeRevision.version}</strong>。
                {notified
                  ? '通知已被标记为发出，团队可能已按新排期安排——要调整请走一次新的修订，而不是撤销这一次。'
                  : '通知还没发出去，外面没人知道这次修订，可以整个撤销。'}
              </p>
              {!notified && (
                <button
                  type="button"
                  className="gp-btn"
                  onClick={() => store.revokeRevision(activeRevision.id)}
                >
                  撤销修订并退回待分流
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
