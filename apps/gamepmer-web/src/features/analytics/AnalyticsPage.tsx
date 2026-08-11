import { useMemo, useState } from 'react'
import type { RouteKey } from '../../app/navigation'
import {
  DELAY_CAUSE_LABEL,
  INSIGHT_KIND_LABEL,
  INSIGHT_KIND_NOTE,
  METRIC_DEFINITION,
  delayAttribution,
  deliveryMetrics,
  estimateAccuracy,
  insights,
  projectHealth,
  stageOutcomes,
  type DelayCause,
  type Insight,
} from '../../domain/analytics'
import { VERDICT_LABEL, dispositionIssues } from '../../domain/insightDisposition'
import { activeProjects } from '../../domain/lookup'
import type { DemoState } from '../../domain/model'
import { capacityMatrix, weekStartsFrom } from '../../domain/capacity'
import { QUOTE_KIND_LABEL, QUOTE_STATUS_LABEL, activeVersion, quoteTotals } from '../../domain/quotation'
import { EMPTY_CALENDAR, monthDayLabel } from '../../domain/workCalendar'
import type { WorkspaceState, WorkspaceStore } from '../workspace/workspaceStore'

/**
 * 一张洞察卡。
 *
 * 卡点型和结论型长得不一样，是刻意的：
 * 卡点型不给处置按钮——给了会让人以为「点一下就算办了」，而它其实要去对应模块把事做掉。
 */
