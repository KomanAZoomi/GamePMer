import { useMemo, useState } from 'react'
import type { RouteKey } from '../../app/navigation'
import {
  CLOSEOUT_GATE_ORDER,
  CLOSEOUT_STATUS_LABEL,
  GATE_TITLE,
  assetsApproved,
  billingPackage,
  closeoutCase,
  currentGate,
  gateBlockingIssues,
  gateState,
} from '../../domain/closeout'
import { PATH_KIND_LABEL, pathsOf } from '../../domain/projectPaths'
import { QUOTE_KIND_LABEL, quoteTotals } from '../../domain/quotation'
import type { CloseoutGateCode, EvidenceKind, EvidenceRef } from '../../domain/model'
import { NotificationList } from '../feedback/NotificationList'
import type { CloseoutTab, WorkspaceState, WorkspaceStore } from '../workspace/workspaceStore'
import { GateTrack } from './GateTrack'

interface CloseoutPageProps {
  workspace: WorkspaceState
  store: WorkspaceStore
  onNavigate: (route: RouteKey) => void
}

const TABS: Array<{ key: CloseoutTab; label: string }> = [
  { key: 'active', label: '处理中' },
  { key: 'ready', label: '可出账' },
  { key: 'archived', label: '已归档' },
]

const money = (value: number) => `¥ ${value.toLocaleString('zh-CN')}`

/** 证据类型。前两种是正式记录，后两种只能作为辅助线索。 */
const EVIDENCE_KINDS: Array<{ kind: EvidenceKind; label: string; official: boolean }> = [
  { kind: 'email', label: '正式邮件回执', official: true },
  { kind: 'path', label: '盘上路径', official: false },
  { kind: 'screenshot', label: '聊天截图', official: false },
  { kind: 'manual', label: '口头/当面确认', official: false },
]

