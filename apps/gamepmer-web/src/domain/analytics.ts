import { projectQuoteSummary } from './quotation'
import { EMPTY_CALENDAR, countWorkdays } from './workCalendar'
import type { DemoState, IsoDate, StageCode, StagePlan, WorkCalendar } from './model'

/**
 * 智能分析。
 *
 * 这一层**不产生任何新数据**，只是项目、阶段、反馈、报价和结项这些正式记录的投影。
 * 每个数字都能追回到具体阶段——算不出来就不显示，绝不为了图表好看凑一个。
 *
 * 两条硬约束：
 * 1. **客户等待与团队延期分开算。** 客户拖的不能记在制作组头上，这是归因的全部意义。
 * 2. **不下钻到个人。** 统计只到制作组 / 项目 / 资产 / 阶段——
 *    这不是没做，是设计上不做，所以输出结构里根本没有人名字段。
 */

export type DelayCause = 'client-wait' | 'rework' | 'team-delay' | 'dependency'

export const DELAY_CAUSE_LABEL: Record<DelayCause, string> = {
  'client-wait': '客户等待',
  rework: '范围内返修',
  'team-delay': '团队延期',
  dependency: '依赖阻塞',
}

/** 口径写在这里，界面与计算引同一份——口径没说清，开会时一定会吵。 */
export const METRIC_DEFINITION = {
  onTimeRate: '实际完成 ≤ 当前计划完成',
  baseline: '偏差按基准算，延期按当前计划算',
  clientWait: '提交客户 → 客户确认，单独计，不进团队延期',
  teamDelay: '已扣除客户等待、返修与依赖阻塞',
  rework: '范围内反馈触发的重做次数',
  scope: '统计对象只到制作组 / 项目 / 资产 / 阶段，不统计任何个人维度',
} as const

// ---------------------------------------------------------------- 阶段结论

export interface StageOutcome {
  stageId: string
  projectCode: string
  assetId: string
  stageName: string
  stageCode: StageCode
  productionGroupId: string
  onTime: boolean
  /** 实际完成比当前计划晚了几个工作日；按期则为 0 */
  delayWorkdays: number
  cause?: DelayCause
  /** 提交客户到客户确认之间的等待，单独算 */
  clientWaitWorkdays: number
  estimatedPersonDays: number
  /** 实际跨了几个工作日 */
  actualWorkdays: number
}

function calendarOf(state: DemoState): WorkCalendar {
  return state.calendars[0] ?? EMPTY_CALENDAR
}

/**
 * 这个阶段的**制作延期**该算在谁头上。
 *
 * 注意这里不看客户等待：`delayWorkdays` 比的是实际完成 vs 计划完成，
 * 发生在**提交客户之前**，客户还没看到东西，不可能是客户造成的。
 * 客户等待是提交之后的另一段时间，单独成一类，两者互不相消。
 *
 * 把「后来还等过客户」的阶段整段算到客户头上，团队延期就会永远是 0——
 * 那样这个指标就没用了。
 */
function attribute(stage: StagePlan): DelayCause {
  if (stage.flags.includes('Rework')) return 'rework'
  if (stage.flags.includes('WaitingChangeQuote')) return 'dependency'
  return 'team-delay'
}

/**
 * 每个**已完成**阶段的结论。
 *
 * 没有实际完成日的阶段不算按期也不算延期——还没做完的东西不进分母。
 */
export function stageOutcomes(state: DemoState): StageOutcome[] {
  const calendar = calendarOf(state)
  const outcomes: StageOutcome[] = []

  for (const project of state.projects) {
    for (const asset of project.assets) {
      for (const stage of asset.stages) {
        if (!stage.actualFinish) continue

        const clientWait =
          stage.submittedToClientAt && stage.clientApprovedAt
            ? Math.max(0, countWorkdays(stage.submittedToClientAt, stage.clientApprovedAt, calendar) - 1)
            : 0

        const late = stage.actualFinish > stage.currentFinish
        const delayWorkdays = late
          ? Math.max(0, countWorkdays(stage.currentFinish, stage.actualFinish, calendar) - 1)
          : 0

        outcomes.push({
          stageId: stage.id,
          projectCode: project.code,
          assetId: asset.id,
          stageName: stage.name,
          stageCode: stage.code,
          productionGroupId: stage.productionGroupId,
          onTime: !late,
          delayWorkdays,
          cause: delayWorkdays > 0 ? attribute(stage) : undefined,
          clientWaitWorkdays: clientWait,
          estimatedPersonDays: stage.estimatedPersonDays,
          actualWorkdays: stage.actualStart
            ? Math.max(1, countWorkdays(stage.actualStart, stage.actualFinish, calendar))
            : 0,
        })
      }
    }
  }

  return outcomes
}

// ---------------------------------------------------------------- 归因

export interface AttributionRow {
  cause: DelayCause
  workdays: number
  /** 占全部延期工作日的比例；没有延期时为 0 */
  share: number
}

