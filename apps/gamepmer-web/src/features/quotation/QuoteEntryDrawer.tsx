import { useMemo, useState } from 'react'
import type { Project, QuoteLine, QuoteVersion, StageCode } from '../../domain/model'
import { quoteTotals, reviewBlockingIssues } from '../../domain/quotation'

interface QuoteEntryDrawerProps {
  caseId: string
  projectCode: string
  /** 项目还没建出来时为 undefined——首次报价常常就是这种情况 */
  project?: Project
  previous?: QuoteVersion
  defaultUnitPrice?: number
  onCancel: () => void
  onSubmit: (lines: QuoteLine[], scheduleImpactWorkdays: number) => void
}

const STAGE_OPTIONS: Array<{ code: StageCode; label: string; discipline: '2D' | '3D' }> = [
  { code: '2D_SKETCH', label: '草图', discipline: '2D' },
  { code: '2D_DETAIL_50', label: '细化 50%', discipline: '2D' },
  { code: '2D_FINAL', label: '完成稿', discipline: '2D' },
  { code: '3D_MID', label: '中模', discipline: '3D' },
  { code: '3D_HIGH', label: '高模', discipline: '3D' },
  { code: '3D_LOW', label: '低模', discipline: '3D' },
  { code: '3D_BAKE', label: '烘焙', discipline: '3D' },
  { code: '3D_TEXTURE', label: '贴图', discipline: '3D' },
  { code: '3D_LOD', label: 'LOD', discipline: '3D' },
]

const stageLabel = (code: StageCode) => STAGE_OPTIONS.find((o) => o.code === code)?.label ?? code

/**
 * 总监报价录入。
 *
 * 这是 M1 失败点「排期录入退化成两个日期文本框」在报价上的同一个陷阱：
 * 报价**必须展开到每个可验收阶段**，每行都有人天、单价和起止节点。
 * 只填一个总金额的报价没法排产，结项出账时也没法对账。
 *
 * 提交产生新版本，旧版本原样留档——已经复核过的更要留着。
 */
