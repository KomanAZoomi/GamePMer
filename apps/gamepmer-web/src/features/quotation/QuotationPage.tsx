import { useEffect, useMemo, useState } from 'react'
import type { RouteKey } from '../../app/navigation'
import {
  QUOTE_KIND_LABEL,
  frozenSummary,
  pendingChangeRequests,
  QUOTE_STATUS_LABEL,
  activeVersion,
  kickoffBlockingIssues,
  personOf,
  projectQuoteSummary,
  quoteTodoList,
  quoteTotals,
  type QuoteTodo,
  reviewBlockingIssues,
  reviewTodos,
  versionsOf,
} from '../../domain/quotation'
import type { QuoteCase, QuoteVersion } from '../../domain/model'
import { dateRange } from '../../domain/workCalendar'
import type { QuoteTab, WorkspaceState, WorkspaceStore } from '../workspace/workspaceStore'
import { NotificationList } from '../feedback/NotificationList'
import { ApprovalTrack } from './ApprovalTrack'
import { EMPTY_CALENDAR } from '../../domain/workCalendar'
import { NewCaseDrawer } from './NewCaseDrawer'
import { QuoteEntryDrawer } from './QuoteEntryDrawer'

interface QuotationPageProps {
  workspace: WorkspaceState
  store: WorkspaceStore
  onNavigate: (route: RouteKey) => void
}

const TABS: Array<{ key: QuoteTab; label: string }> = [
  { key: 'mine', label: '待我处理' },
  { key: 'active', label: '全部进行中' },
  { key: 'done', label: '已完成' },
]

const money = (value: number) => `¥ ${value.toLocaleString('zh-CN')}`

