import { stageStatusLabel } from './lookup'
import type { AuditEvent, DemoState, FeedbackItem, StageMainStatus, StagePlan } from './model'

/**
 * 阶段推进。
 *
 * 起因是验收时的一个问题：反馈分流之后，高模怎么流转到低模？
 *
 * 当时答案是「流转不了」——阶段主状态定义了六个，但整个领域层里只有一条迁移是能走的
 * （收件箱确认「阶段完成」→ 已交 PM）。开工、提交客户、客户验收三个动作根本不存在，
 * 种子数据把每个阶段摆在了漂亮的位置，把这个洞盖住了。连带的后果是结项第一道门禁
 * 从阶段状态推导，于是**一个真正从工作台走完的项目永远到不了结项**。
 *
 * 两条已确认的规则：
 *
 * 1. **下一阶段要等前一阶段客户验收**，不是等它交给 PM。中间那段客户等待会把后续
 *    全部顺延，档期上看得见——这是刻意的，客户拖的时间不该被藏起来。
 * 2. **全部手动。** 工作台只提示「可以开工了」，绝不替 PM 改状态。
 *    与「不自动发信、不自动改排期」是同一条原则。
 */

export class StageFlowBlocked extends Error {
  constructor(readonly issues: string[]) {
    super(`阶段推进被阻断：${issues.join('；')}`)
    this.name = 'StageFlowBlocked'
  }
}

export type StageAction =
  | 'start'
  | 'hand-to-pm'
  | 'submit-to-client'
  | 'client-approve'
  | 'client-rework'

export const STAGE_ACTION_LABEL: Record<StageAction, string> = {
  start: '标记开工',
  'hand-to-pm': '已交 PM',
  'submit-to-client': '已提交客户',
  'client-approve': '客户已验收',
  'client-rework': '客户要返修',
}

/** 每个动作把阶段推到哪个状态。改这张表等于改状态机，别在别处再写一遍 */
const TARGET: Record<StageAction, StageMainStatus> = {
  start: 'InProduction',
  'hand-to-pm': 'HandedToPm',
  'submit-to-client': 'AwaitingClient',
  'client-approve': 'Approved',
  // 客户要改 → 东西回到制作。范围内外由反馈中心分流决定，这里先不预判
  'client-rework': 'InProduction',
}

/** 每个动作要求的前置状态 */
const REQUIRED_FROM: Record<StageAction, StageMainStatus[]> = {
  start: ['NotStarted'],
  'hand-to-pm': ['InProduction'],
  // 「已交 PM」和「已提交客户」是两件事，但 PM 取件后可能当场就转交客户
  'submit-to-client': ['HandedToPm', 'SubmittedToClient'],
  'client-approve': ['AwaitingClient', 'SubmittedToClient'],
  // 等客户只有两个出口：验收，或者客户要改
  'client-rework': ['AwaitingClient', 'SubmittedToClient'],
}

export function findStageById(state: DemoState, stageId: string): StagePlan | undefined {
  return state.projects
    .flatMap((project) => project.assets)
    .flatMap((asset) => asset.stages)
    .find((stage) => stage.id === stageId)
}

/** 同一资产上排在它前面的那个阶段。资产的第一个阶段没有前置 */
function previousStage(state: DemoState, stage: StagePlan): StagePlan | undefined {
  const asset = state.projects
    .flatMap((project) => project.assets)
    .find((entry) => entry.id === stage.assetId)
  if (!asset) return undefined
  const index = asset.stages.findIndex((entry) => entry.id === stage.id)
  return index > 0 ? asset.stages[index - 1] : undefined
}

export function stageBlockingIssues(
  state: DemoState,
  stageId: string,
  action: StageAction,
): string[] {
  const stage = findStageById(state, stageId)
  if (!stage) return [`找不到阶段 ${stageId}`]

  const issues: string[] = []
  if (!REQUIRED_FROM[action].includes(stage.status)) {
    issues.push(
      `当前是「${stageStatusLabel(stage)}」，${STAGE_ACTION_LABEL[action]}要求先到「${
        REQUIRED_FROM[action].map((status) => STATUS_LABEL[status]).join('」或「')
      }」`,
    )
  }

  // 冻结就是冻结：既不能开工，也不能把它做完交上去，
  // 否则「只冻受影响资产」形同虚设
  if (
    (action === 'start' || action === 'hand-to-pm') &&
    stage.flags.includes('WaitingChangeQuote')
  ) {
    issues.push('这个阶段在等待变更报价，追加报价开工前不能动工')
  }

  if (action === 'start') {
    const previous = previousStage(state, stage)
    if (previous && previous.status !== 'Approved') {
      issues.push(
        `前一阶段「${previous.name}」还没客户验收（当前「${stageStatusLabel(previous)}」）——` +
          `交给 PM 不等于客户认了`,
      )
    }
  }

  return issues
}

