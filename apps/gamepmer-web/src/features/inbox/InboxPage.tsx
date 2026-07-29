import { useMemo, useState } from 'react'
import type { RouteKey } from '../../app/navigation'
import {
  CANDIDATE_KIND_LABEL,
  CONFIDENCE_THRESHOLD,
  STAGE_LABEL,
  blockingIssues,
  canConfirm,
  channelLabel,
  inboxMetrics,
  overallConfidence,
} from '../../domain/inbox'
import type { CandidateField, CandidateKind, InboxCandidate, StageCode } from '../../domain/model'
import type { InboxTab, WorkspaceState, WorkspaceStore } from '../workspace/workspaceStore'
import { ImportPanel } from './ImportPanel'

/**
 * 正式记录的中文名。
 * 界面上不该出现 `QuoteCase`、`FeedbackBatch` 这种内部类型名——
 * 那是给写代码的人看的，不是给 PM 看的。
 */
const RECORD_LABEL: Record<string, string> = {
  FeedbackBatch: '反馈批次',
  StagePlan: '阶段',
  QuoteCase: '报价案件',
  CloseoutCase: '结项案件',
}

const recordLabel = (kind?: string) => (kind ? (RECORD_LABEL[kind] ?? kind) : '')

/** 按候选类型穷举。新增一种类型时，这里不补全就编译不过。 */
const CONFIRM_LABEL: Record<CandidateKind, string> = {
  'client-feedback': '确认并创建反馈批次',
  'stage-done': '确认并推进阶段',
  'quote-request': '确认并创建报价案件',
  'it-receipt': '确认并登记 IT 备份回执',
}

const FOLLOW_UP: Record<CandidateKind, { route: RouteKey; label: string }> = {
  'client-feedback': { route: 'feedback', label: '去反馈中心分流' },
  'stage-done': { route: 'projects', label: '在甘特上查看' },
  'quote-request': { route: 'quotation', label: '去报价与变更派给总监' },
  'it-receipt': { route: 'closeout', label: '去结项中心通知 BD 出账' },
}

interface InboxPageProps {
  workspace: WorkspaceState
  store: WorkspaceStore
  onNavigate: (route: RouteKey) => void
}

const TABS: Array<{ key: InboxTab; label: string }> = [
  { key: 'review', label: '待确认' },
  { key: 'blocked', label: '需补全' },
  { key: 'done', label: '已处理' },
]

