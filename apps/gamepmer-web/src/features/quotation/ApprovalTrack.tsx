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
 * 六步固定。第 3 步的标题随复核人实际承担的角色变——同一人兼组长与 BD 时
 * 显示「组长兼 BD」并注明只确认一次，而不是画成两个节点让人以为漏了一步。
 *
 * 04、05 两步是验收时补的：原来复核通过就直接跳到开工，等于把公司内部认可
 * 当成了客户认可。**这条链画几步，实际就得走几步**——链上少一步，
 * 页面就在骗人。
 */
export function ApprovalTrack({ quoteCase, version, reviewerName, reviewerRoles }: ApprovalTrackProps) {
  const merged = reviewerRoles.length > 1
  const roleLabel = reviewerRoles.length > 0 ? reviewerRoles.join(' / ') : '复核人'

  const quoted = Boolean(version)
  const reviewed = version?.review?.decision === 'approve'
  const sent = Boolean(quoteCase.sentToClientAt)
  const replied = Boolean(quoteCase.clientRepliedAt)
  const accepted = replied && quoteCase.status !== 'Rejected'
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
      title: 'BD 报给客户',
      detail: sent
        ? `${quoteCase.sentToClientBy} 于 ${quoteCase.sentToClientAt?.slice(5, 16).replace('T', ' ')} 报给 ${quoteCase.client}`
        : reviewed
          ? '内部认可了，还没报出去'
          : '复核通过后开放',
      state: sent ? 'done' : reviewed ? 'current' : 'blocked',
    },
    {
      no: '05',
      title: '客户确认',
      detail: replied
        ? accepted
          ? `${quoteCase.clientRepliedAt?.slice(5, 16).replace('T', ' ')} 客户确认接受`
          : `客户未接受${quoteCase.clientReplyNote ? ` · ${quoteCase.clientReplyNote}` : ''}`
        : sent
          ? '等客户回话——这段算客户占用，不计团队产能'
          : '报给客户后开放',
      state: replied ? (accepted ? 'done' : 'blocked') : sent ? 'current' : 'blocked',
    },
    {
      no: '06',
      title: quoteCase.kind === 'change' ? 'PM 发出变更开工邮件' : 'PM 发出正式开工邮件',
      detail: started
        ? `${quoteCase.kickoffSentBy} 于 ${quoteCase.kickoffSentAt?.slice(5, 16).replace('T', ' ')} 声明发出`
        : accepted
          ? quoteCase.kind === 'initial'
            ? '发出后才正式建项，排期此刻还没有'
            : '排期尚未变更——发出后才生效'
          : '客户确认后开放',
      state: started ? 'done' : accepted ? 'current' : 'blocked',
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