function InsightCard({
  hint,
  demo,
  today,
  onDispose,
}: {
  hint: Insight
  demo: DemoState
  today: string
  onDispose: WorkspaceStore['disposeInsight']
}) {
  const [deferring, setDeferring] = useState(false)
  const [reason, setReason] = useState('')

  // 校验用的是领域层同一个函数，界面不另写一份「理由不能为空」的判断
  const issues = deferring
    ? dispositionIssues(demo, {
        insightId: hint.id,
        verdict: 'deferred',
        reason,
        actor: 'Brandon',
        now: today,
      })
    : []

  function dispose(verdict: 'adopted' | 'deferred') {
    onDispose({ insightId: hint.id, verdict, reason: verdict === 'deferred' ? reason : undefined })
    setDeferring(false)
    setReason('')
  }

  return (
    <article className={`gp-insight is-${hint.severity}`}>
      <div className="gp-insight-head">
        <span className={`gp-insight-kind is-${hint.kind}`}>{INSIGHT_KIND_LABEL[hint.kind]}</span>
        <strong>{hint.title}</strong>
      </div>
      <p>{hint.body}</p>
      <span className="gp-insight-evidence">依据：{hint.evidence}</span>
      <span className="gp-insight-kind-note">{INSIGHT_KIND_NOTE[hint.kind]}</span>

      {/*
        这个标签**不是一个会翻转的状态**，是「工作台不会替你做」的承诺——
        即使你照着建议做完了它也不变。PM 的态度记在下面的处置里，两件事别混。
      */}
      <span className="gp-insight-tag">仅建议 · 工作台不代做</span>

      {hint.kind === 'finding' && (
        <div className="gp-insight-dispose">
          {hint.disposition && (
            <p className="gp-insight-verdict">
              <b>{VERDICT_LABEL[hint.disposition.verdict]}</b>
              <span>
                {/* 时钟给的是完整 ISO 时间戳，界面只要日期——与其他页面一致 */}
                {hint.disposition.at.slice(0, 10)} · {hint.disposition.actor}
              </span>
              {hint.disposition.reason && <em>理由：{hint.disposition.reason}</em>}
            </p>
          )}

          {deferring ? (
            <>
              <label className="gp-visually-hidden" htmlFor={`reason-${hint.id}`}>
                暂不采纳的理由
              </label>
              <textarea
                id={`reason-${hint.id}`}
                className="gp-input gp-insight-reason"
                rows={2}
                placeholder="为什么这次不改？下次这条结论还会原样冒出来，写一句省得重新讨论"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              {issues.length > 0 && <p className="gp-insight-issue">{issues[0]}</p>}
              <div className="gp-insight-actions">
                <button
                  type="button"
                  className="gp-btn gp-btn-sm gp-btn-primary"
                  disabled={issues.length > 0}
                  title={issues[0]}
                  onClick={() => dispose('deferred')}
                >
                  记下不采纳
                </button>
                <button
                  type="button"
                  className="gp-btn gp-btn-sm"
                  onClick={() => {
                    setDeferring(false)
                    setReason('')
                  }}
                >
                  取消
                </button>
              </div>
            </>
          ) : (
            <div className="gp-insight-actions">
              <button
                type="button"
                className="gp-btn gp-btn-sm"
                onClick={() => dispose('adopted')}
                title="只记录你认这个结论、会去做；工作台不会替你改报价模板或排期"
              >
                {hint.disposition ? '改为采纳' : '采纳'}
              </button>
              <button type="button" className="gp-btn gp-btn-sm" onClick={() => setDeferring(true)}>
                {hint.disposition ? '改为暂不采纳' : '暂不采纳'}
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

interface AnalyticsPageProps {
  workspace: WorkspaceState
  store: WorkspaceStore
  onNavigate: (route: RouteKey) => void
}

type Tab = 'delivery' | 'attribution' | 'capacity' | 'quote'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'delivery', label: '交付表现' },
  { key: 'attribution', label: '延期归因' },
  { key: 'capacity', label: '产能与负载' },
  { key: 'quote', label: '报价与变更' },
]

const CAUSE_ORDER: DelayCause[] = ['client-wait', 'rework', 'team-delay', 'dependency']

const pct = (value: number) => `${Math.round(value * 100)}%`
const money = (value: number) => `¥ ${value.toLocaleString('zh-CN')}`

export function AnalyticsPage({ workspace, store, onNavigate }: AnalyticsPageProps) {
  const { demo, today } = workspace
  const [tab, setTab] = useState<Tab>('delivery')

  const calendar = demo.calendars[0] ?? EMPTY_CALENDAR
  const outcomes = useMemo(() => stageOutcomes(demo), [demo])
  const metrics = useMemo(() => deliveryMetrics(demo, today), [demo, today])
  const attribution = useMemo(() => delayAttribution(demo), [demo])
  const accuracy = useMemo(() => estimateAccuracy(demo), [demo])
  const health = useMemo(() => projectHealth(demo, today), [demo, today])
  const hints = useMemo(() => insights(demo, today), [demo, today])
  const weeks = useMemo(() => weekStartsFrom(today, 6, -3), [today])
  const capacity = useMemo(() => capacityMatrix(demo, weeks, calendar), [demo, weeks, calendar])

  const totalDelay = metrics.totalDelayWorkdays

  return (
    <div className="gp-analytics">
      <header className="gp-page-head">
        <div>
          <h1>智能分析</h1>
          <p>
            {today} · {activeProjects(demo).length} 个在管项目 ·{' '}
            {demo.projects.reduce((sum, p) => sum + p.assets.length, 0)} 个资产 ·{' '}
            {outcomes.length} 个已完成阶段进入统计
          </p>
        </div>
        <div className="gp-chip-row">
          {TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className={`gp-chip${entry.key === tab ? ' is-active' : ''}`}
              onClick={() => setTab(entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </header>

      <p className="gp-analytics-boundary">
        这一页<strong>不产生任何新数据</strong>，只是项目、阶段、反馈、报价和结项这些正式记录的投影——
        每个数字都能追回到具体阶段。两条硬约束：
        <strong>客户等待与团队延期分开算</strong>（客户拖的不记在制作组头上）；
        <strong>只统计到制作组 / 项目 / 资产 / 阶段，不下钻到个人</strong>——这不是没做，是设计上不做。
      </p>

      <div className="gp-metrics gp-metrics-5">
        <div className="gp-metric">
          <span>阶段按期交付率</span>
          <b>{pct(metrics.onTimeRate)}</b>
          <small>{outcomes.length} 个已完成阶段</small>
        </div>
        <div className="gp-metric">
          <span>平均返修轮次</span>
          <b>{metrics.avgReworkRounds.toFixed(2)}</b>
          <small>每个资产</small>
        </div>
        <div className={`gp-metric${metrics.clientWaitShare > 0 ? ' is-warn' : ''}`}>
          <span>客户等待占比</span>
          <b>{pct(metrics.clientWaitShare)}</b>
          <small>不计入团队延期</small>
        </div>
        <div className={`gp-metric${metrics.teamDelayShare > 0 ? ' is-warn' : ''}`}>
          <span>团队延期占比</span>
          <b>{pct(metrics.teamDelayShare)}</b>
          <small>已扣除客户等待</small>
        </div>
        <div className="gp-metric">
          <span>范围外变更率</span>
          <b>{pct(metrics.changeRate)}</b>
          <small>触发追加报价的资产</small>
        </div>
      </div>

      <div className="gp-analytics-body">
        <section className="gp-card gp-analytics-main" aria-label="分析主区">
          {tab === 'delivery' && (
            <>
              <header className="gp-card-head">
                <h2>
                  项目健康度
                  <small>每一列都来自阶段状态与实际日期，不是手填的</small>
                </h2>
                <span className="gp-count">{health.length} 个在管</span>
              </header>
              <div className="gp-analytics-scroll">
                <table className="gp-health-table" aria-label="项目健康度">
                  <thead>
                    <tr>
                      <th>项目</th>
                      <th>进度</th>
                      <th>按期率</th>
                      <th>返修</th>
                      <th>延期构成</th>
                      <th>已开工变更</th>
                      <th>风险</th>
                    </tr>
                  </thead>
                  <tbody>
                    {health.map((row) => (
                      <tr key={row.projectCode}>
                        <td className="gp-health-project">
                          <strong>{row.projectCode}</strong>
                          <span>
                            {row.name} · {row.client}
                          </span>
                        </td>
                        <td className="gp-num">
                          {row.finishedStages} / {row.totalStages} 阶段
                        </td>
                        <td className="gp-num">{row.finishedStages === 0 ? '—' : pct(row.onTimeRate)}</td>
                        <td className="gp-num">{row.reworkRounds}</td>
                        <td>
                          {row.delayWorkdays === 0 ? (
                            <span className="gp-analytics-muted">无延期</span>
                          ) : (
                            <>
                              <span className="gp-mini-bar">
                                {CAUSE_ORDER.map((cause) => {
                                  const entry = row.attribution.find((item) => item.cause === cause)!
                                  return entry.workdays === 0 ? null : (
                                    <i
                                      key={cause}
                                      className={`is-${cause}`}
                                      style={{ width: `${(entry.workdays / row.delayWorkdays) * 100}%` }}
                                      title={`${DELAY_CAUSE_LABEL[cause]} ${entry.workdays} 工作日`}
                                    />
                                  )
                                })}
                              </span>
                              <span className="gp-analytics-muted">{row.delayWorkdays} 工作日</span>
                            </>
                          )}
                        </td>
                        <td className="gp-num">{row.changeAmount === 0 ? '—' : money(row.changeAmount)}</td>
                        <td>
                          <span
                            className={`gp-pill ${row.risk === '正常' ? 'is-plan' : row.risk === '已归档' ? 'is-plain' : 'is-feedback'}`}
                          >
                            {row.risk}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="gp-accuracy">
                <h3>阶段实际 vs 预估</h3>
                <table className="gp-accuracy-table" aria-label="人天偏差">
                  <thead>
                    <tr>
                      <th>阶段</th>
                      <th>预估</th>
                      <th>实际</th>
                      <th>偏差</th>
                      <th>样本</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accuracy.map((row) => (
                      <tr key={row.stageCode}>
                        <td>{row.stageName}</td>
                        <td className="gp-num">{row.estimated} 人天</td>
                        <td className="gp-num">{row.actual} 工作日</td>
                        <td className="gp-num">
                          <span
                            className={`gp-pill ${row.deltaPct > 0.15 ? 'is-risk' : row.deltaPct > 0 ? 'is-feedback' : 'is-plan'}`}
                          >
                            {row.deltaPct > 0 ? '+' : ''}
                            {Math.round(row.deltaPct * 100)}%
                          </span>
                        </td>
                        <td className="gp-num">{row.samples}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="gp-analytics-note">
                  样本数少于 2 的阶段不作为结论依据——一条样本得不出「系统性低估」。
                  调整报价模板会影响对客户的报价，工作台只提建议，不自动改模板。
                </p>
              </div>
            </>
          )}

          {tab === 'attribution' && (
            <>
              <header className="gp-card-head">
                <h2>
                  延期归因
                  <small>共 {totalDelay} 个工作日；客户等待单独成一类，不并进团队延期</small>
                </h2>
              </header>
              <div className="gp-attribution">
                {totalDelay === 0 ? (
                  <p className="gp-empty">当前统计区间内没有延期。</p>
                ) : (
                  <>
                    <div className="gp-attr-bar" aria-label="归因构成">
                      {CAUSE_ORDER.map((cause) => {
                        const row = attribution.find((entry) => entry.cause === cause)!
                        return row.workdays === 0 ? null : (
                          <i
                            key={cause}
                            className={`is-${cause}`}
                            style={{ width: `${row.share * 100}%` }}
                            title={`${DELAY_CAUSE_LABEL[cause]} ${row.workdays} 工作日`}
                          />
                        )
                      })}
                    </div>
                    <table className="gp-attr-table" aria-label="归因明细">
                      <thead>
                        <tr>
                          <th>归因</th>
                          <th>工作日</th>
                          <th>占比</th>
                          <th>说明</th>
                        </tr>
                      </thead>
                      <tbody>
                        {CAUSE_ORDER.map((cause) => {
                          const row = attribution.find((entry) => entry.cause === cause)!
                          return (
                            <tr key={cause}>
                              <td>
                                <span className={`gp-cause-dot is-${cause}`} />
                                {DELAY_CAUSE_LABEL[cause]}
                              </td>
                              <td className="gp-num">{row.workdays}</td>
                              <td className="gp-num">{pct(row.share)}</td>
                              <td className="gp-analytics-muted">
                                {cause === 'client-wait' && '提交客户 → 客户确认之间的等待，不算团队的账'}
                                {cause === 'rework' && '范围内反馈触发的重做'}
                                {cause === 'team-delay' && '扣除以上之后剩下的，才是团队自己的延期'}
                                {cause === 'dependency' && '被追加报价或上游阶段卡住'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>

                    <h3>逐阶段下钻</h3>
                    <table className="gp-attr-table" aria-label="阶段下钻">
                      <thead>
                        <tr>
                          <th>阶段</th>
                          <th>项目 / 资产</th>
                          <th>延期</th>
                          <th>客户等待</th>
                          <th>归因</th>
                        </tr>
                      </thead>
                      <tbody>
                        {outcomes
                          .filter((row) => row.delayWorkdays > 0 || row.clientWaitWorkdays > 0)
                          .map((row) => (
                            <tr key={row.stageId}>
                              <td>{row.stageName}</td>
                              <td className="gp-analytics-muted">
                                {row.projectCode} / {row.assetId}
                              </td>
                              <td className="gp-num">{row.delayWorkdays || '—'}</td>
                              <td className="gp-num">{row.clientWaitWorkdays || '—'}</td>
                              <td>
                                {row.cause ? (
                                  <span className={`gp-pill is-cause-${row.cause}`}>
                                    {DELAY_CAUSE_LABEL[row.cause]}
                                  </span>
                                ) : (
                                  <span className="gp-analytics-muted">按期</span>
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            </>
          )}

          {tab === 'capacity' && (
            <>
              <header className="gp-card-head">
                <h2>
                  制作组负载
                  <small>已占用人天 ÷ 可用人天（扣公司休息日）· 跨项目共享，与筛选无关</small>
                </h2>
                <span className="gp-count">{capacity.length} 组</span>
              </header>
              <div className="gp-analytics-scroll">
                <table className="gp-load-table" aria-label="制作组负载">
                  <thead>
                    <tr>
                      <th>制作组</th>
                      {weeks.map((week) => (
                        <th key={week}>{monthDayLabel(week)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {capacity.map((row) => (
                      <tr key={row.group.id}>
                        <td className="gp-load-group">
                          <strong>{row.group.name}</strong>
                          <span>{row.group.dailyCapacity} 人天/工作日</span>
                        </td>
                        {row.weeks.map((week) => (
                          <td key={week.weekStart}>
                            <div className="gp-load-cell">
                              <div
                                className={`gp-load-bar${week.utilization > 1 ? ' is-over' : week.utilization >= 0.9 ? ' is-tight' : ''}`}
                              >
                                <i style={{ width: `${Math.min(100, week.utilization * 100)}%` }} />
                              </div>
                              <b
                                className={
                                  week.utilization > 1
                                    ? 'is-over'
                                    : week.utilization >= 0.9
                                      ? 'is-tight'
                                      : undefined
                                }
                              >
                                {week.available === 0 ? '休' : pct(week.utilization)}
                              </b>
                              <small>
                                {week.scheduled} / {week.available}
                              </small>
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="gp-analytics-note">
                负载只到制作组，不显示组内是谁做的。等待客户的阶段不消耗人天，但仍然占时间线。
              </p>
            </>
          )}

          {tab === 'quote' && (
            <>
              <header className="gp-card-head">
                <h2>
                  报价与变更
                  <small>金额取自报价行累加，与报价页同一份计算</small>
                </h2>
                <span className="gp-count">{demo.quoteCases.length} 件</span>
              </header>
              <div className="gp-analytics-scroll">
                <table className="gp-quote-stat-table" aria-label="报价统计">
                  <thead>
                    <tr>
                      <th>案件</th>
                      <th>类型</th>
                      <th>项目</th>
                      <th>金额</th>
                      <th>人天</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demo.quoteCases.map((entry) => {
                      const version = activeVersion(demo, entry.id)
                      const totals = version ? quoteTotals(version) : { amount: 0, personDays: 0 }
                      return (
                        <tr key={entry.id}>
                          <td>
                            <strong>{entry.id}</strong>
                            <span className="gp-analytics-muted"> · {entry.title}</span>
                          </td>
                          <td>
                            <span className={`gp-pill is-quote-${entry.kind}`}>
                              {QUOTE_KIND_LABEL[entry.kind]}
                            </span>
                          </td>
                          <td className="gp-analytics-muted">{entry.projectCode}</td>
                          <td className="gp-num">{version ? money(totals.amount) : '—'}</td>
                          <td className="gp-num">{version ? totals.personDays : '—'}</td>
                          <td className="gp-analytics-muted">{QUOTE_STATUS_LABEL[entry.status]}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="gp-analytics-note">
                只有已开工（发出开工邮件）的报价计入应结。批准但没发开工邮件的不算——
                与报价页和结项页的口径完全一致。
              </p>
            </>
          )}
        </section>

        <aside className="gp-card gp-analytics-side" aria-label="AI 洞察">
          <header className="gp-card-head">
            <h2>
              AI 洞察
              <small>全部为建议，工作台不会代做</small>
            </h2>
            <span className="gp-count">{hints.length}</span>
          </header>
          <div className="gp-insights">
            {hints.length === 0 && <p className="gp-empty">当前没有足够事实支撑任何结论。</p>}
            {hints.map((hint) => (
              <InsightCard
                key={hint.id}
                hint={hint}
                demo={demo}
                today={today}
                onDispose={store.disposeInsight}
              />
            ))}
          </div>

          <div className="gp-definition">
            <h3>口径说明</h3>
            <dl>
              <div>
                <dt>按期交付率</dt>
                <dd>{METRIC_DEFINITION.onTimeRate}</dd>
              </div>
              <div>
                <dt>基准 vs 当前</dt>
                <dd>{METRIC_DEFINITION.baseline}</dd>
              </div>
              <div>
                <dt>客户等待</dt>
                <dd>{METRIC_DEFINITION.clientWait}</dd>
              </div>
              <div>
                <dt>团队延期</dt>
                <dd>{METRIC_DEFINITION.teamDelay}</dd>
              </div>
              <div>
                <dt>返修轮次</dt>
                <dd>{METRIC_DEFINITION.rework}</dd>
              </div>
            </dl>
            <p className="gp-definition-hard">{METRIC_DEFINITION.scope}。制作组内部谁做的哪一版，工作台不记录。</p>
          </div>

          <div className="gp-detail-actions gp-quote-actions">
            <button type="button" className="gp-btn" onClick={() => onNavigate('schedule')}>
              去排期管理
            </button>
            <button type="button" className="gp-btn" onClick={() => onNavigate('feedback')}>
              去反馈中心
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
