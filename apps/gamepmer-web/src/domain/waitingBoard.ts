import type { DemoState, IsoDate, StagePlan, WorkCalendar } from './model'
import { EMPTY_CALENDAR, countWorkdays } from './workCalendar'

/**
 * 「现在在等谁」看板。
 *
 * 一个资产阶段的一生就是这条循环：
 *
 *   等团队制作 → 团队交 PM → 我提交客户 → 等客户回话
 *        ▲                                    │
 *        └── 我把反馈发给团队 ← 我判范围定排期 ←┘
 *
 *   客户验收通过 → 离开看板 → 全部资产验收后进结项中心
 *
 * 三条硬规则：
 *
 * 1. **看板是投影，不是第四份状态。** 每张卡都从 `StagePlan.status`、反馈项状态
 *    和通知草稿推导。存一份「看板状态」意味着它迟早和排期对不上，而 PM 会信错的那份。
 * 2. **「等我」必须单独成栏。** 等团队和等客户干着急没用，只有这一栏是今天能动的活。
 *    把它混进另外两栏，看板就退化成状态展示器。
 * 3. **已等待天数按工作日算。** 周末和公司休息日不算团队拖延，也不算客户拖延。
 */

export type WaitingOn = 'me' | 'team' | 'client'

/** 卡片语义。同一个阶段在不同环节要给不同的动作，不能只看阶段状态 */
export type WaitingKind =
  | 'triage' // 客户反馈到了，等我判范围
  | 'send-rework' // 排期改完了，等我把返修通知发给团队
  | 'hand-to-client' // 团队交给我了，等我转交客户
  | 'in-production' // 等团队做
  | 'awaiting-client' // 等客户回话

export interface WaitingCard {
  id: string
  kind: WaitingKind
  waitingOn: WaitingOn
  projectCode: string
  assetId: string
  stageId: string
  stageName: string
  /** 卡片主标题，说清此刻在等什么 */
  headline: string
  /** 一行事实，不加评价 */
  detail: string
  plannedFinish: IsoDate
  /** 已经等了几个工作日；没有明确起算点时为 0 */
  waitedWorkdays: number
  /** 预警只陈述事实，不替 PM 下判断 */
  warnings: string[]
  /** 触发这张卡的反馈项或通知草稿，供界面选中对应对象 */
  sourceId?: string
  /** 一个动作要处理的全部对象。返修通知是组长和艺术总监各一封，只标一封等于没发全 */
  relatedIds?: string[]
}

export interface WaitingBoard {
  me: WaitingCard[]
  team: WaitingCard[]
  client: WaitingCard[]
  /** 已验收、已离开循环的阶段数 */
  approved: number
  /** 全部阶段验收完、可以进结项中心的项目 */
  readyForCloseout: string[]
}

/** 客户超过这个工作日数还没回话就提示一句，PM 自己决定要不要催 */
const CLIENT_SILENCE_WORKDAYS = 3

function calendarFor(state: DemoState, projectCode: string): WorkCalendar {
  const project = state.projects.find((entry) => entry.code === projectCode)
  return state.calendars.find((entry) => entry.id === project?.calendarId) ?? EMPTY_CALENDAR
}

function waited(from: IsoDate | undefined, today: IsoDate, calendar: WorkCalendar): number {
  if (!from || from > today) return 0
  return Math.max(0, countWorkdays(from, today, calendar) - 1)
}

function overdue(stage: StagePlan, today: IsoDate, calendar: WorkCalendar): string[] {
  if (stage.currentFinish >= today) return []
  const days = countWorkdays(stage.currentFinish, today, calendar) - 1
  return days > 0 ? [`已过计划完成日 ${days} 个工作日`] : []
}