export function CloseoutPage({ workspace, store, onNavigate }: CloseoutPageProps) {
  const { demo, today, closeoutTab, selectedCloseoutCaseId } = workspace
  const [pickedGate, setPickedGate] = useState<CloseoutGateCode | undefined>()
  const [evidenceKind, setEvidenceKind] = useState<EvidenceKind>('email')
  const [locator, setLocator] = useState('')
  const [note, setNote] = useState('')

  const buckets = useMemo(() => {
    const byOpened = [...demo.closeoutCases].sort((a, b) => b.openedAt.localeCompare(a.openedAt))
    return {
      active: byOpened.filter((entry) =>
        ['Precheck', 'AwaitingFinalPackage', 'AwaitingCustomerFinal', 'AwaitingIT'].includes(entry.status),
      ),
      ready: byOpened.filter((entry) => entry.status === 'ReadyToBill' || entry.status === 'BillingNotified'),
      archived: byOpened.filter((entry) => entry.status === 'Archived'),
    }
  }, [demo.closeoutCases])

  const listed = buckets[closeoutTab]
  const selected =
    demo.closeoutCases.find((entry) => entry.id === selectedCloseoutCaseId) ??
    listed[0] ??
    demo.closeoutCases[0]

  if (!selected) {
    return (
      <div className="gp-placeholder">
        <div className="gp-card gp-placeholder-card">
          <h1>结项中心</h1>
          <p>当前没有结项案件。恢复示例数据后可查看 AUR_A_3D_B11 的主路径。</p>
        </div>
      </div>
    )
  }

  const active = currentGate(demo, selected.id)
  const focus = pickedGate ?? active?.code ?? 'billing-notified'
  const focusGate = selected.gates.find((gate) => gate.code === focus)!
  const focusState = gateState(demo, selected.id, focus)

  const pendingEvidence: EvidenceRef[] = locator.trim()
    ? [
        {
          id: `EV-draft-${focus}`,
          kind: evidenceKind,
          label: EVIDENCE_KINDS.find((entry) => entry.kind === evidenceKind)!.label,
          locator: locator.trim(),
          receivedAt: `${today}T00:00:00+08:00`,
        },
      ]
    : []

  const issues = gateBlockingIssues(demo, selected.id, focus, pendingEvidence)
  const canComplete = focusState === 'current' && issues.length === 0 && pendingEvidence.length > 0

  const pack = billingPackage(demo, selected.id)
  const approval = assetsApproved(demo, selected.projectCode)
  const closeoutDrafts = demo.notificationDrafts.filter(
    (draft) => draft.sourceKind === 'closeout' && draft.sourceId === selected.id,
  )

  const reset = () => {
    setLocator('')
    setNote('')
    setPickedGate(undefined)
  }

  return (
    <div className="gp-closeout">
      <header className="gp-page-head">
        <div>
          <h1>结项中心</h1>
          <p>
            资产验收 → 最终包 → 客户确认 → IT 备份 → BD 出账 · {today} · 处理中{' '}
            {buckets.active.length} 个 · 可出账 {buckets.ready.length} 个
          </p>
        </div>
        <div className="gp-chip-row">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`gp-chip${tab.key === closeoutTab ? ' is-active' : ''}`}
              onClick={() => store.setCloseoutTab(tab.key)}
            >
              {tab.label} {buckets[tab.key].length}
            </button>
          ))}
        </div>
      </header>

      <div className="gp-metrics gp-metrics-5">
        <div className="gp-metric">
          <span>等待资产验收</span>
          <b>{demo.closeoutCases.filter((c) => c.status === 'Precheck').length}</b>
          <small>由阶段状态自动推导</small>
        </div>
        <div className="gp-metric">
          <span>等待最终包</span>
          <b>{demo.closeoutCases.filter((c) => c.status === 'AwaitingFinalPackage').length}</b>
          <small>总监整理中</small>
        </div>
        <div className="gp-metric">
          <span>等待客户确认</span>
          <b>{demo.closeoutCases.filter((c) => c.status === 'AwaitingCustomerFinal').length}</b>
          <small>已提交最终包</small>
        </div>
        <div
          className={`gp-metric${demo.closeoutCases.some((c) => c.status === 'AwaitingIT') ? ' is-warn' : ''}`}
        >
          <span>等待 IT 备份</span>
          <b>{demo.closeoutCases.filter((c) => c.status === 'AwaitingIT').length}</b>
          <small>需 IT 正式回执</small>
        </div>
        <div className="gp-metric">
          <span>可出账 / 已通知</span>
          <b>{buckets.ready.length}</b>
          <small>证据齐全</small>
        </div>
      </div>

      <div className="gp-closeout-body">
        <aside className="gp-card gp-closeout-list" aria-label="结项项目">
          <header className="gp-card-head">
            <h2>{TABS.find((tab) => tab.key === closeoutTab)?.label}</h2>
            <span className="gp-count">{listed.length}</span>
          </header>
          {listed.length === 0 && <p className="gp-empty">这个页签下暂时没有项目。</p>}
          <ul className="gp-closeout-items">
            {listed.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`gp-closeout-item${entry.id === selected.id ? ' is-active' : ''}`}
                  onClick={() => {
                    store.selectCloseoutCase(entry.id)
                    reset()
                  }}
                >
                  <span className="gp-closeout-top">
                    <span
                      className={`gp-pill ${entry.status === 'Archived' ? 'is-plain' : entry.status === 'ReadyToBill' || entry.status === 'BillingNotified' ? 'is-plan' : 'is-feedback'}`}
                    >
                      {CLOSEOUT_STATUS_LABEL[entry.status]}
                    </span>
                    <span className="gp-closeout-time">{entry.openedAt.slice(5, 10)}</span>
                  </span>
                  <strong className="gp-closeout-title">
                    {entry.projectCode} · {entry.client}
                  </strong>
                  <span className="gp-closeout-meta">
                    {CLOSEOUT_GATE_ORDER.filter((code) => gateState(demo, entry.id, code) === 'done').length}{' '}
                    / 5 道门禁已完成
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="gp-card gp-closeout-main" aria-label="结项门禁">
          <header className="gp-card-head">
            <h2>
              {selected.projectCode} · {selected.client}
              <small>
                最终包负责人 {selected.finalPackageOwner} · 开启于 {selected.openedAt.slice(0, 10)} ·
                资产验收 {approval.done ? '已全部通过' : `还差 ${approval.pending} 个阶段`}
              </small>
            </h2>
            <span
              className={`gp-pill ${selected.status === 'Archived' ? 'is-plain' : selected.status === 'ReadyToBill' || selected.status === 'BillingNotified' ? 'is-plan' : 'is-feedback'}`}
            >
              {CLOSEOUT_STATUS_LABEL[selected.status]}
            </span>
          </header>

          <GateTrack
            state={demo}
            item={selected}
            selected={focus}
            onSelect={(code) => {
              setPickedGate(code)
              setLocator('')
            }}
          />

          <div className="gp-gate-detail">
            <div className="gp-gate-detail-head">
              <h3>
                {focusGate.title}
                <span className={`gp-pill ${focusState === 'done' ? 'is-plan' : focusState === 'current' ? 'is-feedback' : 'is-plain'}`}>
                  {focusState === 'done' ? '已完成' : focusState === 'current' ? '当前门槛' : '前置未完成'}
                </span>
              </h3>
              <p className="gp-gate-requires">需要的证据：{focusGate.requires}</p>
            </div>

            {focusGate.evidence.length > 0 && (
              <div className="gp-evidence">
                <h3>已登记证据</h3>
                <ul>
                  {focusGate.evidence.map((entry) => (
                    <li key={entry.id}>
                      <span className="gp-evidence-kind">{entry.label}</span>
                      <span className="gp-path">{entry.locator}</span>
                    </li>
                  ))}
                </ul>
                {focusGate.note && <p className="gp-gate-note">{focusGate.note}</p>}
              </div>
            )}

            {/* 已完成的门禁不该显示红色阻断框——「已经完成」不是错误，
                那一格下面本来就有「退回这一步」。 */}
            {issues.length > 0 && focusState !== 'done' && (
              <div className="gp-block-box">
                <h3>这一步现在做不了</h3>
                <ul>
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
                {/*
                  「还有 N 个阶段未验收」是最常见的一条，而它只能在项目排期里解开。
                  只给理由不给去处，PM 还得自己翻到那个项目。
                */}
                {issues.some((issue) => issue.includes('阶段未验收')) && (
                  <div className="gp-detail-actions">
                    <button
                      type="button"
                      className="gp-btn gp-btn-sm"
                      onClick={() => {
                        store.selectProject(selected.projectCode)
                        onNavigate('projects')
                      }}
                    >
                      去 {selected.projectCode} 推进阶段
                    </button>
                  </div>
                )}
              </div>
            )}

            {focusState === 'current' && selected.status !== 'Archived' && (
              <div className="gp-gate-form">
                <h3>登记证据并完成这一步</h3>
                <div className="gp-gate-form-row">
                  <label>
                    <span>证据类型</span>
                    <select
                      className="gp-input"
                      aria-label="证据类型"
                      value={evidenceKind}
                      onChange={(event) => setEvidenceKind(event.target.value as EvidenceKind)}
                    >
                      {EVIDENCE_KINDS.map((entry) => (
                        <option key={entry.kind} value={entry.kind}>
                          {entry.label}
                          {entry.official ? '' : '（非正式）'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="gp-gate-locator">
                    <span>邮件主题 / 路径</span>
                    <input
                      className="gp-input"
                      aria-label="邮件主题或路径"
                      placeholder="如 RE: AUR_A_3D_B11 备份完成"
                      value={locator}
                      onChange={(event) => setLocator(event.target.value)}
                    />
                  </label>
                </div>
                <label className="gp-gate-note-field">
                  <span>备注（进审计）</span>
                  <input
                    className="gp-input"
                    aria-label="门禁备注"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
                <div className="gp-gate-form-foot">
                  <p>
                    {focus === 'it-backup' &&
                      '工作台不执行剪切备份。真实的文件移动、归档与权限处理由 IT 完成，这里登记的是 IT 返回的正式回执。'}
                    {focus === 'billing-notified' &&
                      '这一步只生成给 BD 的出账邮件草稿。发送仍由你在 Outlook 完成，回来标记。'}
                    {focus === 'client-final' &&
                      '客户在群里说「可以了」可以先记成聊天截图，但门禁只认正式邮件——出账时要拿得出来。'}
                    {focus === 'final-package' && '登记最终包路径，并由总监确认交付文件、源文件、贴图与 LOD 清单齐全。'}
                  </p>
                  <button
                    type="button"
                    className="gp-btn gp-btn-primary"
                    disabled={!canComplete}
                    title={
                      canComplete
                        ? undefined
                        : pendingEvidence.length === 0
                          ? '先填邮件主题或路径'
                          : issues.join('；')
                    }
                    onClick={() => {
                      store.completeCloseoutGate(selected.id, focus, pendingEvidence, note)
                      reset()
                    }}
                  >
                    {canComplete ? `完成「${GATE_TITLE[focus]}」` : '完成（被阻断）'}
                  </button>
                </div>
              </div>
            )}

            {focusState === 'done' && focus !== 'assets-approved' && selected.status !== 'Archived' && (
              <div className="gp-gate-reopen">
                <p>
                  {focusGate.completedBy} 于 {focusGate.completedAt?.slice(0, 16).replace('T', ' ')} 完成。
                  发现问题可以退回重做——<strong>退回会连带作废它后面的所有门禁</strong>，
                  因为基于旧最终包做的确认不能再算数。
                </p>
                <button
                  type="button"
                  className="gp-btn"
                  onClick={() => store.reopenCloseoutGate(selected.id, focus, `退回重做：${GATE_TITLE[focus]}`)}
                >
                  退回这一步
                </button>
              </div>
            )}

            {focus === 'assets-approved' && (
              <p className="gp-gate-note">
                这一步<strong>不能手工打勾</strong>，它是项目阶段状态的投影。
                {approval.done ? '当前全部阶段已验收。' : `当前还有 ${approval.pending} 个阶段未验收，`}
                <button type="button" className="gp-linkish" onClick={() => onNavigate('projects')}>
                  去项目甘特查看
                </button>
              </p>
            )}
          </div>

          <div className="gp-path-index">
            <div className="gp-path-head">
              <span>路径索引</span>
              <span>登记在「文件与归档」，工作台不复制、不移动、不删除任何真实文件</span>
            </div>
            <ul>
              {/* 路径读「文件与归档」登记的那一份，这里不另存一套 */}
              {pathsOf(demo, selected.projectCode).map((path) => (
                <li key={path.id}>
                  <strong>{PATH_KIND_LABEL[path.kind]}</strong>
                  <span className="gp-path">{path.path}</span>
                  <em>{path.updatedAt.slice(0, 10)} 由 {path.updatedBy} 登记</em>
                </li>
              ))}
              {pathsOf(demo, selected.projectCode).length === 0 && (
                <li>
                  <strong>还没登记路径</strong>
                  <span className="gp-path">去「文件与归档」登记这个批次的盘位</span>
                  <em>—</em>
                </li>
              )}
            </ul>
          </div>
        </section>

        <aside className="gp-card gp-billing" aria-label="出账资料包">
          <div className="gp-detail-kicker">出账资料包</div>
          <div className="gp-detail-id">{selected.id}</div>
          <h2 className="gp-detail-title">{selected.projectCode}</h2>

          <div className="gp-quote-billing">
            <h3>应结明细</h3>
            <ul>
              {pack.quoteRows.map((row) => (
                <li key={row.quoteCase.id}>
                  <span>
                    {QUOTE_KIND_LABEL[row.quoteCase.kind]} {row.quoteCase.id}
                  </span>
                  <strong>{money(row.totals.amount)}</strong>
                  <em>已开工</em>
                </li>
              ))}
              {pack.pendingRows.map((row) => (
                <li key={row.quoteCase.id} className="is-pending">
                  <span>
                    {QUOTE_KIND_LABEL[row.quoteCase.kind]} {row.quoteCase.id}
                  </span>
                  <strong>{money(row.totals.amount)}</strong>
                  <em>未开工，不计入</em>
                </li>
              ))}
              <li className="is-total">
                <span>应结合计</span>
                <strong>{money(pack.total)}</strong>
                <em>{pack.personDays} 人日</em>
              </li>
            </ul>
          </div>

          {pack.missing.length > 0 ? (
            <div className="gp-block-box">
              <h3>资料还不齐，不能通知 BD</h3>
              <ul>
                {pack.missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="gp-block-box is-ok">
              <h3>资料齐全</h3>
              <p>报价、交付清单、客户确认邮件、最终包路径与 IT 回执都在，可以通知 BD 出账。</p>
            </div>
          )}

          {selected.status === 'BillingNotified' && (
            <div className="gp-gate-reopen">
              <p>
                出账通知草稿已生成。收到 BD 的出账回执后可以把案件归档——
                <strong>归档之后只读</strong>，要再改动只能重开一个结项案件。
              </p>
              <button
                type="button"
                className="gp-btn gp-btn-primary"
                onClick={() => store.archiveCloseoutCase(selected.id)}
              >
                收到出账回执，归档项目
              </button>
            </div>
          )}

          {selected.status === 'Archived' && (
            <div className="gp-block-box is-ok">
              <h3>已归档</h3>
              <p>{selected.archivedAt?.slice(0, 16).replace('T', ' ')} 归档。案件只读。</p>
            </div>
          )}

          <div className="gp-detail-actions gp-quote-actions">
            <button type="button" className="gp-btn" onClick={() => onNavigate('quotation')}>
              查看报价
            </button>
            <button type="button" className="gp-btn" onClick={() => onNavigate('projects')}>
              在甘特上查看
            </button>
          </div>
        </aside>
      </div>

      {closeoutDrafts.length > 0 && (
        <section className="gp-card gp-kickoff-drafts">
          <div className="gp-kickoff-inner">
            <NotificationList
              notifications={closeoutDrafts}
              onMarkSent={store.markNotificationSent}
              onUnmark={store.unmarkNotificationSent}
            />
          </div>
        </section>
      )}
    </div>
  )
}
