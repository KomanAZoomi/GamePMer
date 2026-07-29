import { useState } from 'react'
import { BATCH_CODE_EXAMPLE, BATCH_CODE_RULE } from '../../domain/batchCode'
import type { ChangeRequest, DemoState, QuoteKind } from '../../domain/model'
import { createQuoteCaseIssues, type CreateQuoteCaseInput } from '../../domain/quotation'

interface NewCaseDrawerProps {
  demo: DemoState
  today: string
  /** 从「待立案」的变更单点进来时预填——项目、资产、标题不该让人再抄一遍 */
  fromChangeRequest?: ChangeRequest
  onCancel: () => void
  onSubmit: (input: Omit<CreateQuoteCaseInput, 'actor' | 'now'>) => void
}

/**
 * 录入新需求。
 *
 * 需求不是只能从收件箱进来——BD 当面说一句、电话里谈定的，PM 就该能直接录。
 *
 * 两种类型问的东西不一样，这是刻意的：
 * - **首次报价**这时项目还不存在，所以只问客户和**提议的**批次编号，编号只校验格式。
 * - **追加报价**必须挂在已开工的项目上，并指明受影响资产——不然不知道该冻结什么。
 *
 * 校验用的是领域层同一个 `createQuoteCaseIssues`，界面不另写一份。
 */
