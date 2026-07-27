import { useMemo, useState } from 'react'
import type { RouteKey } from '../../app/navigation'
import { groupName } from '../../domain/lookup'
import type { FeedbackBatch, FeedbackItem } from '../../domain/model'
import { untouchedAssets } from '../../domain/replan'
import { EMPTY_CALENDAR, countWorkdays, dateRange } from '../../domain/workCalendar'
import type { WorkspaceState, WorkspaceStore } from '../workspace/workspaceStore'
import { DraftPreview } from './DraftPreview'

interface FeedbackPageProps {
  workspace: WorkspaceState
  store: WorkspaceStore
  onNavigate: (route: RouteKey) => void
}

const SCOPE_LABELS: Record<FeedbackItem['scope'], string> = {
  'in-scope': '范围内返修',
  'out-of-scope': '范围外追加',
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

  const batch: FeedbackBatch | undefined = demo.feedbackBatches[0]
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

  const notifications = demo.notificationDrafts.filter(
    (item) => item.sourceKind === 'schedule-revision',
  )

  if (!batch || !selected) {
    return (
      <div className="gp-placeholder">
        <div className="gp-card gp-placeholder-card">
          <h1>反馈中心</h1>
          <p>当前没有客户反馈批次。恢复示例数据后可查看 F-017 的主路径。</p>
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

      <div className="gp-feedback-body">
        <aside className="gp-card gp-batch-list" aria-label="反馈批次">
          <header className="gp-card-head">
            <h2>反馈批次</h2>
            <span className="gp-count">{demo.feedbackBatches.length}</span>
          </header>
          {demo.feedbackBatches.map((entry) => (
            <div key={entry.id} className="gp-batch-card is-active">
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
            </div>
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
            <section className="gp-notifications" aria-label="通知草稿">
              <h3>通知草稿 · 未发送</h3>
              {notifications.map((item) => (
                <article key={item.id} className="gp-notification">
                  <header>
                    <strong>{item.subject}</strong>
                    <span className="gp-pill is-flag">{item.status === 'draft' ? '草稿' : '已发送'}</span>
                  </header>
                  <p className="gp-notification-to">
                    收件人：{item.recipientName}（{item.recipientRole}）
                  </p>
                  <pre className="gp-notification-body">{item.body}</pre>
                  <p className="gp-notification-note">
                    生成草稿不等于发送。发送需要 PM 主动执行，系统不会自动发信。
                  </p>
                </article>
              ))}
            </section>
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
                受影响资产冻结在「等待变更报价」，其余资产继续制作。追加报价、复核与变更开工在报价与变更模块（本轮之后的切片 5）。
              </p>
            </div>
          )}

          <div className="gp-detail-actions gp-feedback-actions">
            {selected.status === 'NeedsClassification' ? (
              <>
                <button
                  type="button"
                  className="gp-btn"
                  onClick={() => store.classifyFeedback(selected.id, 'out-of-scope')}
                >
                  判为范围外
                </button>
                <button
                  type="button"
                  className="gp-btn gp-btn-primary"
                  onClick={() => store.classifyFeedback(selected.id, 'in-scope')}
                >
                  判为范围内
                </button>
              </>
            ) : selected.scope === 'in-scope' && selected.status === 'Confirmed' ? (
              <button
                type="button"
                className="gp-btn gp-btn-primary"
                onClick={() => store.startReplan(selected.id)}
                disabled={Boolean(draft)}
              >
                {draft ? '草案已生成' : '生成排期草案'}
              </button>
            ) : (
              <button type="button" className="gp-btn" onClick={() => onNavigate('projects')}>
                查看项目甘特
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
