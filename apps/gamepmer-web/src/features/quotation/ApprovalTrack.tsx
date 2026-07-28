import type { PersonRole, QuoteCase, QuoteVersion } from '../../domain/model'
import { quoteTotals } from '../../domain/quotation'

interface ApprovalTrackProps {
  quoteCase: QuoteCase
  version?: QuoteVersion
  reviewerName: string
  reviewerRoles: PersonRole[]
}

type StepState = 'done' | 'current' | 'blocked'

/**
 * 审批链。
 *
 * 四步固定，但第 3 步的标题随复核人实际承担的角色变——同一人兼组长与 BD 时
 * 显示「组长兼 BD」并注明只确认一次，而不是画成两个节点让人以为漏了一步。
 */
export function ApprovalTrack({ quoteCase, version, reviewerName, reviewerRoles }: ApprovalTrackProps) {
  const merged = reviewerRoles.length > 1
  const roleLabel = reviewerRoles.length > 0 ? reviewerRoles.join(' / ') : '复核人'

  const quoted = Boolean(version)
  const reviewed = version?.review?.decision === 'approve'
  const started = quoteCase.status === 'KickoffSent'

  const steps: Array<{ no: string; title: string; detail: string; state: StepState; merge?: string }> = [
    {
      no: '01',
      title: quoteCase.kind === 'change' ? 'PM 创建变更' : 'BD 需求受理',
      detail: quoteCase.sourceFeedbackItemId
        ? `来自 ${quoteCase.sourceFeedbackItemId}`
        : `${quoteCase.createdAt.slice(5, 10)} 立案`,
      state: 'done',
    },
    {
      no: '02',
      title: '总监报价排期',
      detail: version
        ? `${version.submittedBy} · ${quoteTotals(version).personDays} 人日 / +${version.scheduleImpactWorkdays} 工作日`
        : `等待 ${quoteCase.directorName} 返回人天与节点`,
      state: quoted ? 'done' : 'current',
    },
    {
      no: '03',
      title: `${roleLabel} 复核`,
      detail: version?.review
        ? `${reviewerName} · ${version.review.decision === 'approve' ? '已通过' : '已驳回'}${version.review.note ? ` · ${version.review.note}` : ''}`
        : quoted
          ? `等待 ${reviewerName} 确认`
          : '总监报价返回后开始',
      state: reviewed ? 'done' : quoted ? 'current' : 'blocked',
      merge: merged ? '同一人员 · 只确认一次' : undefined,
    },
    {
      no: '04',
      title: quoteCase.kind === 'change' ? 'PM 发出变更开工邮件' : 'PM 发出正式开工邮件',
      detail: started
        ? `${quoteCase.kickoffSentBy} 于 ${quoteCase.kickoffSentAt?.slice(5, 16).replace('T', ' ')} 声明发出`
        : reviewed
          ? '排期尚未变更——发出后才生效'
          : '复核通过后开放',
      state: started ? 'done' : reviewed ? 'current' : 'blocked',
    },
  ]

  return (
    <div className="gp-approval">
      <div className="gp-approval-head">
        <span>{quoteCase.kind === 'change' ? '追加报价审批链' : '首次报价审批链'}</span>
        <span>同一人员承担的重复节点自动合并</span>
      </div>
      <ol className="gp-approval-track">
        {steps.map((step) => (
          <li key={step.no} className={`is-${step.state}`}>
            <span className="gp-approval-no">{step.no}</span>
            <strong>{step.title}</strong>
            <span className="gp-approval-detail">{step.detail}</span>
            {step.merge && <em className="gp-merge-flag">{step.merge}</em>}
          </li>
        ))}
      </ol>
    </div>
  )
}