export function QuotationPage({ workspace, store, onNavigate }: QuotationPageProps) {
  const { demo, today, quoteTab, selectedQuoteCaseId } = workspace
  const [note, setNote] = useState('')

  /**
   * 理由输入框是这一页共用的。**每个动作用完必须清掉**——
   * 不清的话上一步的措辞会被下一步原样带走并写进审计：
   * 「价格高了」（客户答复）会变成「放弃变更」的原因。
   */
  function withNoteReset<T extends unknown[]>(fn: (...args: T) => void) {
    return (...args: T) => {
      fn(...args)
      setNote('')
    }
  }
  const [via, setVia] = useState('Outlook')
  const [entryOpen, setEntryOpen] = useState(false)
  // 从顶栏「新增需求」跳过来时直接把录入面板打开——跳过来还要再找一次按钮就没意义了
  const [newCaseOpen, setNewCaseOpen] = useState(false)
  // 点待立案的行时，用它预填录入面板——PM 不用把项目、资产、标题再抄一遍
  const [prefillId, setPrefillId] = useState<string | undefined>()

  function setPrefill(requestId: string) {
    setPrefillId(requestId)
    setNewCaseOpen(true)
  }

  // 顶栏的意图消费一次就清掉，否则关掉面板下一次渲染又被打开
  useEffect(() => {
    if (!workspace.quoteEntryIntent) return
    setNewCaseOpen(true)
    store.clearQuoteEntryIntent()
  }, [workspace.quoteEntryIntent, store])

  const workQueue = useMemo(() => quoteTodoList(demo), [demo])
  const buckets = useMemo(() => {
    const byNewest = [...demo.quoteCases].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return {
      // 按**责任在谁**分，不按状态区间——后者会在案件推过某一段之后整桶变空
      mine: workQueue.filter((row) => row.mine),
      active: workQueue,
      done: byNewest
        .filter((entry) => entry.status === 'KickoffSent' || entry.status === 'Rejected')
        .map<QuoteTodo>((quoteCase) => ({
          id: quoteCase.id,
          kind: 'quote-case',
          title: quoteCase.title,
          projectCode: quoteCase.projectCode,
          waiting: { actor: 'me', label: '已完结', next: '', mine: false },
          mine: false,
          next: '',
          quoteCase,
        })),
    }
  }, [demo, workQueue])

  const todos = useMemo(() => reviewTodos(demo), [demo])
  const listed = buckets[quoteTab]
  const selected: QuoteCase | undefined =
    demo.quoteCases.find((entry) => entry.id === selectedQuoteCaseId) ??
    listed.find((row) => row.quoteCase)?.quoteCase ??
    demo.quoteCases[0]

  if (!selected) {
    return (
      <div className="gp-placeholder">
        <div className="gp-card gp-placeholder-card">
          <h1>报价与变更</h1>
          <p>当前没有报价案件。恢复示例数据后可查看首次报价 Q-021 与追加报价 CQ-004。</p>
        </div>
      </div>
    )
  }

  const version = activeVersion(demo, selected.id)
  const history = versionsOf(demo, selected.id)
  const totals = version ? quoteTotals(version) : { personDays: 0, amount: 0 }
  const reviewer = personOf(demo, selected.reviewerPersonId)
  const reviewerRoles = (reviewer?.roles ?? []).filter((role) => role === '组长' || role === 'BD')
  const mergedReview = reviewerRoles.length > 1

  const reviewIssues = version ? reviewBlockingIssues(version) : ['尚无报价版本']
  const kickoffIssues = kickoffBlockingIssues(demo, selected.id)
  const canReview = selected.status === 'AwaitingReview' && reviewIssues.length === 0
  const canKickoff = selected.status === 'ClientAccepted' && kickoffIssues.length === 0

  const summary = projectQuoteSummary(demo, selected.projectCode)
  // 只要还没开工，总监就该能提交报价——包括被退回之后。
  // 少了这个入口，「退回总监修改」就是死胡同。
  const canQuote = selected.status !== 'KickoffSent' && selected.status !== 'Rejected'
  const project = demo.projects.find((entry) => entry.code === selected.projectCode)
  const frozen = frozenSummary(demo)
  // 判为范围外但还没立案的变更单。阶段已经冻上了，列表里必须有一行能点——
  // 否则「资产冻结中 1」就是个数得出来、点不进去的死数字
  const pending = useMemo(() => pendingChangeRequests(demo), [demo])
  // 只在「处理中」页签下露出——它们本来就是还没处理完的东西
  const pendingHere = quoteTab === 'active' ? pending : []
  // 开工邮件草稿就在这一页起草，也就该在这一页看到——不要让 PM 跑去反馈中心找
  const kickoffDrafts = demo.notificationDrafts.filter((draft) => draft.sourceKind === 'kickoff')

  return (
    <div className="gp-quotation">
      <header className="gp-page-head">
        <div>
          <h1>报价与变更</h1>
          <p>
            BD 需求 · 总监报价 · 组长复核 · 报给客户 · 客户确认 · 开工建项 · {today} ·{' '}
            待我处理 {buckets.mine.length} 件 · 进行中 {buckets.active.length} 件
          </p>
        </div>
        <div className="gp-chip-row">
          <button
            type="button"
            className="gp-btn gp-btn-primary gp-btn-sm"
            onClick={() => setNewCaseOpen((open) => !open)}
          >
            {newCaseOpen ? '收起录入' : '录入新需求'}
          </button>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`gp-chip${tab.key === quoteTab ? ' is-active' : ''}`}
              onClick={() => store.setQuoteTab(tab.key)}
            >
              {tab.label} {buckets[tab.key].length}
            </button>
          ))}
        </div>
      </header>

      <div className="gp-metrics gp-metrics-5">
        <div className="gp-metric">
          <span>总监报价中</span>
          <b>{demo.quoteCases.filter((c) => c.status === 'DirectorQuoting').length}</b>
          <small>等待人天与节点</small>
        </div>
        <div className="gp-metric is-warn">
          <span>等待复核</span>
          <b>{todos.length}</b>
          <small>{todos.some((t) => t.roles.length > 1) ? '含组长兼 BD 合并复核' : '需要组长/BD 确认'}</small>
        </div>
        {/* 等客户单独一格：这段时间是客户占用的，混进「待开工」会看不出卡在谁那边 */}
        <div className="gp-metric">
          <span>等客户确认</span>
          <b>{workQueue.filter((row) => row.waiting.actor === 'client').length}</b>
          <small>已报客户，等回话</small>
        </div>
        {/* 冻结数归零时不再标黄——没有东西被卡住就不该继续报警 */}
        {/* 资产数与阶段数是两个数：同一资产冻两个阶段时，写「资产」却填阶段数就对不上 */}
        {/*
          一个说不出怎么消的告警，挂在那里只会让人学会无视它。
          验收原话：「不知道怎么操作才能消除这个异常」。
        */}
        <div className={`gp-metric${frozen.assets > 0 ? ' is-warn' : ''}`}>
          <span>资产冻结中</span>
          <b>{frozen.assets}</b>
          <small>
            {frozen.stages > 0 ? `共 ${frozen.stages} 个阶段` : '没有阶段被卡住'}
          </small>
        </div>
        <div className="gp-metric">
          <span>已开工</span>
          <b>{demo.quoteCases.filter((c) => c.status === 'KickoffSent').length}</b>
          <small>开工邮件已发出</small>
        </div>
      </div>

      {newCaseOpen && (
        <div className="gp-card gp-quote-entry-card">
          <NewCaseDrawer
            demo={demo}
            today={today}
            fromChangeRequest={pending.find((row) => row.request.id === prefillId)?.request}
            onCancel={() => {
              setNewCaseOpen(false)
              setPrefillId(undefined)
            }}
            onSubmit={(input) => {
              store.createQuoteCase(input)
              setNewCaseOpen(false)
              setPrefillId(undefined)
            }}
          />
        </div>
      )}

      {entryOpen && canQuote && (
        <div className="gp-card gp-quote-entry-card">
          <QuoteEntryDrawer
            caseId={selected.id}
            projectCode={selected.projectCode}
            project={project}
            previous={version}
            calendar={demo.calendars.find((entry) => entry.id === project?.calendarId) ?? demo.calendars[0] ?? EMPTY_CALENDAR}
            onCancel={() => setEntryOpen(false)}
            onSubmit={(lines, impact) => {
              store.submitQuote(selected.id, lines, impact)
              setEntryOpen(false)
            }}
          />
        </div>
      )}

      {frozen.unfreezeVia.length > 0 && (
        <div className="gp-card gp-unfreeze" aria-label="冻结与解冻">
          <header className="gp-card-head">
            <h2>
              冻结的阶段怎么解冻
              <small>冻结只由「反馈判为范围外」产生，走完那条追加报价它自己就解开</small>
            </h2>
            <span className="gp-count is-warn">{frozen.stages}</span>
          </header>
          <ul className="gp-unfreeze-list">
            {frozen.unfreezeVia.map((row) => (
              <li key={row.stageId}>
                <strong>
                  {row.assetId} · {row.stageName}
                </strong>
                <span>{row.next}</span>
                {row.caseId && (
                  <button
                    type="button"
                    className="gp-btn gp-btn-sm"
                    onClick={() => store.selectQuoteCase(row.caseId!)}
                  >
                    去 {row.caseId}
                  </button>
                )}
                {!row.caseId && row.changeRequestId && (
                  <button
                    type="button"
                    className="gp-btn gp-btn-sm gp-btn-primary"
                    onClick={() => setPrefill(row.changeRequestId!)}
                  >
                    立案
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="gp-reclassify-note">
            解冻发生在<strong>发出变更开工邮件</strong>那一刻——批准、报客户、客户确认都还不解冻。
            在那之前受影响阶段不能开工，其余资产照常制作。
          </p>
        </div>
      )}

      <div className="gp-quotation-body">
        <aside className="gp-card gp-case-list" aria-label="报价案件">
          <header className="gp-card-head">
            <h2>{TABS.find((tab) => tab.key === quoteTab)?.label}</h2>
            <span className="gp-count">{listed.length}</span>
          </header>
          {listed.length === 0 && (
            <p className="gp-empty">
              {quoteTab === 'mine'
                ? '没有等你动手的事。切到「全部进行中」看还在别人手上的。'
                : '这个页签下暂时没有案件。'}
            </p>
          )}

          {/*
            一行一件待办，**跨全部状态**收集，等我的排前面。
            原来按状态区间分三桶，案件一过复核「处理中」就整桶空了——
            而真正等 PM 动手的两步跑到了「客户环节」，那个名字读不出「该我做」。
          */}
          <ul className="gp-case-items">
            {listed.map((row) => {
              const isPending = row.kind === 'change-request'
              const entryVersion = row.quoteCase ? activeVersion(demo, row.quoteCase.id) : undefined
              const frozen = row.pending?.frozenStages ?? []
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    className={`gp-case${isPending ? ' is-pending' : ''}${
                      !isPending && row.id === selected.id ? ' is-active' : ''
                    }`}
                    onClick={() =>
                      isPending ? setPrefill(row.id) : store.selectQuoteCase(row.id)
                    }
                  >
                    <span className="gp-case-top">
                      <span
                        className={`gp-pill ${
                          isPending
                            ? 'is-warn-pill'
                            : `is-quote-${row.quoteCase!.kind}`
                        }`}
                      >
                        {isPending ? '待立案' : QUOTE_KIND_LABEL[row.quoteCase!.kind]}
                      </span>
                      {/* 等谁，一眼可见——这是 PM 打开这一页真正想知道的 */}
                      <span className={`gp-wait-tag${row.mine ? ' is-mine' : ''}`}>
                        {row.waiting.label}
                      </span>
                    </span>
                    <strong className="gp-case-title">
                      {row.id} · {row.title}
                    </strong>
                    <span className="gp-case-meta">
                      {row.projectCode}
                      {row.quoteCase && ` · ${QUOTE_STATUS_LABEL[row.quoteCase.status]}`}
                      {entryVersion && ` · ${money(quoteTotals(entryVersion).amount)}`}
                      {frozen.length > 0 &&
              ` · 冻住 ${frozen.map((stage) => stage.stageName).join('、')}`}
                    </span>
                    {row.next && <span className="gp-case-next">下一步：{row.next}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        <section className="gp-card gp-quote-main" aria-label="报价单">
          <header className="gp-card-head">
            <h2>
              {selected.id} · {selected.title}
              <small>
                {selected.projectCode} · {selected.client} ·{' '}
                {selected.sourceFeedbackItemId
                  ? `来源 ${selected.sourceFeedbackItemId}`
                  : '来源 BD 需求邮件'}
              </small>
            </h2>
            <span
              className={`gp-pill ${selected.status === 'KickoffSent' ? 'is-plan' : selected.status === 'Approved' ? 'is-plan' : 'is-feedback'}`}
            >
              {QUOTE_STATUS_LABEL[selected.status]}
            </span>
          </header>

          <p className="gp-quote-requirement">{selected.requirement}</p>

          <div className="gp-quote-summary">
            <div>
              <span>报价负责人</span>
              <strong>
                {selected.directorName} · {selected.kind === 'change' ? '追加报价' : '首次报价'}
              </strong>
            </div>
            <div className="is-changed">
              <span>{selected.kind === 'change' ? '追加人天' : '总人天'}</span>
              <strong>{totals.personDays} 人日</strong>
            </div>
            <div className="is-changed">
              <span>{selected.kind === 'change' ? '追加金额' : '报价金额'}</span>
              <strong>{money(totals.amount)}</strong>
            </div>
            <div className="is-changed">
              <span>排期影响</span>
              <strong>+{version?.scheduleImpactWorkdays ?? 0} 工作日</strong>
            </div>
          </div>

          {version ? (
            <>
              <QuoteTable version={version} />
              {canQuote && !entryOpen && (
                <div className="gp-quote-requote">
                  <button type="button" className="gp-btn" onClick={() => setEntryOpen(true)}>
                    录入总监报价
                  </button>
                  <span>
                    {selected.status === 'DirectorQuoting'
                      ? '已退回总监。重新提交会生成新版本，当前 v' +
                        version.version +
                        ' 原样留档。'
                      : '改动会生成新版本并重新进入复核——已复核的版本不会被静默覆盖。'}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="gp-quote-empty">
              <p>总监尚未返回报价。报价要展开到每个可验收阶段，人天与节点齐了才会出现报价单。</p>
              {canQuote && !entryOpen && (
                <button
                  type="button"
                  className="gp-btn gp-btn-primary"
                  onClick={() => setEntryOpen(true)}
                >
                  录入总监报价
                </button>
              )}
            </div>
          )}

          <ApprovalTrack
            quoteCase={selected}
            version={version}
            reviewerName={reviewer?.name ?? selected.reviewerPersonId}
            reviewerRoles={reviewerRoles}
          />

          {history.length > 1 && (
            <div className="gp-version-history">
              <h3>报价版本</h3>
              <ul>
                {history.map((entry) => (
                  <li key={entry.id} className={entry.supersededAt ? 'is-superseded' : 'is-active'}>
                    <strong>v{entry.version}</strong>
                    <span>
                      {quoteTotals(entry).personDays} 人日 · {money(quoteTotals(entry).amount)} ·{' '}
                      {entry.submittedBy} 于 {entry.submittedAt.slice(5, 10)} 提交
                    </span>
                    <span className="gp-version-state">
                      {entry.supersededAt
                        ? '已被新版本取代'
                        : entry.review
                          ? entry.review.decision === 'approve'
                            ? '复核通过'
                            : '已驳回'
                          : '等待复核'}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="gp-version-note">
                已复核的版本不会被静默覆盖——每次改动都是新版本，旧版本内容原样留档，结项出账时能对上是谁批的哪一版。
              </p>
            </div>
          )}
        </section>

        <aside className="gp-card gp-quote-detail" aria-label="报价详情">
          <div className="gp-detail-kicker">报价详情</div>
          <div className="gp-detail-id">
            {selected.id} {version && `/ v${version.version}`}
          </div>
          <h2 className="gp-detail-title">{selected.title}</h2>

          <dl className="gp-detail-grid">
            <div>
              <dt>项目</dt>
              <dd>{selected.projectCode}</dd>
            </div>
            <div>
              <dt>客户</dt>
              <dd>{selected.client}</dd>
            </div>
            <div>
              <dt>报价总监</dt>
              <dd>{selected.directorName}</dd>
            </div>
            <div>
              <dt>复核人</dt>
              <dd>
                {reviewer?.name ?? '—'}
                {reviewerRoles.length > 0 && ` · ${reviewerRoles.join('兼')}`}
              </dd>
            </div>
            <div>
              <dt>受影响资产</dt>
              <dd>{selected.affectedAssetIds.join('、') || '—'}</dd>
            </div>
            <div>
              <dt>排期影响</dt>
              <dd>+{version?.scheduleImpactWorkdays ?? 0} 工作日</dd>
            </div>
          </dl>

          {mergedReview && selected.status === 'AwaitingReview' && (
            <div className="gp-merge-note">
              <h3>组长与 BD 是同一个人</h3>
              <p>
                {reviewer?.name} 同时承担
                {reviewerRoles.map((role, index) => (
                  <span key={role}>
                    {index > 0 && ' 与 '}
                    <strong>{role}</strong>
                  </span>
                ))}
                。本次只需确认一次——让同一个人点两次不会让审批更严格。审计里两个角色都会记下来。
              </p>
            </div>
          )}

          <div className="gp-evidence">
            <h3>原始证据</h3>
            <ul>
              {selected.evidence.map((evidence) => (
                <li key={evidence.id}>
                  <span className="gp-evidence-kind">{evidence.label}</span>
                  <span className="gp-path">{evidence.locator}</span>
                </li>
              ))}
            </ul>
          </div>

          {selected.status === 'AwaitingReview' && (
            <>
              {reviewIssues.length > 0 && (
                <div className="gp-block-box">
                  <h3>不能复核通过</h3>
                  <ul>
                    {reviewIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              <label className="gp-note-field">
                <span>复核意见</span>
                <input
                  className="gp-input"
                  value={note}
                  placeholder="写清同意或退回的理由，会进审计"
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <div className="gp-detail-actions gp-quote-actions">
                <button
                  type="button"
                  className="gp-btn"
                  onClick={() => {
                    withNoteReset(() => store.reviewQuote(selected.id, 'reject', note || '退回总监重新评估'))()
                    setNote('')
                  }}
                >
                  退回总监修改
                </button>
                <button
                  type="button"
                  className="gp-btn gp-btn-primary"
                  disabled={!canReview}
                  title={canReview ? undefined : reviewIssues.join('；')}
                  onClick={() => {
                    withNoteReset(() => store.reviewQuote(selected.id, 'approve', note || '同意本次报价'))()
                    setNote('')
                  }}
                >
                  {canReview
                    ? mergedReview
                      ? `以${reviewerRoles.join('兼')}身份复核通过`
                      : '复核通过'
                    : '复核通过（被阻断）'}
                </button>
              </div>
            </>
          )}

          {/* 复核通过 → BD 报给客户。内部认了不等于报出去了 */}
          {selected.status === 'Approved' && (
            <>
              <div className="gp-block-box is-ok">
                <h3>复核已通过</h3>
                <p>
                  {version?.review?.roles.join('兼')} {reviewer?.name} 于{' '}
                  {version?.review?.decidedAt.slice(5, 16).replace('T', ' ')} 通过。
                  <br />
                  <strong>复核通过不等于报给客户了</strong>：这一版还在公司内部，
                  要 BD 发给 {selected.client} 之后才进入等客户的窗口。
                </p>
              </div>
              <label className="gp-note-field">
                <span>BD 从哪里发给客户</span>
                <select className="gp-input" value={via} onChange={(event) => setVia(event.target.value)}>
                  <option>Outlook</option>
                  <option>企业微信</option>
                  <option>飞书</option>
                  <option>当面口头 + 补邮件</option>
                </select>
              </label>
              <div className="gp-detail-actions gp-quote-actions is-single">
                <button
                  type="button"
                  className="gp-btn gp-btn-primary"
                  onClick={() => store.sendToClient(selected.id, via)}
                >
                  BD 已把报价报给客户
                </button>
              </div>
              <p className="gp-reclassify-note">
                工作台不发送邮件。这里记的是 BD 的<strong>人工声明</strong>。
              </p>
            </>
          )}

          {/* 已报客户 → 等客户点头。这段等待是客户占用的时间，要单独看得见 */}
          {selected.status === 'SentToClient' && (
            <>
              <div className="gp-block-box">
                <h3>等客户确认</h3>
                <p>
                  {selected.sentToClientBy} 于{' '}
                  {selected.sentToClientAt?.slice(5, 16).replace('T', ' ')} 报给 {selected.client}。
                  <br />
                  <strong>客户没点头之前不能开工</strong>，项目也还没建出来——
                  这段等待算客户占用，不计团队产能。
                </p>
              </div>
              <label className="gp-note-field">
                <span>客户从哪里回的</span>
                <select className="gp-input" value={via} onChange={(event) => setVia(event.target.value)}>
                  <option>Outlook</option>
                  <option>企业微信</option>
                  <option>飞书</option>
                  <option>电话口头 + 补邮件</option>
                </select>
              </label>
              <label className="gp-note-field">
                <span>客户怎么说的（不接受时必填）</span>
                <textarea
                  className="gp-input"
                  rows={2}
                  placeholder="不接受时写清是价格、排期还是范围——下次报价要用"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <div className="gp-detail-actions gp-quote-actions">
                <button
                  type="button"
                  className="gp-btn gp-btn-primary"
                  onClick={withNoteReset(() => store.recordClientReply(selected.id, 'accept', via, note))}
                >
                  客户已确认接受
                </button>
                <button
                  type="button"
                  className="gp-btn"
                  disabled={!note.trim()}
                  title={note.trim() ? undefined : '客户不接受时必须写清原因'}
                  onClick={withNoteReset(() => store.recordClientReply(selected.id, 'decline', via, note))}
                >
                  客户未接受 · 终止案件
                </button>
              </div>
            </>
          )}

          {/* 客户点头 → PM 发开工通知，这一刻才正式建项 */}
          {selected.status === 'ClientAccepted' && (
            <>
              <div className="gp-block-box is-ok">
                <h3>客户已确认</h3>
                <p>
                  {selected.clientRepliedAt?.slice(5, 16).replace('T', ' ')} 收到 {selected.client}{' '}
                  的确认。
                  <br />
                  {!project && selected.kind === 'initial' ? (
                    <>
                      发出开工通知后<strong>才正式建项</strong>：
                      {selected.projectCode} 及其资产、阶段将按报价单生成，报价节点同时成为基准排期。
                    </>
                  ) : (
                    <>
                      <strong>客户确认不等于开工</strong>：排期此刻还没有变，要等你发出开工邮件。
                    </>
                  )}
                </p>
              </div>
              {kickoffIssues.length > 0 && (
                <div className="gp-block-box">
                  <h3>不能发开工邮件</h3>
                  <ul>
                    {kickoffIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              <label className="gp-note-field">
                <span>你从哪里发出的</span>
                <select className="gp-input" value={via} onChange={(event) => setVia(event.target.value)}>
                  <option>Outlook</option>
                  <option>企业微信</option>
                  <option>飞书</option>
                  <option>当面口头 + 补邮件</option>
                </select>
              </label>
              <div className="gp-detail-actions gp-quote-actions is-single">
                <button
                  type="button"
                  className="gp-btn gp-btn-primary"
                  disabled={!canKickoff}
                  title={canKickoff ? undefined : kickoffIssues.join('；')}
                  onClick={() => store.sendKickoff(selected.id, via)}
                >
                  {canKickoff
                    ? `我已发出${selected.kind === 'change' ? '变更' : '正式'}开工邮件`
                    : '标记开工（被阻断）'}
                </button>
              </div>
              <p className="gp-reclassify-note">
                工作台不发送邮件。这里记的是你的<strong>人工声明</strong>——真实发送请在 Outlook
                或企微完成，回来点这个按钮。点下之后受影响资产解冻、排期按报价单更新。
              </p>
            </>
          )}

          {/*
            客户嫌贵不等于这件事结束了。原来 Rejected 是终态、没有任何动作，
            而解冻只发生在「发出变更开工邮件」——于是受影响阶段永远冻着。
          */}
          {selected.status === 'Rejected' && (
            <>
              <div className="gp-block-box">
                <h3>客户未接受</h3>
                <p>
                  {selected.clientRepliedAt?.slice(5, 16).replace('T', ' ')} 收到答复
                  {selected.clientReplyNote && <>：{selected.clientReplyNote}</>}
                  <br />
                  受影响阶段<strong>还冻着</strong>，三条路：
                  <br />
                  <strong>降价重报</strong>——继续谈，阶段保持冻结。
                  <br />
                  <strong>放弃变更</strong>——这个变更不做了、项目还在，阶段当场解冻恢复原计划。
                  <br />
                  <strong>确认不接入</strong>——整单活没接到，案件收尾并可删除。
                </p>
              </div>
              <label className="gp-note-field">
                <span>决定与原因（放弃时必填）</span>
                <textarea
                  className="gp-input"
                  rows={2}
                  placeholder="例如：客户预算只有一半，这一版不做背部模块"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <div className="gp-detail-actions gp-quote-actions">
                <button
                  type="button"
                  className="gp-btn gp-btn-primary"
                  onClick={withNoteReset(() => store.requoteCase(selected.id, note))}
                >
                  降价重报 · 退回总监
                </button>
                <button
                  type="button"
                  className="gp-btn"
                  disabled={!note.trim()}
                  title={note.trim() ? undefined : '放弃变更要写明原因'}
                  onClick={withNoteReset(() => store.abandonCase(selected.id, note))}
                >
                  放弃变更 · 解冻阶段
                </button>
                {/*
                  第三条路：这单没接到。与「放弃变更」的区别是——
                  放弃是这个变更不做了、项目还在；不接入是整单活没接到。
                */}
                <button
                  type="button"
                  className="gp-btn"
                  disabled={!note.trim()}
                  title={note.trim() ? undefined : '确认不接入要写明原因'}
                  onClick={withNoteReset(() => store.markNotEngaged(selected.id, note))}
                >
                  确认不接入 · 可删除
                </button>
              </div>
            </>
          )}

          {selected.status === 'NotEngaged' && (
            <>
              <div className="gp-block-box">
                <h3>确认不接入</h3>
                <p>
                  这单没接到，案件已收尾。列表里留着它没有意义，可以删掉——
                  <strong>删除只删案件与报价版本，审计一条不动</strong>：
                  丢了审计就没法解释这单为什么没接到。
                </p>
              </div>
              <div className="gp-detail-actions">
                <button
                  type="button"
                  className="gp-btn"
                  onClick={() => store.deleteQuoteCase(selected.id)}
                >
                  删除这张案件
                </button>
              </div>
            </>
          )}

          {selected.status === 'Abandoned' && (
            <div className="gp-block-box is-ok">
              <h3>已放弃这个变更</h3>
              <p>
                受影响阶段已解冻，排期恢复原计划——客户不做这个变更，原计划本来就还在。
                对应的变更单与反馈项已一并收尾。
              </p>
            </div>
          )}

          {selected.status === 'KickoffSent' && (
            <div className="gp-block-box is-ok">
              <h3>已开工</h3>
              <p>
                {selected.kickoffSentBy} 于 {selected.kickoffSentAt?.slice(5, 16).replace('T', ' ')}{' '}
                声明发出开工邮件。受影响资产已解冻，排期按报价单更新，基准保持不变。
              </p>
            </div>
          )}

          {selected.status === 'DirectorQuoting' && (
            <div className="gp-block-box">
              <h3>等待总监返回</h3>
              <p>
                {selected.directorName} 尚未返回人天与节点。报价必须带排期——只有一个总金额的报价没法排产，
                结项时也没法对账。
                <br />
                总监把人天和节点发回来后，用中间那张卡的「录入总监报价」填进去。
              </p>
            </div>
          )}

          <div className="gp-quote-billing">
            <h3>{selected.projectCode} 应结汇总</h3>
            <ul>
              {summary.rows.map((row) => (
                <li key={row.quoteCase.id} className={row.billable ? undefined : 'is-pending'}>
                  <span>
                    {QUOTE_KIND_LABEL[row.quoteCase.kind]} {row.quoteCase.id}
                  </span>
                  <strong>{money(row.totals.amount)}</strong>
                  <em>{row.billable ? '已开工' : QUOTE_STATUS_LABEL[row.quoteCase.status]}</em>
                </li>
              ))}
              <li className="is-total">
                <span>当前应结合计</span>
                <strong>{money(summary.billableAmount)}</strong>
                <em>{summary.billablePersonDays} 人日</em>
              </li>
            </ul>
            <p className="gp-version-note">
              原报价永不覆盖：追加报价作为独立案件累计，结项出账时同时汇总首次报价与全部已开工的变更。
            </p>
          </div>

          <div className="gp-detail-actions gp-quote-actions">
            <button type="button" className="gp-btn" onClick={() => onNavigate('feedback')}>
              查看来源反馈
            </button>
            <button type="button" className="gp-btn" onClick={() => onNavigate('projects')}>
              在甘特上查看
            </button>
          </div>
        </aside>
      </div>

      {kickoffDrafts.length > 0 && (
        <section className="gp-card gp-kickoff-drafts">
          <div className="gp-kickoff-inner">
            <NotificationList
              notifications={kickoffDrafts}
              onMarkSent={store.markNotificationSent}
              onUnmark={store.unmarkNotificationSent}
            />
          </div>
        </section>
      )}

      {todos.length > 0 && (
        <section className="gp-card gp-review-todos" aria-label="待复核清单">
          <header className="gp-card-head">
            <h2>
              待复核清单
              <small>按人合并——同一人兼任组长与 BD 时只出现一条</small>
            </h2>
            <span className="gp-count">{todos.length}</span>
          </header>
          <table className="gp-todo-table">
            <thead>
              <tr>
                <th>报价案件</th>
                <th>类型</th>
                <th>项目</th>
                <th>复核人</th>
                <th>承担角色</th>
                <th>总监提交于</th>
              </tr>
            </thead>
            <tbody>
              {todos.map((todo) => (
                <tr
                  key={todo.caseId}
                  className={todo.caseId === selected.id ? 'is-active' : undefined}
                  onClick={() => store.selectQuoteCase(todo.caseId)}
                >
                  <td>
                    <button type="button" onClick={() => store.selectQuoteCase(todo.caseId)}>
                      {todo.caseId} · {todo.title}
                    </button>
                  </td>
                  <td>{QUOTE_KIND_LABEL[todo.caseKind]}</td>
                  <td>{todo.projectCode}</td>
                  <td>{todo.personName}</td>
                  <td>
                    {todo.roles.map((role) => (
                      <span key={role} className="gp-pill is-plain">
                        {role}
                      </span>
                    ))}
                    {todo.roles.length > 1 && <em className="gp-merge-flag">合并为 1 次确认</em>}
                  </td>
                  <td>{todo.submittedAt.slice(5, 16).replace('T', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

function QuoteTable({ version }: { version: QuoteVersion }) {
  const totals = quoteTotals(version)
  return (
    <table className="gp-quote-table" aria-label="报价工作项">
      <thead>
        <tr>
          <th>工作项 / 阶段</th>
          <th>人天</th>
          <th>单价</th>
          <th>小计</th>
          <th>更新后节点</th>
        </tr>
      </thead>
      <tbody>
        {version.lines.map((line) => (
          <tr key={line.id}>
            <td className="gp-line-title">
              <strong>{line.title}</strong>
              {/* 项目还没建时资产为空、模板行说明也可能为空——别渲染出一个孤零零的「·」 */}
              <span>{[line.assetId, line.note].filter(Boolean).join(' · ') || '—'}</span>
            </td>
            <td className="gp-num">{line.personDays}</td>
            <td className="gp-num">{money(line.unitPrice)}</td>
            <td className="gp-num">{money(line.personDays * line.unitPrice)}</td>
            <td className={line.plannedStart ? undefined : 'gp-missing'}>
              {line.plannedStart && line.plannedFinish
                ? dateRange(line.plannedStart, line.plannedFinish)
                : '缺节点'}
            </td>
          </tr>
        ))}
        <tr className="is-total">
          <td className="gp-line-title">
            <strong>合计</strong>
            <span>版本 v{version.version} · 按行累加，没有可手填的总额</span>
          </td>
          <td className="gp-num">{totals.personDays}</td>
          <td className="gp-num">—</td>
          <td className="gp-num">{money(totals.amount)}</td>
          <td>工期 +{version.scheduleImpactWorkdays} 工作日</td>
        </tr>
      </tbody>
    </table>
  )
}