export function NewCaseDrawer({
  demo,
  today,
  fromChangeRequest,
  onCancel,
  onSubmit,
}: NewCaseDrawerProps) {
  const source = fromChangeRequest
  const sourceItem = source
    ? demo.feedbackBatches
        .flatMap((batch) => batch.items)
        .find((item) => item.id === source.sourceFeedbackItemId)
    : undefined

  const [kind, setKind] = useState<QuoteKind>(source ? 'change' : 'initial')
  const [client, setClient] = useState('')
  const [projectCode, setProjectCode] = useState(source?.projectCode ?? '')
  const [title, setTitle] = useState(source?.title ?? '')
  // 客户原话即需求。让 PM 自己转述一遍只会丢细节
  const [requirement, setRequirement] = useState(sourceItem?.originalText ?? '')
  const [dueDate, setDueDate] = useState('')
  const [assetIds, setAssetIds] = useState<string[]>(source ? [source.assetId] : [])

  const project = demo.projects.find((entry) => entry.code === projectCode)
  const clients = [...new Set(demo.projects.map((entry) => entry.client))]

  const draft: Omit<CreateQuoteCaseInput, 'actor' | 'now'> = {
    kind,
    projectCode,
    title,
    requirement,
    changeRequestId: source?.id,
    sourceFeedbackItemId: source?.sourceFeedbackItemId,
    client: kind === 'initial' ? client : undefined,
    dueDate: dueDate || undefined,
    affectedAssetIds: kind === 'change' ? assetIds : undefined,
  }
  const issues = createQuoteCaseIssues(demo, { ...draft, actor: 'Brandon', now: today })

  function switchKind(next: QuoteKind) {
    setKind(next)
    // 两种类型的编号含义完全不同：一个是还不存在的提议，一个是已开工的项目。
    // 留着上一个会让人以为填过了
    setProjectCode('')
    setAssetIds([])
  }

  return (
    <section className="gp-new-case" aria-label="录入新需求">
      <header className="gp-card-head">
        <h2>
          {source ? `为 ${source.id} 立报价案件` : '录入新需求'}
          <small>
            {source
              ? `来自反馈 ${source.sourceFeedbackItemId} 的范围外判定，${source.assetId} 的阶段已冻结`
              : '录进来只是承认「这是一条真需求」，人天和金额由总监填'}
          </small>
        </h2>
        <button type="button" className="gp-btn gp-btn-sm" onClick={onCancel}>
          取消
        </button>
      </header>

      <div className="gp-new-case-body">
        <div className="gp-kind-switch" role="group" aria-label="需求类型">
          <button
            type="button"
            className={`gp-chip${kind === 'initial' ? ' is-active' : ''}`}
            onClick={() => switchKind('initial')}
          >
            首次报价 · 新项目
          </button>
          <button
            type="button"
            className={`gp-chip${kind === 'change' ? ' is-active' : ''}`}
            onClick={() => switchKind('change')}
          >
            追加报价 · 已开工项目
          </button>
        </div>

        <div className="gp-new-case-grid">
          {kind === 'initial' ? (
            <>
              <label htmlFor="gp-nc-client">
                <span>客户</span>
                <input
                  id="gp-nc-client"
                  aria-label="客户"
                  className="gp-input"
                  list="gp-client-options"
                  value={client}
                  onChange={(event) => setClient(event.target.value)}
                  placeholder="客户公司名"
                />
                <datalist id="gp-client-options">
                  {clients.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </label>
              <label htmlFor="gp-nc-code">
                <span>批次编号</span>
                <input
                  id="gp-nc-code"
                  aria-label="批次编号"
                  className="gp-input"
                  value={projectCode}
                  onChange={(event) => setProjectCode(event.target.value.toUpperCase())}
                  placeholder={BATCH_CODE_EXAMPLE}
                />
                <em>
                  {BATCH_CODE_RULE}。此刻只是<strong>提议</strong>——客户确认、发出开工通知后才建项。
                </em>
              </label>
            </>
          ) : (
            <>
              <label htmlFor="gp-nc-project">
                <span>挂到哪个项目</span>
                <select
                  id="gp-nc-project"
                  aria-label="挂到哪个项目"
                  className="gp-input"
                  value={projectCode}
                  onChange={(event) => {
                    setProjectCode(event.target.value)
                    setAssetIds([])
                  }}
                >
                  <option value="">选择已开工的项目</option>
                  {demo.projects.map((entry) => (
                    <option key={entry.code} value={entry.code}>
                      {entry.code} · {entry.name}
                    </option>
                  ))}
                </select>
                <em>客户从项目上取，不用再填一遍。</em>
              </label>
              <label htmlFor="gp-nc-assets">
                <span>受影响资产</span>
                <div className="gp-asset-picks" id="gp-nc-assets" role="group" aria-label="受影响资产">
                  {project ? (
                    project.assets.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        className={`gp-chip${assetIds.includes(asset.id) ? ' is-active' : ''}`}
                        onClick={() =>
                          setAssetIds((prev) =>
                            prev.includes(asset.id)
                              ? prev.filter((id) => id !== asset.id)
                              : [...prev, asset.id],
                          )
                        }
                      >
                        {asset.id} · {asset.name}
                      </button>
                    ))
                  ) : (
                    <span className="gp-empty-inline">先选项目</span>
                  )}
                </div>
                <em>只有选中的资产会被冻结在「等待变更报价」，其余照常制作。</em>
              </label>
            </>
          )}

          <label htmlFor="gp-nc-title">
            <span>需求标题</span>
            <input
              id="gp-nc-title"
                  aria-label="需求标题"
              className="gp-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="一句话说清是什么活"
            />
          </label>
          <label htmlFor="gp-nc-due">
            <span>期望交付（选填）</span>
            <input
              id="gp-nc-due"
                  aria-label="期望交付"
              className="gp-input"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
        </div>

        <label className="gp-new-case-req" htmlFor="gp-nc-req">
          <span>需求描述</span>
          <textarea
            id="gp-nc-req"
                  aria-label="需求描述"
            className="gp-input"
            rows={3}
            value={requirement}
            onChange={(event) => setRequirement(event.target.value)}
            placeholder="把 BD 的原话贴进来。总监拿着这段出人天与节点，别自己转述丢细节"
          />
        </label>

        {issues.length > 0 && (
          <div className="gp-block-box">
            <h3>还不能立案</h3>
            <ul>
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="gp-detail-actions">
          <button
            type="button"
            className="gp-btn gp-btn-primary"
            disabled={issues.length > 0}
            title={issues[0]}
            onClick={() => onSubmit(draft)}
          >
            {issues.length > 0 ? '立案（被阻断）' : '立案并交给总监报价'}
          </button>
        </div>
        <p className="gp-reclassify-note">
          立案<strong>不建项目、不动排期</strong>。它只是让这条需求进入报价流程，
          停在「总监报价中」等人天与节点。
        </p>
      </div>
    </section>
  )
}