export function QuoteEntryDrawer({
  caseId,
  projectCode,
  project,
  previous,
  defaultUnitPrice = 2000,
  onCancel,
  onSubmit,
}: QuoteEntryDrawerProps) {
  // 退回重报时预填上一版，总监改动即可，不用重打一遍
  const [rows, setRows] = useState<QuoteLine[]>(() =>
    previous ? previous.lines.map((line) => ({ ...line })) : [],
  )
  const [impact, setImpact] = useState(String(previous?.scheduleImpactWorkdays ?? 0))
  const [bulkPrice, setBulkPrice] = useState(String(defaultUnitPrice))

  const assets = project?.assets ?? []
  const stageChoices = useMemo(
    () => (project ? STAGE_OPTIONS.filter((o) => o.discipline === project.discipline) : STAGE_OPTIONS),
    [project],
  )

  const draft: QuoteVersion = {
    id: 'draft',
    caseId,
    version: (previous?.version ?? 0) + 1,
    submittedBy: '',
    submittedAt: '',
    lines: rows,
    scheduleImpactWorkdays: Number(impact) || 0,
  }
  const issues = reviewBlockingIssues(draft)
  const totals = quoteTotals(draft)
  const ready = issues.length === 0

  const patch = (id: string, next: Partial<QuoteLine>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...next } : row)))

  const addRow = (seed?: Partial<QuoteLine>) =>
    setRows((current) => [
      ...current,
      {
        id: `${caseId}/NEW-${current.length + 1}-${Date.now()}`,
        assetId: assets[0]?.id ?? '',
        stageCode: stageChoices[0].code,
        title: '',
        note: '',
        personDays: 0,
        unitPrice: defaultUnitPrice,
        ...seed,
      },
    ])

  const applyTemplate = (discipline: '2D' | '3D') => {
    const assetId = assets[0]?.id ?? ''
    setRows(
      STAGE_OPTIONS.filter((option) => option.discipline === discipline).map((option, index) => ({
        id: `${caseId}/TPL-${index + 1}`,
        assetId,
        stageCode: option.code,
        title: option.label,
        note: '',
        personDays: 0,
        unitPrice: defaultUnitPrice,
      })),
    )
  }

  /** 每行自己的问题，显示在行尾——不要让总监拿着一句「有 6 个错误」去猜是哪一行。 */
  const rowIssue = (row: QuoteLine): string | undefined => {
    if (row.personDays <= 0) return '缺人天'
    if (!row.plannedStart || !row.plannedFinish) return '缺节点'
    if (row.unitPrice <= 0) return '缺单价'
    if (row.plannedStart > row.plannedFinish) return '结束早于开始'
    return undefined
  }

  return (
    <section className="gp-quote-entry" aria-label="录入报价">
      <header className="gp-quote-entry-head">
        <div>
          <h3>录入总监报价 · v{draft.version}</h3>
          <small>
            {previous
              ? `以 v${previous.version} 为底稿修改。提交后生成新版本，v${previous.version} 原样留档。`
              : '报价要展开到每个可验收阶段——只有一个总金额没法排产，也没法在结项时对账。'}
          </small>
        </div>
        <button type="button" className="gp-btn" onClick={onCancel}>
          取消
        </button>
      </header>

      {!project && (
        <p className="gp-quote-entry-note">
          <strong>{projectCode} 还不是正式项目</strong>
          ——首次报价通常先于建项，所以资产和阶段这里可以自由填写。
          客户确认接单后再建项目与资产，届时报价行会与正式排期对上。
        </p>
      )}

      <div className="gp-quote-entry-toolbar">
        <span>阶段模板</span>
        <button type="button" className="gp-btn gp-btn-sm" onClick={() => applyTemplate('3D')}>
          按 3D PBR 模板生成
        </button>
        <button type="button" className="gp-btn gp-btn-sm" onClick={() => applyTemplate('2D')}>
          按 2D 模板生成
        </button>
        <button type="button" className="gp-btn gp-btn-sm" onClick={() => addRow()}>
          新增一行
        </button>
        <span className="gp-quote-entry-sep" />
        <label>
          <span>统一单价</span>
          <input
            className="gp-input gp-input-num"
            aria-label="统一单价"
            value={bulkPrice}
            onChange={(event) => setBulkPrice(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="gp-btn gp-btn-sm"
          onClick={() =>
            setRows((current) => current.map((row) => ({ ...row, unitPrice: Number(bulkPrice) || 0 })))
          }
        >
          应用到所有行
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="gp-empty">还没有工作项。用上面的阶段模板生成，或手工新增一行。</p>
      ) : (
        // 九列在 1440 的中栏放不下。宽内容在自己的容器里横滚，
        // 不允许溢出去盖住右侧详情——那会让「提交」按钮点不着。
        <div className="gp-entry-scroll">
          <table className="gp-entry-table">
            <thead>
            <tr>
              <th>资产</th>
              <th>阶段</th>
              <th>工作项</th>
              <th>人天</th>
              <th>单价</th>
              <th>开始</th>
              <th>结束</th>
              <th>校验</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const issue = rowIssue(row)
              const rowName = `第 ${index + 1} 行`
              return (
                <tr key={row.id} className={issue ? 'is-invalid' : undefined}>
                  <td>
                    {assets.length > 0 ? (
                      <select
                        className="gp-input"
                        aria-label={`${rowName} 资产`}
                        value={row.assetId}
                        onChange={(event) => patch(row.id, { assetId: event.target.value })}
                      >
                        {assets.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.id}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="gp-input"
                        aria-label={`${rowName} 资产`}
                        placeholder="如 COSTUME-01"
                        value={row.assetId}
                        onChange={(event) => patch(row.id, { assetId: event.target.value })}
                      />
                    )}
                  </td>
                  <td>
                    <select
                      className="gp-input"
                      aria-label={`${rowName} 阶段`}
                      value={row.stageCode}
                      onChange={(event) =>
                        patch(row.id, { stageCode: event.target.value as StageCode })
                      }
                    >
                      {stageChoices.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="gp-input"
                      aria-label={`${rowName} 工作项`}
                      placeholder={stageLabel(row.stageCode)}
                      value={row.title}
                      onChange={(event) => patch(row.id, { title: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className={`gp-input gp-input-num${row.personDays <= 0 ? ' is-invalid' : ''}`}
                      aria-label={`${rowName} 人天`}
                      value={row.personDays === 0 ? '' : String(row.personDays)}
                      onChange={(event) => patch(row.id, { personDays: Number(event.target.value) || 0 })}
                    />
                  </td>
                  <td>
                    <input
                      className="gp-input gp-input-num"
                      aria-label={`${rowName} 单价`}
                      value={String(row.unitPrice)}
                      onChange={(event) => patch(row.id, { unitPrice: Number(event.target.value) || 0 })}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      className={`gp-input gp-input-date${row.plannedStart ? '' : ' is-invalid'}`}
                      aria-label={`${rowName} 开始日`}
                      value={row.plannedStart ?? ''}
                      onChange={(event) => patch(row.id, { plannedStart: event.target.value || undefined })}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      className={`gp-input gp-input-date${row.plannedFinish ? '' : ' is-invalid'}`}
                      aria-label={`${rowName} 结束日`}
                      value={row.plannedFinish ?? ''}
                      onChange={(event) =>
                        patch(row.id, { plannedFinish: event.target.value || undefined })
                      }
                    />
                  </td>
                  <td className={`gp-row-flag${issue ? ' is-err' : ' is-ok'}`}>{issue ?? '完整'}</td>
                  <td>
                    <button
                      type="button"
                      className="gp-btn gp-btn-sm"
                      aria-label={`删除${rowName}`}
                      onClick={() => setRows((current) => current.filter((r) => r.id !== row.id))}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              )
            })}
            </tbody>
          </table>
        </div>
      )}

      <footer className="gp-quote-entry-foot">
        <label className="gp-quote-entry-impact">
          <span>对项目工期的影响（工作日）</span>
          <input
            className="gp-input gp-input-num"
            aria-label="工期影响"
            value={impact}
            onChange={(event) => setImpact(event.target.value)}
          />
        </label>
        <p className="gp-quote-entry-summary">
          合计 <b>{totals.personDays}</b> 人日 · <b>¥ {totals.amount.toLocaleString('zh-CN')}</b>
          {issues.length > 0 && (
            <>
              <br />
              <span className="gp-quote-entry-issues">还差 {issues.length} 项：{issues.slice(0, 3).join('；')}
                {issues.length > 3 && ' …'}
              </span>
            </>
          )}
        </p>
        <button
          type="button"
          className="gp-btn gp-btn-primary"
          disabled={!ready}
          title={ready ? undefined : issues.join('；')}
          onClick={() => onSubmit(rows, Number(impact) || 0)}
        >
          {ready ? '提交给组长/BD 复核' : '提交（被阻断）'}
        </button>
      </footer>
    </section>
  )
}
