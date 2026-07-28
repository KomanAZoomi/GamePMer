import type { DemoState } from '../../domain/model'
import { findFeedbackItem, findStage, groupName, stageFlagLabels, stageStatusLabel } from '../../domain/lookup'
import { dateRange, shortDate } from '../../domain/workCalendar'
import type { WorkItem } from '../../domain/workItems'

interface SmartDetailProps {
  state: DemoState
  item?: WorkItem
  onOpenSource: (route: 'feedback' | 'schedule' | 'closeout') => void
}

export function SmartDetail({ state, item, onOpenSource }: SmartDetailProps) {
  if (!item) {
    return (
      <section className="gp-card gp-detail" aria-label="智能详情">
        <p className="gp-deck-empty">选中左侧任一待办查看详情。</p>
      </section>
    )
  }

  const feedback = item.sourceKind === 'feedback' ? findFeedbackItem(state, item.sourceId) : undefined
  const stage = item.stageId ? findStage(state, item.stageId) : undefined

  return (
    <section className="gp-card gp-detail" aria-label="智能详情">
      <div className="gp-detail-kicker">智能详情</div>
      <div className="gp-detail-id">
        {feedback ? `${feedback.batch.id} / ` : ''}
        {item.projectCode}
        {item.assetId ? ` / ${item.assetId}` : ''}
      </div>
      <h2 className="gp-detail-title">{feedback?.item.title ?? item.title}</h2>

      <div className="gp-pill-row">
        <span className={`gp-pill ${feedback ? 'is-feedback' : 'is-plan'}`}>
          {feedback ? '客户反馈' : '排期事项'}
        </span>
        {item.priority === 'high' && <span className="gp-pill is-risk">高优先级</span>}
        {stage && <span className="gp-pill is-plain">{stageStatusLabel(stage)}</span>}
        {stage &&
          stageFlagLabels(stage).map((flag) => (
            <span key={flag} className="gp-pill is-flag">
              {flag}
            </span>
          ))}
      </div>

      <p className="gp-detail-reason">{item.reason}</p>

      <dl className="gp-detail-grid">
        {stage && (
          <>
            <div>
              <dt>负责人</dt>
              <dd>{stage.ownerName}</dd>
            </div>
            <div>
              <dt>制作组</dt>
              <dd>{groupName(state, stage.productionGroupId)}</dd>
            </div>
            <div>
              <dt>基准排期</dt>
              <dd title={`${stage.baselineStart} — ${stage.baselineFinish}`}>
                {dateRange(stage.baselineStart, stage.baselineFinish)}
              </dd>
            </div>
            <div className={stage.currentStart !== stage.baselineStart ? 'is-changed' : undefined}>
              <dt>当前排期</dt>
              <dd title={`${stage.currentStart} — ${stage.currentFinish}`}>
                {dateRange(stage.currentStart, stage.currentFinish)}
                {stage.currentStart !== stage.baselineStart && ' · 已修订'}
              </dd>
            </div>
            <div>
              <dt>实际进度</dt>
              <dd>
                {stage.actualStart
                  ? `${shortDate(stage.actualStart)} 开工${stage.actualFinish ? ` · ${shortDate(stage.actualFinish)} 完成` : ' · 未完成'}`
                  : '尚未开始'}
              </dd>
            </div>
            <div>
              <dt>提交客户</dt>
              <dd>{stage.submittedToClientAt ? shortDate(stage.submittedToClientAt) : '未提交'}</dd>
            </div>
          </>
        )}
        {feedback && (
          <>
            <div>
              <dt>预计返修</dt>
              <dd>{feedback.item.estimatedReworkDays} 个工作日</dd>
            </div>
            <div>
              <dt>反馈盘</dt>
              <dd className="gp-path">{feedback.batch.feedbackDrivePath}</dd>
            </div>
          </>
        )}
      </dl>

      {feedback && (
        <div className="gp-evidence">
          <h3>原始证据</h3>
          <ul>
            {feedback.batch.evidence.map((evidence) => (
              <li key={evidence.id}>
                <span className="gp-evidence-kind">{evidence.label}</span>
                <span className="gp-path">{evidence.locator}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {feedback?.item.aiSuggestion && (
        <div className="gp-assistant">
          <h3>AI 判断依据</h3>
          <p>
            建议归类为
            <strong>
              {feedback.item.aiSuggestion.scope === 'in-scope' ? '范围内返修' : '范围外追加'}
            </strong>
            ：{feedback.item.aiSuggestion.rationale}
          </p>
          <p className="gp-assistant-note">建议未执行。范围判定、排期修改和通知发送都需要 PM 确认。</p>
        </div>
      )}

      <div className="gp-detail-actions">
        {/* 工作台不打开网络盘，也不代开邮件客户端——能做的是把路径交到你手上 */}
        <button
          type="button"
          className="gp-btn gp-btn-quiet"
          disabled={!feedback}
          title={
            feedback
              ? '复制原始邮件主题与反馈盘路径，到 Outlook 或资源管理器里打开'
              : '该待办没有关联的外部来源证据'
          }
          onClick={() => {
            if (!feedback) return
            const text = feedback.batch.evidence
              .map((evidence) => `${evidence.label}：${evidence.locator}`)
              .join('\n')
            navigator.clipboard?.writeText(text).catch(() => undefined)
          }}
        >
          复制来源路径
        </button>
        <button
          type="button"
          className="gp-btn gp-btn-primary"
          onClick={() =>
            onOpenSource(
              item.sourceKind === 'feedback'
                ? 'feedback'
                : item.sourceKind === 'closeout'
                  ? 'closeout'
                  : 'schedule',
            )
          }
        >
          {item.sourceKind === 'feedback' ? '处理反馈' : '查看排期'}
        </button>
      </div>
    </section>
  )
}