const STATUS_LABEL: Record<StageMainStatus, string> = {
  NotStarted: '未开始',
  InProduction: '制作中',
  HandedToPm: '已交 PM',
  SubmittedToClient: '已提交客户',
  AwaitingClient: '等待客户',
  Approved: '已验收',
}

/**
 * 当前能做的动作。
 *
 * 界面据此决定给哪个按钮，也是「每个非终态都有出路」的守卫：
 * 任何一个还没验收的阶段若给不出动作，测试会当场失败。
 */
export function availableStageActions(state: DemoState, stageId: string): StageAction[] {
  const stage = findStageById(state, stageId)
  if (!stage || stage.status === 'Approved') return []
  return (Object.keys(TARGET) as StageAction[]).filter(
    (action) => stageBlockingIssues(state, stageId, action).length === 0,
  )
}

/**
 * 当前状态下**该做的下一步**。
 *
 * 用来给「为什么动不了」定位到一条理由。把四个动作的前置条件全列出来，
 * 会得到三条「当前是未开始，已交 PM 要求先到制作中」——那是在背状态机，
 * 不是在回答 PM 的问题。
 */
export function naturalAction(stage: StagePlan): StageAction | undefined {
  switch (stage.status) {
    case 'NotStarted':
      return 'start'
    case 'InProduction':
      return 'hand-to-pm'
    case 'HandedToPm':
      return 'submit-to-client'
    case 'SubmittedToClient':
    case 'AwaitingClient':
      // 等客户有两个出口，验收是「顺利那条」，用它来解释为什么动不了
      return 'client-approve'
    default:
      return undefined
  }
}

/**
 * 阻塞处的去处。
 *
 * 说清「为什么动不了」只是一半，另一半是「那我该去哪」。
 * 只给理由不给去处，PM 还得自己在十个模块里找那张卡着的单子。
 */
export interface StageBlockJump {
  label: string
  kind: 'stage' | 'quote'
  targetId: string
}

export function stageBlockJumps(state: DemoState, stageId: string): StageBlockJump[] {
  const stage = findStageById(state, stageId)
  if (!stage) return []

  const jumps: StageBlockJump[] = []

  if (stage.flags.includes('WaitingChangeQuote')) {
    // 冻结一定来自某条判为范围外的反馈，顺着它找到那张报价案件
    const request = state.changeRequests.find((entry) => {
      const item = state.feedbackBatches
        .flatMap((batch) => batch.items)
        .find((row) => row.id === entry.sourceFeedbackItemId)
      return item?.stageId === stage.id
    })
    const quoteCase = request
      ? state.quoteCases.find(
          (entry) => entry.changeRequestId === request.id || entry.id === request.id,
        )
      : undefined
    if (quoteCase) {
      jumps.push({ label: `去 ${quoteCase.id} 推进追加报价`, kind: 'quote', targetId: quoteCase.id })
    }
  }

  const previous = previousStage(state, stage)
  if (stage.status === 'NotStarted' && previous && previous.status !== 'Approved') {
    jumps.push({ label: `去看「${previous.name}」`, kind: 'stage', targetId: previous.id })
  }

  return jumps
}

export interface AdvanceInput {
  actor: string
  now: string
  /**
   * 返修时是**客户原话**，必填。
   *
   * 「客户要改」而不记下客户说了什么，等于把证据丢了：
   * 之后没法判范围内外、没法估返修人天、也没法在结项时拿出来对账。
   */
  note?: string
}

/**
 * 推进一个阶段。
 *
 * **只写实际发生的日期，绝不碰计划与基准。** 计划改动走排期重排，基准从头到尾不可覆盖——
 * 让推进顺手改一下计划，「实际 vs 计划」的偏差就永远是 0，整页分析立刻失去意义。
 */
