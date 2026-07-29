import { insights } from './analytics'
import type { DemoState, InsightDisposition, InsightVerdict } from './model'

/**
 * 洞察处置。
 *
 * 起因是验收时的一个问题：「建议 · 未执行」在什么情况下会变、AI 建议是不是流转下去就消失了。
 *
 * 答案分两类，这一层就是为了让这个区别在数据上成立：
 *
 * - **卡点型**（还有几条反馈没分流、几件报价卡在复核）盯的是当下还卡着的事实。
 *   事实清掉它自己就没了，**不需要也不接受处置**——给它一个「已采纳」按钮只会
 *   让人以为点了就算办了。
 * - **结论型**（某阶段实际比预估多 15%，建议调报价模板）是决策建议。
 *   PM 看完决定不改，半年后同样的结论又冒出来，没人记得上次为什么否了——
 *   所以这一类必须留痕。
 *
 * 处置记录的是**态度**，不是执行结果。采纳只代表「我认这个结论、我会去做」，
 * 报价模板、排期和通知一个字节都不会被这次点击改动。
 *
 * 依赖方向是单向的：这里 import 分析层去核对洞察真实存在且是结论型，
 * 分析层不反过来 import 这里（它直接读 `state.insightDispositions`）。
 */

export class InsightBlocked extends Error {
  constructor(readonly issues: string[]) {
    super(`洞察处置被阻断：${issues.join('；')}`)
    this.name = 'InsightBlocked'
  }
}

export interface DisposeInsightInput {
  insightId: string
  verdict: InsightVerdict
  /** 「暂不采纳」必须写，「采纳」可不写 */
  reason?: string
  actor: string
  now: string
}

export const VERDICT_LABEL: Record<InsightVerdict, string> = {
  adopted: '已采纳',
  deferred: '暂不采纳',
}

export function dispositionIssues(state: DemoState, input: DisposeInsightInput): string[] {
  const issues: string[] = []
  const row = insights(state, input.now).find((entry) => entry.id === input.insightId)

  if (!row) {
    issues.push(`「${input.insightId}」当前不成立，没有可处置的结论`)
    return issues
  }
  if (row.kind !== 'finding') {
    issues.push('卡点型洞察盯的是还没办完的事，办完了它自己会消失，不需要处置')
    return issues
  }
  if (input.verdict === 'deferred' && !input.reason?.trim()) {
    issues.push('暂不采纳必须写明理由，否则下次同一条结论冒出来没人知道为什么否过')
  }

  return issues
}

export function disposeInsight(state: DemoState, input: DisposeInsightInput): DemoState {
  const issues = dispositionIssues(state, input)
  if (issues.length > 0) throw new InsightBlocked(issues)

  const row = insights(state, input.now).find((entry) => entry.id === input.insightId)!
  const reason = input.reason?.trim()
  const seq = state.insightDispositions.length + 1

  const disposition: InsightDisposition = {
    id: `ID-${input.insightId}-${seq}`,
    insightId: input.insightId,
    verdict: input.verdict,
    at: input.now,
    actor: input.actor,
    reason,
    /** 结论会随数据变，所以把当时的措辞抄一份——不然事后看不懂当初否的是什么 */
    titleAtTime: row.title,
  }

  return {
    ...state,
    insightDispositions: [...state.insightDispositions, disposition],
    auditEvents: [
      ...state.auditEvents,
      {
        id: `AE-insight-${input.insightId}-${input.now}-${seq}`,
        at: input.now,
        actor: input.actor,
        action: `洞察处置：${VERDICT_LABEL[input.verdict]}`,
        targetKind: 'Insight',
        targetId: input.insightId,
        after: row.title,
        reason,
      },
    ],
  }
}