/**
 * 延期归因。
 *
 * 客户等待单独成一类，**不并进团队延期**——把客户拖的算成团队的账，
 * 是这套指标最容易犯也最伤人的错。
 */
export function delayAttribution(state: DemoState, projectCode?: string): AttributionRow[] {
  const outcomes = stageOutcomes(state).filter(
    (outcome) => !projectCode || outcome.projectCode === projectCode,
  )

  const buckets: Record<DelayCause, number> = {
    'client-wait': 0,
    rework: 0,
    'team-delay': 0,
    dependency: 0,
  }

  for (const outcome of outcomes) {
    // 客户等待即使没造成超期也要计入——它确实占掉了日历时间
    buckets['client-wait'] += outcome.clientWaitWorkdays
    // 制作延期与客户等待互不相消：一个阶段可以既做晚了、之后又等了客户
    if (outcome.delayWorkdays > 0 && outcome.cause) {
      buckets[outcome.cause] += outcome.delayWorkdays
    }
  }

  const total = Object.values(buckets).reduce((sum, value) => sum + value, 0)
  return (Object.keys(buckets) as DelayCause[]).map((cause) => ({
    cause,
    workdays: buckets[cause],
    share: total === 0 ? 0 : buckets[cause] / total,
  }))
}

// ---------------------------------------------------------------- 交付表现

export interface DeliveryMetrics {
  finishedStages: number
  onTimeRate: number
  avgReworkRounds: number
  clientWaitShare: number
  teamDelayShare: number
  changeRate: number
  totalDelayWorkdays: number
}

export function deliveryMetrics(state: DemoState, _today: IsoDate): DeliveryMetrics {
  const outcomes = stageOutcomes(state)
  const attribution = delayAttribution(state)

  const assets = state.projects.flatMap((project) => project.assets)
  const reworkItems = state.feedbackBatches
    .flatMap((batch) => batch.items)
    .filter((item) => item.scope === 'in-scope')
  const changedAssets = new Set(
    state.feedbackBatches
      .flatMap((batch) => batch.items)
      .filter((item) => item.scope === 'out-of-scope')
      .map((item) => item.assetId),
  )

  return {
    finishedStages: outcomes.length,
    onTimeRate:
      outcomes.length === 0 ? 0 : outcomes.filter((outcome) => outcome.onTime).length / outcomes.length,
    avgReworkRounds: assets.length === 0 ? 0 : reworkItems.length / assets.length,
    clientWaitShare: attribution.find((row) => row.cause === 'client-wait')!.share,
    teamDelayShare: attribution.find((row) => row.cause === 'team-delay')!.share,
    changeRate: assets.length === 0 ? 0 : changedAssets.size / assets.length,
    totalDelayWorkdays: attribution.reduce((sum, row) => sum + row.workdays, 0),
  }
}

// ---------------------------------------------------------------- 人天偏差

export interface AccuracyRow {
  stageCode: StageCode
  stageName: string
  estimated: number
  actual: number
  deltaPct: number
  samples: number
}

/**
 * 预估 vs 实际。
 *
 * 按阶段类型汇总并带上样本数——一条样本得不出「系统性低估」这种结论，
 * 界面要能看出这个数字有多少底气。
 */
export function estimateAccuracy(state: DemoState): AccuracyRow[] {
  const buckets = new Map<StageCode, { name: string; est: number[]; act: number[] }>()

  for (const outcome of stageOutcomes(state)) {
    if (outcome.actualWorkdays === 0) continue
    const bucket = buckets.get(outcome.stageCode) ?? { name: outcome.stageName, est: [], act: [] }
    bucket.est.push(outcome.estimatedPersonDays)
    bucket.act.push(outcome.actualWorkdays)
    buckets.set(outcome.stageCode, bucket)
  }

  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

  return [...buckets.entries()]
    .map(([stageCode, bucket]) => {
      const estimated = Math.round(mean(bucket.est) * 100) / 100
      const actual = Math.round(mean(bucket.act) * 100) / 100
      return {
        stageCode,
        stageName: bucket.name,
        estimated,
        actual,
        deltaPct: (actual - estimated) / estimated,
        samples: bucket.est.length,
      }
    })
    .sort((a, b) => b.deltaPct - a.deltaPct)
}

// ---------------------------------------------------------------- 项目健康度

export interface HealthRow {
  projectCode: string
  client: string
  name: string
  finishedStages: number
  totalStages: number
  onTimeRate: number
  reworkRounds: number
  delayWorkdays: number
  attribution: AttributionRow[]
  changeAmount: number
  risk: '正常' | '等待客户' | '返修集中' | '已归档'
}