export function waitingBoard(state: DemoState, today: IsoDate): WaitingBoard {
  const me: WaitingCard[] = []
  const team: WaitingCard[] = []
  const client: WaitingCard[] = []
  let approved = 0

  const items = state.feedbackBatches.flatMap((batch) =>
    batch.items.map((item) => ({ batch, item })),
  )

  for (const project of state.projects) {
    const calendar = calendarFor(state, project.code)

    for (const asset of project.assets) {
      for (const stage of asset.stages) {
        if (stage.status === 'Approved') {
          approved += 1
          continue
        }
        if (stage.status === 'NotStarted') continue

        const base = {
          projectCode: project.code,
          assetId: asset.id,
          stageId: stage.id,
          stageName: `${asset.id} / ${stage.name}`,
          plannedFinish: stage.currentFinish,
        }

        // ——— 等我：客户反馈到了还没判范围 ———
        // 优先级最高。没判范围，返修排不了、追加报价开不了，整条链停在这里
        const triage = items.find(
          (entry) => entry.item.stageId === stage.id && entry.item.status === 'NeedsClassification',
        )
        if (triage) {
          const pending = items.filter(
            (entry) =>
              entry.item.stageId === stage.id && entry.item.status === 'NeedsClassification',
          ).length
          me.push({
            ...base,
            id: `triage-${stage.id}`,
            kind: 'triage',
            waitingOn: 'me',
            headline: '客户反馈待分流',
            detail: `${triage.batch.id} · ${pending} 条未判范围`,
            waitedWorkdays: waited(triage.batch.receivedAt.slice(0, 10), today, calendar),
            warnings: [],
            sourceId: triage.item.id,
          })
          continue
        }

        // ——— 等我：返修排期定了，团队还不知道 ———
        // 通知没发出去，外面没人知道要返修。这时候归到「等团队」是骗自己
        const unsentAll = state.notificationDrafts.filter(
          (draft) =>
            draft.sourceKind === 'schedule-revision' &&
            draft.status === 'draft' &&
            state.revisions.some(
              (revision) =>
                revision.id === draft.sourceId &&
                revision.changes.some((change) => change.stageId === stage.id),
            ),
        )
        const unsent = unsentAll[0]
        if (unsent && stage.status === 'InProduction') {
          me.push({
            ...base,
            id: `send-${stage.id}`,
            kind: 'send-rework',
            waitingOn: 'me',
            headline: '返修通知待发出',
            detail: `排期已改，团队还不知道——${unsentAll.length} 封待发出，发出后才算真的在等团队`,
            waitedWorkdays: 0,
            warnings: [],
            sourceId: unsent.id,
            relatedIds: unsentAll.map((draft) => draft.id),
          })
          continue
        }

        // ——— 等我：团队交过来了，等我转交客户 ———
        if (stage.status === 'HandedToPm') {
          me.push({
            ...base,
            id: `hand-${stage.id}`,
            kind: 'hand-to-client',
            waitingOn: 'me',
            headline: '团队已交 PM，待提交客户',
            detail: stage.actualFinish ? `团队 ${stage.actualFinish} 交付` : '等我转交客户',
            waitedWorkdays: waited(stage.actualFinish, today, calendar),
            warnings: overdue(stage, today, calendar),
            sourceId: stage.id,
          })
          continue
        }

        // ——— 等客户 ———
        if (stage.status === 'AwaitingClient' || stage.status === 'SubmittedToClient') {
          const days = waited(stage.submittedToClientAt, today, calendar)
          const warnings: string[] = []
          if (days >= CLIENT_SILENCE_WORKDAYS) {
            warnings.push(`客户 ${days} 个工作日未回话（客户等待，不计团队延期）`)
          }
          client.push({
            ...base,
            id: `client-${stage.id}`,
            kind: 'awaiting-client',
            waitingOn: 'client',
            headline: stage.flags.includes('Rework') ? '返修已重提，等客户验收' : '等客户验收',
            detail: stage.submittedToClientAt
              ? `${stage.submittedToClientAt} 提交客户`
              : '已提交客户',
            waitedWorkdays: days,
            warnings,
            sourceId: stage.id,
          })
          continue
        }

        // ——— 等团队 ———
        const rework = stage.flags.includes('Rework')
        const warnings = overdue(stage, today, calendar)
        if (stage.flags.includes('PossibleDelay') && warnings.length === 0) {
          warnings.push('可能延期，尚未收到完成邮件')
        }
        if (stage.flags.includes('WaitingChangeQuote')) {
          warnings.push('等待变更报价，阶段已冻结')
        }
        team.push({
          ...base,
          id: `team-${stage.id}`,
          kind: 'in-production',
          waitingOn: 'team',
          headline: rework ? '团队返修中' : '团队制作中',
          detail: `${stage.ownerName} · 计划 ${stage.currentFinish} 交付`,
          waitedWorkdays: waited(stage.actualStart, today, calendar),
          warnings,
          sourceId: stage.id,
        })
      }
    }
  }

  // 「等我」栏内部也分轻重：客户反馈最急，其次是压着不发的通知
  const order: Record<WaitingKind, number> = {
    triage: 0,
    'send-rework': 1,
    'hand-to-client': 2,
    'in-production': 3,
    'awaiting-client': 4,
  }
  me.sort((a, b) => order[a.kind] - order[b.kind] || a.plannedFinish.localeCompare(b.plannedFinish))
  team.sort((a, b) => b.warnings.length - a.warnings.length || a.plannedFinish.localeCompare(b.plannedFinish))
  client.sort((a, b) => b.waitedWorkdays - a.waitedWorkdays)

  const readyForCloseout = state.projects
    .filter((project) => {
      const stages = project.assets.flatMap((asset) => asset.stages)
      return stages.length > 0 && stages.every((stage) => stage.status === 'Approved')
    })
    .map((project) => project.code)

  return { me, team, client, approved, readyForCloseout }
}