const STATUS_LABEL: Record<InboxCandidate['status'], string> = {
  New: '新到',
  NeedsReview: '等待 PM 确认',
  Confirmed: '已确认',
  Ignored: '已忽略',
  Duplicate: '重复',
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

/** 值在界面上怎么显示：阶段码要翻成中文，别让 PM 去背 3D_HIGH。 */
function displayValue(field: CandidateField): string {
  if (!field.value) return '未识别'
  if (field.key === 'stageCode') return STAGE_LABEL[field.value as StageCode] ?? field.value
  return field.value
}

/**
 * 字段配色。
 *
 * 红色只给**真正阻断确认**的必填字段——选填字段识别得差不会拦住任何人，
 * 把它也画成红的，PM 就会开始无视红色。
 */
function confidenceClass(field: CandidateField): string {
  if (field.editedByPm) return 'is-manual'
  if (!field.value) return field.required ? 'is-missing' : 'is-optional'
  if (field.confidence < CONFIDENCE_THRESHOLD) return field.required ? 'is-low' : 'is-mid'
  if (field.confidence < 0.9) return 'is-mid'
  return 'is-high'
}

export function InboxPage({ workspace, store, onNavigate }: InboxPageProps) {
  const { demo, today, inboxTab, selectedCandidateId } = workspace
  const [importOpen, setImportOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<string | undefined>(undefined)

  const metrics = useMemo(() => inboxMetrics(demo, today), [demo, today])

  const buckets = useMemo(() => {
    // 收件箱按到达时间倒序——最新的消息排最上面
    const byNewest = [...demo.candidates].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const open = byNewest.filter((entry) => entry.status === 'NeedsReview' || entry.status === 'New')
    return {
      review: open.filter((entry) => canConfirm(entry)),
      blocked: open.filter((entry) => !canConfirm(entry)),
      done: byNewest.filter(
        (entry) =>
          entry.status === 'Confirmed' || entry.status === 'Ignored' || entry.status === 'Duplicate',
      ),
    }
  }, [demo.candidates])

  const listed = buckets[inboxTab]
  const selected =
    demo.candidates.find((entry) => entry.id === selectedCandidateId) ?? listed[0] ?? demo.candidates[0]

  const source = demo.sourceRecords.find((entry) => entry.id === selected?.sourceId)
  const issues = selected ? blockingIssues(selected) : []
  const ready = selected ? canConfirm(selected) : false

  if (!selected || !source) {
    return (
      <div className="gp-placeholder">
        <div className="gp-card gp-placeholder-card">
          <h1>候选收件箱</h1>
          <p>当前没有候选记录。恢复示例数据后可查看 10 条覆盖四种类型的候选。</p>
        </div>
      </div>
    )
  }

  const project = demo.projects.find(
    (entry) => entry.code === selected.fields.find((f) => f.key === 'projectCode')?.value,
  )
  const assetOptions = project?.assets ?? []
  const stageOptions = assetOptions.find(
    (asset) => asset.id === selected.fields.find((f) => f.key === 'assetId')?.value,
  )?.stages

  return (
    <div className="gp-inbox">
      <header className="gp-page-head">
        <div>
          <h1>候选收件箱</h1>
          <p>
            来源证据 → AI 识别 → PM 核验 → 正式入库 · {today} · 待确认 {metrics.needsReview} 条 ·
            今天已确认 {metrics.confirmedToday} 条
          </p>
        </div>
        <div className="gp-chip-row">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`gp-chip${tab.key === inboxTab ? ' is-active' : ''}`}
              onClick={() => store.setInboxTab(tab.key)}
            >
              {tab.label} {buckets[tab.key].length}
            </button>
          ))}
          <button
            type="button"
            className="gp-chip gp-chip-action"
            onClick={() => setImportOpen((open) => !open)}
          >
            {importOpen ? '收起导入' : '+ 导入候选'}
          </button>
        </div>
      </header>

      <div className="gp-metrics">
        <div className="gp-metric">
          <span>等待确认</span>
          <b>{metrics.needsReview}</b>
          <small>未经确认，不改变任何正式数据</small>
        </div>
        <div className="gp-metric">
          <span>可直接确认</span>
          <b>{metrics.readyToConfirm}</b>
          <small>字段齐全且置信度达标</small>
        </div>
        <div className="gp-metric is-warn">
          <span>需要补全</span>
          <b>{metrics.incomplete}</b>
          <small>缺字段、置信度不足或模块未交付</small>
        </div>
        <div className="gp-metric">
          <span>今天已确认</span>
          <b>{metrics.confirmedToday}</b>
          <small>已生成正式记录，可追溯</small>
        </div>
      </div>

      {importOpen && (
        <ImportPanel
          onImport={(request) => {
            store.ingestCandidate(request)
            setImportOpen(false)
          }}
          onClose={() => setImportOpen(false)}
        />
      )}

      <div className="gp-inbox-body">
        <aside className="gp-card gp-candidate-list" aria-label="候选记录">
          <header className="gp-card-head">
            <h2>{TABS.find((tab) => tab.key === inboxTab)?.label}</h2>
            <span className="gp-count">{listed.length}</span>
          </header>
          {listed.length === 0 && <p className="gp-empty">这个页签下暂时没有记录。</p>}
          <ul className="gp-candidate-items">
            {listed.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  className={`gp-candidate${candidate.id === selected.id ? ' is-active' : ''}`}
                  onClick={() => store.selectCandidate(candidate.id)}
                >
                  <span className="gp-candidate-top">
                    <span className={`gp-pill is-kind-${candidate.kind}`}>
                      {CANDIDATE_KIND_LABEL[candidate.kind]}
                    </span>
                    <span className="gp-candidate-time">
                      {candidate.createdAt.slice(5, 16).replace('T', ' ')}
                    </span>
                  </span>
                  <strong className="gp-candidate-title">{candidate.title}</strong>
                  <span className="gp-candidate-meta">
                    {channelLabel(
                      demo.sourceRecords.find((entry) => entry.id === candidate.sourceId)?.channel ??
                        'manual',
                    )}
                    {candidate.status === 'Confirmed' && ` · 已生成 ${candidate.confirmedRecordId}`}
                    {candidate.status === 'Duplicate' && ` · 重复于 ${candidate.duplicateOfId}`}
                    {candidate.status === 'Ignored' && ' · 已忽略'}
                    {(candidate.status === 'NeedsReview' || candidate.status === 'New') &&
                      ` · 综合置信度 ${percent(overallConfidence(candidate))}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="gp-card gp-extract" aria-label="AI 识别结果">
          <header className="gp-card-head">
            <h2>
              AI 识别结果
              <small>
                候选 {selected.id} · {selected.status === 'Confirmed' ? '已写入正式记录' : '尚未写入正式项目'}
              </small>
            </h2>
            <span className={`gp-count${ready ? '' : ' is-warn'}`}>
              综合置信度 {percent(overallConfidence(selected))}
            </span>
          </header>

          <div className="gp-source">
            <div className="gp-source-line">
              <span>
                {channelLabel(source.channel)}
                {source.from && ` · 来自 ${source.from}`}
              </span>
              <span>{source.receivedAt.slice(0, 16).replace('T', ' ')}</span>
            </div>
            {source.subject && <p className="gp-source-subject">{source.subject}</p>}
            <p className="gp-source-text">{source.body}</p>
            {source.attachments.length > 0 && (
              <p className="gp-source-attachments">
                附件：{source.attachments.join('、')}
                <span className="gp-source-hint">（工作台只记索引，不搬动真实文件）</span>
              </p>
            )}
          </div>

          <div className="gp-field-grid">
            {selected.fields.map((field) => (
              <div key={field.key} className={`gp-field ${confidenceClass(field)}`}>
                <div className="gp-field-head">
                  <span className="gp-field-label">
                    {field.label}
                    {field.required && <i className="gp-required" aria-label="必填">*</i>}
                  </span>
                  <span className="gp-field-score">
                    {field.editedByPm ? 'PM 填写' : field.value ? percent(field.confidence) : '未识别'}
                  </span>
                </div>

                {editingKey === field.key ? (
                  <FieldEditor
                    field={field}
                    assetOptions={assetOptions.map((asset) => ({
                      value: asset.id,
                      label: `${asset.id} · ${asset.name}`,
                    }))}
                    stageOptions={(stageOptions ?? []).map((stage) => ({
                      value: stage.code,
                      label: stage.name,
                    }))}
                    onCommit={(value) => {
                      store.editCandidateField(selected.id, field.key, value)
                      setEditingKey(undefined)
                    }}
                    onCancel={() => setEditingKey(undefined)}
                  />
                ) : (
                  <button
                    type="button"
                    className="gp-field-value"
                    onClick={() => setEditingKey(field.key)}
                    disabled={selected.status === 'Confirmed'}
                    title={selected.status === 'Confirmed' ? '已确认的候选不再修改字段' : '点击修改'}
                  >
                    {displayValue(field)}
                  </button>
                )}

                {field.sourceExcerpt && <p className="gp-field-excerpt">{field.sourceExcerpt}</p>}
              </div>
            ))}
          </div>

          <div className="gp-process">
            <div className="gp-process-head">
              <span>候选处理链</span>
              <span>所有正式更新都要 PM 按下确认</span>
            </div>
            <ol className="gp-process-track">
              <li className="is-done">
                <strong>01 来源接入</strong>
                <span>{channelLabel(source.channel)}原文与附件已保存</span>
              </li>
              <li className="is-done">
                <strong>02 AI 识别</strong>
                <span>{selected.fields.filter((f) => f.value).length} 个字段已提取</span>
              </li>
              <li className={selected.status === 'Confirmed' ? 'is-done' : 'is-current'}>
                <strong>03 PM 核验</strong>
                <span>
                  {selected.status === 'Confirmed'
                    ? `${selected.confirmedBy} 于 ${selected.confirmedAt?.slice(5, 16).replace('T', ' ')} 核验通过`
                    : ready
                      ? '字段齐全，可以确认'
                      : (issues[0] ?? '等待核对')}
                </span>
              </li>
              <li className={selected.status === 'Confirmed' ? 'is-done' : 'is-blocked'}>
                <strong>04 正式入库</strong>
                <span>
                  {selected.status === 'Confirmed'
                    ? `已生成${recordLabel(selected.confirmedRecordKind)} ${selected.confirmedRecordId}`
                    : '尚未创建任何正式记录'}
                </span>
              </li>
            </ol>
          </div>
        </section>

        <aside className="gp-card gp-candidate-detail" aria-label="候选详情">
          <div className="gp-detail-kicker">候选详情</div>
          <div className="gp-detail-id">{selected.id}</div>
          <h2 className="gp-detail-title">{selected.title}</h2>

          <div className="gp-pill-row">
            <span className={`gp-pill is-kind-${selected.kind}`}>
              {CANDIDATE_KIND_LABEL[selected.kind]}
            </span>
            <span
              className={`gp-pill ${selected.status === 'Confirmed' ? 'is-plan' : selected.status === 'NeedsReview' || selected.status === 'New' ? 'is-feedback' : 'is-plain'}`}
            >
              {STATUS_LABEL[selected.status]}
            </span>
          </div>

          <div className="gp-evidence">
            <h3>原始证据</h3>
            <ul>
              <li>
                <span className="gp-evidence-kind">{channelLabel(source.channel)}</span>
                <span className="gp-path">{source.subject ?? source.body.slice(0, 28)}</span>
              </li>
              {source.attachments.map((name) => (
                <li key={name}>
                  <span className="gp-evidence-kind">附件</span>
                  <span className="gp-path">{name}</span>
                </li>
              ))}
              <li>
                <span className="gp-evidence-kind">来源哈希</span>
                <span className="gp-path">{source.contentHash}</span>
              </li>
            </ul>
          </div>

          <div className="gp-assistant">
            <h3>AI 归纳与建议</h3>
            <p>{selected.aiSummary}</p>
            <p className="gp-assistant-plan">{selected.aiDraftPlan}</p>
            <p className="gp-assistant-note">
              建议未执行。识别、归类和起草都由 AI 做，确认由你做——候选没被确认之前，
              项目、排期、反馈和结项的数据一个字节都不会变。
            </p>
          </div>

          {issues.length > 0 && selected.status !== 'Confirmed' && (
            <div className="gp-block-box">
              <h3>确认被阻断</h3>
              <ul>
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {selected.status === 'Confirmed' && (
            <div className="gp-block-box is-ok">
              <h3>已生成正式记录</h3>
              <p>
                {recordLabel(selected.confirmedRecordKind)} ·{' '}
                <strong>{selected.confirmedRecordId}</strong>
                <br />
                {selected.confirmedAt?.slice(0, 16).replace('T', ' ')} 由 {selected.confirmedBy} 确认
              </p>
            </div>
          )}

          {selected.status === 'Ignored' && selected.ignoredReason && (
            <div className="gp-block-box">
              <h3>忽略原因</h3>
              <p>{selected.ignoredReason}</p>
            </div>
          )}

          <div
            className={`gp-detail-actions gp-inbox-actions${
              selected.status === 'NeedsReview' || selected.status === 'New' ? '' : ' is-single'
            }`}
          >
            {selected.status === 'NeedsReview' || selected.status === 'New' ? (
              <>
                <button
                  type="button"
                  className="gp-btn"
                  onClick={() => store.ignoreCandidate(selected.id, '与正式流程无关')}
                >
                  忽略候选
                </button>
                <button
                  type="button"
                  className="gp-btn gp-btn-primary"
                  disabled={!ready}
                  title={ready ? undefined : issues.join('；')}
                  onClick={() => store.confirmCandidate(selected.id)}
                >
                  {ready ? CONFIRM_LABEL[selected.kind] : '确认（被阻断）'}
                </button>
              </>
            ) : selected.status === 'Confirmed' ? (
              <button
                type="button"
                className="gp-btn gp-btn-primary"
                onClick={() => onNavigate(FOLLOW_UP[selected.kind].route)}
              >
                {FOLLOW_UP[selected.kind].label}
              </button>
            ) : (
              <button
                type="button"
                className="gp-btn"
                onClick={() => store.restoreCandidate(selected.id)}
              >
                退回待确认
              </button>
            )}
          </div>

          {(selected.status === 'Ignored' || selected.status === 'Duplicate') && (
            <p className="gp-reclassify-note">
              判错了可以退回待确认。忽略和判重都不是删除——原文一直留着。
            </p>
          )}
        </aside>
      </div>

      <section className="gp-card gp-connectors" aria-label="接入来源状态">
        <header className="gp-card-head">
          <h2>
            接入来源状态
            <small>官方接口要企业管理员审批，所以先把不需要审批的四条路做实</small>
          </h2>
        </header>
        <div className="gp-connector-grid">
          <div className="gp-connector is-on">
            <strong>粘贴文本 / 截图文字</strong>
            <span className="gp-pill is-plan">可用</span>
            <p>零审批。整段贴进来，原文保存为证据。</p>
          </div>
          <div className="gp-connector is-on">
            <strong>文件路径</strong>
            <span className="gp-pill is-plan">可用</span>
            <p>零审批。按「资产名_阶段名_日期_版本」解析，不规范时留原名手工关联。</p>
          </div>
          <div className="gp-connector">
            <strong>公司邮箱</strong>
            <span className="gp-pill is-plain">未接入</span>
            <p>读本人邮箱属委托授权，门槛低；读全公司邮箱需管理员同意。当前用转发到共享邮箱替代。</p>
          </div>
          <div className="gp-connector">
            <strong>企业微信 / 飞书</strong>
            <span className="gp-pill is-plain">未接入</span>
            <p>自建应用必须企业管理员创建授权，个人申请不到。当前用转发给机器人后粘贴替代。</p>
          </div>
        </div>
      </section>
    </div>
  )
}

interface FieldEditorProps {
  field: CandidateField
  assetOptions: Array<{ value: string; label: string }>
  stageOptions: Array<{ value: string; label: string }>
  onCommit: (value: string) => void
  onCancel: () => void
}

/** 关联资产与制作阶段用下拉，其余用文本框——下拉能防止手打出一个不存在的资产。 */
function FieldEditor({ field, assetOptions, stageOptions, onCommit, onCancel }: FieldEditorProps) {
  const [value, setValue] = useState(field.value ?? '')
  const options =
    field.key === 'assetId' ? assetOptions : field.key === 'stageCode' ? stageOptions : undefined

  return (
    <div className="gp-field-editor">
      {options && options.length > 0 ? (
        <select
          className="gp-input"
          aria-label={field.label}
          value={value}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
        >
          <option value="">请选择…</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="gp-input"
          aria-label={field.label}
          value={value}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
        />
      )}
      <div className="gp-field-editor-actions">
        <button type="button" className="gp-btn gp-btn-sm" onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          className="gp-btn gp-btn-sm gp-btn-primary"
          onClick={() => onCommit(value)}
        >
          保存
        </button>
      </div>
    </div>
  )
}