export function advanceStage(
  state: DemoState,
  stageId: string,
  action: StageAction,
  input: AdvanceInput,
): DemoState {
  const issues = stageBlockingIssues(state, stageId, action)
  if (issues.length > 0) throw new StageFlowBlocked(issues)
  if (action === 'client-rework' && !input.note?.trim()) {
    throw new StageFlowBlocked([
      '返修要记下客户原话——不记就没法判范围内外、没法估人天，结项时也拿不出来对账',
    ])
  }

  const stage = findStageById(state, stageId)!
  const today = input.now.slice(0, 10)
  const next = TARGET[action]

  const patch: Partial<StagePlan> = { status: next }
  if (action === 'client-rework') {
    // 返修标记让它在甘特上一眼可辨；客户确认日要清掉——客户并没有确认
    patch.clientApprovedAt = undefined
    patch.flags = stage.flags.includes('Rework') ? stage.flags : [...stage.flags, 'Rework']
  }
  if (action === 'start') patch.actualStart = stage.actualStart ?? today
  if (action === 'hand-to-pm') patch.actualFinish = stage.actualFinish ?? today
  if (action === 'submit-to-client') patch.submittedToClientAt = stage.submittedToClientAt ?? today
  if (action === 'client-approve') {
    patch.clientApprovedAt = today
    // 验收即意味着这一轮返修结束，标记不该赖着不走
    patch.flags = stage.flags.filter((flag) => flag !== 'Rework' && flag !== 'PossibleDelay')
  }

  const audit: AuditEvent = {
    id: `AE-stage-${stageId}-${state.auditEvents.length + 1}`,
    at: input.now,
    actor: input.actor,
    action: `阶段推进：${STAGE_ACTION_LABEL[action]}`,
    targetKind: 'StagePlan',
    targetId: stageId,
    before: stage.status,
    after: next,
    reason: input.note,
  }

  let next2: DemoState = {
    ...state,
    projects: state.projects.map((project) => ({
      ...project,
      assets: project.assets.map((asset) => ({
        ...asset,
        stages: asset.stages.map((row) => (row.id === stageId ? { ...row, ...patch } : row)),
      })),
    })),
    auditEvents: [...state.auditEvents, audit],
  }

  if (action === 'client-rework') {
    next2 = recordClientRework(next2, stage, input)
  }
  // 交回客户即「已重提」；客户点头即「已关闭」——反馈项不该停在 InRework 再也不动
  if (action === 'submit-to-client') next2 = markFeedback(next2, stageId, 'InRework', 'Resubmitted')
  if (action === 'client-approve') {
    next2 = markFeedback(next2, stageId, 'Resubmitted', 'Closed')
    next2 = markFeedback(next2, stageId, 'InRework', 'Closed')
  }

  return next2
}

/**
 * 返修时把客户原话登记成一条**待分流**的资产级反馈项。
 *
 * 直接改状态就完事，等于绕过了整条反馈线：范围内返修与范围外追加报价的分岔
 * 就在分流那一步，没有反馈项就没有那个分岔。
 */
function recordClientRework(state: DemoState, stage: StagePlan, input: AdvanceInput): DemoState {
  const project = state.projects.find((entry) =>
    entry.assets.some((asset) => asset.id === stage.assetId),
  )
  if (!project) return state

  const today = input.now.slice(0, 10)
  // 同一天同一项目的客户回话归到一个批次里，不要一条一个批次
  const existing = state.feedbackBatches.find(
    (batch) => batch.projectCode === project.code && batch.receivedAt.slice(0, 10) === today,
  )

  const item: FeedbackItem = {
    id: `${existing?.id ?? nextBatchId(state)}/ITEM-${String((existing?.items.length ?? 0) + 1).padStart(2, '0')}`,
    batchId: existing?.id ?? nextBatchId(state),
    assetId: stage.assetId,
    stageId: stage.id,
    title: input.note!.trim().slice(0, 30),
    originalText: input.note!.trim(),
    // 范围内外由 PM 在反馈中心判，这里不预判
    scope: 'unclassified',
    status: 'NeedsClassification',
    ownerName: stage.ownerName,
    estimatedReworkDays: 1,
  }

  if (existing) {
    return {
      ...state,
      feedbackBatches: state.feedbackBatches.map((batch) =>
        batch.id !== existing.id ? batch : { ...batch, items: [...batch.items, item] },
      ),
    }
  }

  return {
    ...state,
    feedbackBatches: [
      ...state.feedbackBatches,
      {
        id: item.batchId,
        projectCode: project.code,
        client: project.client,
        receivedAt: input.now,
        feedbackDrivePath: `\\\\NAS-ART\\Feedback\\${project.code}\\${item.batchId}`,
        summary: `${stage.assetId} ${stage.name} 提交后客户要求修改`,
        evidence: [],
        items: [item],
        clientWaitWorkdays: 0,
      },
    ],
  }
}

function nextBatchId(state: DemoState): string {
  const max = state.feedbackBatches.reduce((acc, batch) => {
    const hit = batch.id.match(/^F-(\d+)/)
    return hit ? Math.max(acc, Number(hit[1])) : acc
  }, 0)
  return `F-${String(max + 1).padStart(3, '0')}`
}

/** 把这个阶段上处于 `from` 的反馈项推到 `to`。 */
function markFeedback(
  state: DemoState,
  stageId: string,
  from: FeedbackItem['status'],
  to: FeedbackItem['status'],
): DemoState {
  return {
    ...state,
    feedbackBatches: state.feedbackBatches.map((batch) => ({
      ...batch,
      items: batch.items.map((item) =>
        item.stageId === stageId && item.status === from ? { ...item, status: to } : item,
      ),
    })),
  }
}