export function projectHealth(state: DemoState, today: IsoDate): HealthRow[] {
  return state.projects.map((project) => {
    const outcomes = stageOutcomes(state).filter((row) => row.projectCode === project.code)
    const stages = project.assets.flatMap((asset) => asset.stages)
    const attribution = delayAttribution(state, project.code)
    const rework = state.feedbackBatches
      .filter((batch) => batch.projectCode === project.code)
      .flatMap((batch) => batch.items)
      .filter((item) => item.scope === 'in-scope').length

    const closeout = state.closeoutCases.find((entry) => entry.projectCode === project.code)
    const awaiting = stages.some((stage) => stage.status === 'AwaitingClient')

    return {
      projectCode: project.code,
      client: project.client,
      name: project.name,
      finishedStages: outcomes.length,
      totalStages: stages.length,
      onTimeRate:
        outcomes.length === 0 ? 0 : outcomes.filter((row) => row.onTime).length / outcomes.length,
      reworkRounds: rework,
      delayWorkdays: attribution.reduce((sum, row) => sum + row.workdays, 0),
      attribution,
      // 只算已开工的追加报价，与报价页的应结口径一致
      changeAmount: projectQuoteSummary(state, project.code).rows
        .filter((row) => row.billable && row.quoteCase.kind === 'change')
        .reduce((sum, row) => sum + row.totals.amount, 0),
      risk:
        closeout?.status === 'Archived'
          ? '已归档'
          : rework >= 2
            ? '返修集中'
            : awaiting
              ? '等待客户'
              : '正常',
    }
  })
}

// ---------------------------------------------------------------- AI 洞察

export interface Insight {
  id: string
  title: string
  body: string
  /** 这条结论是从哪些事实推出来的 */
  evidence: string
  evidenceCount: number
  severity: 'warn' | 'info'
  /** 永远是 false：AI 只建议，不执行 */
  executed: false
}

/**
 * 洞察。
 *
 * 全部从上面的投影推导，**没有事实就不给结论**——
 * 一条硬凑的洞察会让 PM 从此不再相信这一栏。
 */
export function insights(state: DemoState, today: IsoDate): Insight[] {
  const rows: Insight[] = []
  const outcomes = stageOutcomes(state)
  if (outcomes.length === 0) return rows

  const attribution = delayAttribution(state)
  const clientWait = attribution.find((row) => row.cause === 'client-wait')!
  if (clientWait.workdays > 0) {
    rows.push({
      id: 'client-wait',
      title: `客户等待占掉 ${clientWait.workdays} 个工作日`,
      body: `占全部延期的 ${Math.round(clientWait.share * 100)}%。这部分已单独归因，没有计入任何制作组的按期率。可考虑在报价时把等待窗口写进交付条款。`,
      evidence: `${outcomes.filter((row) => row.clientWaitWorkdays > 0).length} 个阶段的提交与确认时间`,
      evidenceCount: outcomes.filter((row) => row.clientWaitWorkdays > 0).length,
      severity: 'info',
      executed: false,
    })
  }

  const worst = estimateAccuracy(state).find((row) => row.deltaPct > 0.15 && row.samples >= 2)
  if (worst) {
    rows.push({
      id: 'estimate',
      title: `${worst.stageName}阶段实际比预估多 ${Math.round(worst.deltaPct * 100)}%`,
      body: `${worst.samples} 个已完成阶段的中位实际 ${worst.actual} 工作日，预估 ${worst.estimated} 人天。建议在报价模板里调整该阶段的默认人天——这会影响对客户的报价，需要总监与 BD 同意。`,
      evidence: `${worst.samples} 个已完成阶段的实际 vs 预估`,
      evidenceCount: worst.samples,
      severity: 'warn',
      executed: false,
    })
  }

  const pendingReview = state.quoteCases.filter((entry) => entry.status === 'AwaitingReview')
  if (pendingReview.length > 0) {
    rows.push({
      id: 'quote-review',
      title: `${pendingReview.length} 件报价卡在复核`,
      body: `复核不通过，受影响资产就一直冻着。其中 ${pendingReview.filter((entry) => entry.kind === 'change').length} 件是追加报价，冻结的阶段无法开工。`,
      evidence: `${pendingReview.length} 张报价案件的状态与提交时间`,
      evidenceCount: pendingReview.length,
      severity: 'warn',
      executed: false,
    })
  }

  const blockedCloseout = state.closeoutCases.filter((entry) => entry.status === 'AwaitingIT')
  if (blockedCloseout.length > 0) {
    rows.push({
      id: 'closeout-it',
      title: `${blockedCloseout.length} 个项目等 IT 备份回执`,
      body: '最终包与客户确认都齐了，只差 IT 的正式回执就能通知 BD 出账。回执没到，钱就一直挂着。',
      evidence: `${blockedCloseout.length} 个结项案件的门禁状态`,
      evidenceCount: blockedCloseout.length,
      severity: 'warn',
      executed: false,
    })
  }

  const unclassified = state.feedbackBatches
    .flatMap((batch) => batch.items)
    .filter((item) => item.status === 'NeedsClassification').length
  if (unclassified > 0) {
    rows.push({
      id: 'feedback-triage',
      title: `${unclassified} 条客户反馈还没分流`,
      body: `${today} 未分流的反馈既不会进返修排期，也不会进追加报价——两边都不动，客户那边却在等。`,
      evidence: `${unclassified} 条资产级反馈项的状态`,
      evidenceCount: unclassified,
      severity: 'warn',
      executed: false,
    })
  }

  return rows
}
