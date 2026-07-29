import {
  BATCH_CODE_EXAMPLE,
  BATCH_CODE_RULE,
  findBatchCode,
  parseBatchCode,
} from './batchCode'
import {
  CloseoutBlocked,
  completeGate as completeCloseoutGate,
  gateBlockingIssues,
} from './closeout'
import type {
  AuditEvent,
  CandidateField,
  CandidateKind,
  DemoState,
  EvidenceRef,
  FeedbackBatch,
  FeedbackItem,
  InboxCandidate,
  Project,
  QuoteCase,
  SourceChannel,
  SourceRecord,
  StageCode,
  StagePlan,
} from './model'
import { STAGE_LABEL } from './model'

/**
 * 候选收件箱。
 *
 * 这一层的全部意义是**闸门**：外部消息进来先变成候选，正式的项目、排期、反馈和结项数据
 * 在 PM 按下确认之前不许动一个字节。三条不能破的规则：
 *
 * 1. 来源不可变。识别错了改候选字段，不改原文——原文是证据。
 * 2. 识别不出来就留空，绝不编造。宁可阻断确认，也不给一个看起来合理的假项目号。
 * 3. 确认是原子事务。有阻断整体拒绝，不出现「正式记录建了一半」。
 */

/** 必填字段低于这个置信度就要 PM 亲自过目，光有值不算数。 */
export const CONFIDENCE_THRESHOLD = 0.7

export class CandidateBlocked extends Error {
  constructor(readonly issues: string[]) {
    super(`候选无法确认：${issues.join('；')}`)
    this.name = 'CandidateBlocked'
  }
}

// ---------------------------------------------------------------- 去重

/**
 * 内容哈希。
 *
 * 忽略首尾空白、连续空白和大小写——同一封邮件粘两次、或先粘贴再转发，
 * 字面上会有细微差别，但它就是同一条消息，不该让 PM 确认两遍。
 */
export function contentHash(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ').toLowerCase()
  // FNV-1a：够稳定、够短、不需要引依赖
  let hash = 0x811c9dc5
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

// ---------------------------------------------------------------- 门禁

const KIND_LABEL: Record<CandidateKind, string> = {
  'client-feedback': '客户反馈',
  'stage-done': '阶段完成',
  'quote-request': '报价需求',
  'it-receipt': 'IT 回执',
}

export function requiredFields(candidate: InboxCandidate): CandidateField[] {
  return candidate.fields.filter((field) => field.required)
}

/** 综合置信度取必填字段里最低的那个——一项没谱，整条就没谱。 */
export function overallConfidence(candidate: InboxCandidate): number {
  const required = requiredFields(candidate)
  if (required.length === 0) return 1
  return Math.min(...required.map((field) => field.confidence))
}

/**
 * 确认前的全部阻断理由。
 *
 * **必须把 `state` 一起看。** 只看字段填没填，会出现「按钮是亮的、点下去在
 * `confirmCandidate` 里抛错、界面什么都不发生」——验收时就是这么卡住的。
 * 凡是确认时会抛的，这里都要先说出来，让按钮直接是灰的并写明原因。
 */
export function blockingIssues(state: DemoState, candidate: InboxCandidate): string[] {
  const issues: string[] = []

  if (candidate.status === 'Confirmed') issues.push('该候选已确认，不能重复确认')
  if (candidate.status === 'Ignored') issues.push('该候选已忽略，需要先恢复')
  if (candidate.status === 'Duplicate') issues.push('该候选已标记为重复')

  for (const field of requiredFields(candidate)) {
    if (!field.value) {
      issues.push(`缺少必填字段「${field.label}」`)
      continue
    }
    if (!field.editedByPm && field.confidence < CONFIDENCE_THRESHOLD) {
      issues.push(`字段「${field.label}」置信度仅 ${Math.round(field.confidence * 100)}%，需要 PM 核对`)
    }
  }

  if (issues.length > 0) return issues
  if (!state.sourceRecords.some((entry) => entry.id === candidate.sourceId)) {
    issues.push('来源证据缺失，无法确认')
  }

  issues.push(...targetIssues(state, candidate))
  return issues
}

/** 确认要落到哪条正式记录上——落不下去就在这里说清楚，不留到点击时才炸。 */
function targetIssues(state: DemoState, candidate: InboxCandidate): string[] {
  if (candidate.kind === 'quote-request') {
    const code = fieldValue(candidate, 'batchCode')
    // 新需求的批次编号本来就还不存在，只校验格式，不查库
    if (code && !parseBatchCode(code).valid) {
      return [`批次编号「${code}」不符合规范 ${BATCH_CODE_RULE}，例如 ${BATCH_CODE_EXAMPLE}`]
    }
    if (code && state.projects.some((project) => project.code === code)) {
      return [`${code} 已经是正式项目了，追加需求请走反馈中心的范围外分流，不要新开首次报价`]
    }
    return []
  }

  if (candidate.kind === 'it-receipt') {
    const projectCode = fieldValue(candidate, 'projectCode')!
    const item = state.closeoutCases.find((entry) => entry.projectCode === projectCode)
    if (!item) return [`${projectCode} 还没有结项案件，IT 回执无处可挂——请先在结项中心开启结项`]
    return gateBlockingIssues(state, item.id, 'it-backup')
  }

  const projectCode = fieldValue(candidate, 'projectCode')!
  const assetId = fieldValue(candidate, 'assetId')!
  const stageCode = fieldValue(candidate, 'stageCode')!
  if (!locateStage(state, projectCode, assetId, stageCode)) {
    return [
      `${projectCode} / ${assetId} / ${stageCode} 在正式数据里不存在——` +
        `如果这是一条还没立项的新需求，应当按「报价需求」导入，而不是挂到既有项目上`,
    ]
  }
  return []
}

export function canConfirm(state: DemoState, candidate: InboxCandidate): boolean {
  return blockingIssues(state, candidate).length === 0
}

/** PM 手工填写的字段就是确定的，不该再显示成 62% 置信度。 */
export function updateCandidateField(
  candidate: InboxCandidate,
  key: string,
  value: string,
): InboxCandidate {
  return {
    ...candidate,
    fields: candidate.fields.map((field) =>
      field.key === key
        ? { ...field, value: value.trim() || undefined, confidence: 1, editedByPm: true }
        : field,
    ),
  }
}

export function fieldValue(candidate: InboxCandidate, key: string): string | undefined {
  return candidate.fields.find((field) => field.key === key)?.value
}

/** 把一次字段修改写回 state。改候选字段不碰正式数据，也不碰来源原文。 */
export function applyFieldEdit(
  state: DemoState,
  candidateId: string,
  key: string,
  value: string,
): DemoState {
  return {
    ...state,
    candidates: state.candidates.map((entry) =>
      entry.id === candidateId ? updateCandidateField(entry, key, value) : entry,
    ),
  }
}

// ---------------------------------------------------------------- 提取

const STAGE_KEYWORDS: Array<[RegExp, StageCode, string]> = [
  [/草图/, '2D_SKETCH', '草图'],
  [/细化\s*50%?|细化/, '2D_DETAIL_50', '细化 50%'],
  [/完成稿/, '2D_FINAL', '完成稿'],
  [/中模/, '3D_MID', '中模'],
  [/高模/, '3D_HIGH', '高模'],
  [/低模/, '3D_LOW', '低模'],
  [/烘焙/, '3D_BAKE', '烘焙'],
  [/贴图/, '3D_TEXTURE', '贴图'],
  [/\bLOD\b/i, '3D_LOD', 'LOD'],
]

const KIND_KEYWORDS: Array<[RegExp, CandidateKind]> = [
  [/剪切备份|已备份|归档回执|IT\s*回执/i, 'it-receipt'],
  [/报价|询价|需求单|新需求/, 'quote-request'],
  [/已完成|请查收|提交给?\s*PM|交付给?\s*PM/, 'stage-done'],
  [/反馈|修改|调整|重做|评审意见/, 'client-feedback'],
]


function excerpt(text: string, needle: string): string | undefined {
  const at = text.indexOf(needle)
  if (at < 0) return undefined
  const from = Math.max(0, at - 18)
  const to = Math.min(text.length, at + needle.length + 18)
  return `${from > 0 ? '…' : ''}${text.slice(from, to).trim()}${to < text.length ? '…' : ''}`
}

/**
 * 从自由文本里提取字段。
 *
 * 这是 Demo 的规则式实现，正式版会换成 LLM 抽取。**接口一样**：
 * 每个字段都带置信度和原文片段，识别不出来就是 `undefined`，不许拿默认值糊弄。
 */
export function extractFields(
  state: DemoState,
  text: string,
  kind: CandidateKind = 'client-feedback',
): CandidateField[] {
  // 报价需求是 BD 刚谈下来的活，**这时项目根本还不存在**，
  // 要求填「关联资产 / 制作阶段」是把后面的事提前问了。它只需要客户和批次编号。
  if (kind === 'quote-request') return quoteRequestFields(state, text)
  return productionFields(state, text)
}

function quoteRequestFields(state: DemoState, text: string): CandidateField[] {
  const batchCode = findBatchCode(text)
  const client = state.projects
    .map((project) => project.client)
    .find((name) => text.includes(name))

  const dueMatch = text.match(/\d{4}-\d{2}-\d{2}/)

  return [
    {
      key: 'clientName',
      label: '客户',
      value: client,
      confidence: client ? 0.95 : 0,
      sourceExcerpt: client ? excerpt(text, client) : undefined,
      required: true,
    },
    {
      key: 'batchCode',
      label: '批次编号',
      value: batchCode,
      // 这里**不查库**：新需求的批次编号本来就还不该存在，只校验格式
      confidence: batchCode ? 0.9 : 0,
      sourceExcerpt: batchCode ? excerpt(text, batchCode) : undefined,
      required: true,
    },
    {
      key: 'dueDate',
      label: '期望交付时间',
      value: dueMatch?.[0],
      confidence: dueMatch ? 0.8 : 0,
      sourceExcerpt: dueMatch ? excerpt(text, dueMatch[0]) : undefined,
      required: false,
    },
  ]
}

function productionFields(state: DemoState, text: string): CandidateField[] {
  // 编号规则与 batchCode.ts 共用一份，两处不能各写各的正则
  const projectCode = findBatchCode(text)
  const knownProject = state.projects.find((project) => project.code === projectCode)

  const assetMatch = text.match(/\b[A-Z]{3,6}-\d{2,3}\b/)
  const assetId = assetMatch?.[0]
  const knownAsset = knownProject?.assets.find((asset) => asset.id === assetId)

  const stageHit = STAGE_KEYWORDS.find(([pattern]) => pattern.test(text))
  const pathMatch = text.match(/\\\\[^\s，。；]+/)

  const fields: CandidateField[] = [
    {
      key: 'projectCode',
      label: '关联项目',
      value: projectCode,
      // 提到的项目号在库里找得到才算高置信；找不到说明可能是笔误或新项目
      confidence: knownProject ? 0.97 : projectCode ? 0.5 : 0,
      sourceExcerpt: projectCode ? excerpt(text, projectCode) : undefined,
      required: true,
    },
    {
      key: 'assetId',
      label: '关联资产',
      value: assetId,
      confidence: knownAsset ? 0.95 : assetId ? 0.5 : 0,
      sourceExcerpt: assetId ? excerpt(text, assetId) : undefined,
      required: true,
    },
    {
      key: 'stageCode',
      label: '制作阶段',
      value: stageHit?.[1],
      confidence: stageHit ? 0.9 : 0,
      sourceExcerpt: stageHit ? excerpt(text, stageHit[2]) : undefined,
      required: true,
    },
    {
      key: 'drivePath',
      label: '盘上路径',
      value: pathMatch?.[0],
      confidence: pathMatch ? 0.88 : 0,
      sourceExcerpt: pathMatch ? excerpt(text, pathMatch[0]) : undefined,
      required: false,
    },
  ]

  return fields
}

export function detectKind(text: string): CandidateKind {
  const hit = KIND_KEYWORDS.find(([pattern]) => pattern.test(text))
  return hit?.[1] ?? 'client-feedback'
}

// ---------------------------------------------------------------- 导入

function nextSequentialId(existing: string[], prefix: string, width: number): string {
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)`)
  const max = existing.reduce((acc, id) => {
    const hit = id.match(pattern)
    return hit ? Math.max(acc, Number(hit[1])) : acc
  }, 0)
  return `${prefix}${String(max + 1).padStart(width, '0')}`
}

function isoDay(at: string): string {
  return at.slice(0, 10)
}

export interface IngestInput {
  text: string
  channel: SourceChannel
  now: string
  actor: string
  from?: string
  subject?: string
  attachments?: string[]
}

export interface IngestResult {
  state: DemoState
  candidate: InboxCandidate
}

/**
 * 零审批导入：粘贴文本、拖截图（OCR 后的文字）、贴路径、手工录入。
 *
 * 这四条路径今天就能用，不依赖企微/飞书自建应用或读全公司邮箱的管理员审批。
 * 官方接口到位后只是多一个 Adapter 调用这里，候选、去重和确认逻辑一行都不用改。
 */
export function ingestText(state: DemoState, input: IngestInput): IngestResult {
  const hash = contentHash(input.text)
  const existing = state.sourceRecords.find((record) => record.contentHash === hash)
  const priorCandidate = existing
    ? state.candidates.find((candidate) => candidate.sourceId === existing.id)
    : undefined

  const sourceId = nextSequentialId(
    state.sourceRecords.map((record) => record.id),
    'SRC-',
    4,
  )
  const source: SourceRecord = {
    id: sourceId,
    channel: input.channel,
    receivedAt: input.now,
    from: input.from,
    subject: input.subject,
    body: input.text,
    attachments: input.attachments ?? [],
    contentHash: hash,
  }

  const candidateId = nextSequentialId(
    state.candidates.map((entry) => entry.id),
    `C-${isoDay(input.now).replace(/-/g, '')}-`,
    3,
  )

  const duplicate = Boolean(priorCandidate)
  // 先判类型再抽字段：报价需求和制作类候选要的字段根本不是一套
  const kind = detectKind(input.text)
  const fields = extractFields(state, input.text, kind)

  const candidate: InboxCandidate = {
    id: candidateId,
    sourceId,
    kind,
    title: input.subject?.trim() || input.text.trim().slice(0, 24) || '未命名候选',
    // 重复的仍然入库——证据不能丢，但不占用待确认队列
    status: duplicate ? 'Duplicate' : 'NeedsReview',
    fields,
    aiSummary: duplicate
      ? `与候选 ${priorCandidate!.id} 内容一致，已自动判为重复。`
      : summarize(input.text, fields),
    aiDraftPlan: duplicate
      ? '不建议重复确认。如果确实是两件事，可手工解除重复标记。'
      : draftPlanFor(kind, fields),
    createdAt: input.now,
    duplicateOfId: duplicate ? priorCandidate!.id : undefined,
  }

  const audit: AuditEvent = {
    id: nextSequentialId(state.auditEvents.map((event) => event.id), 'AE-', 3),
    at: input.now,
    actor: input.actor,
    action: duplicate ? '导入候选并判为重复' : '导入候选',
    targetKind: 'InboxCandidate',
    targetId: candidateId,
    reason: `${channelLabel(input.channel)} · 哈希 ${hash}`,
  }

  return {
    state: {
      ...state,
      sourceRecords: [...state.sourceRecords, source],
      candidates: [...state.candidates, candidate],
      auditEvents: [...state.auditEvents, audit],
    },
    candidate,
  }
}

export function channelLabel(channel: SourceChannel): string {
  switch (channel) {
    case 'paste':
      return '粘贴文本'
    case 'screenshot':
      return '截图 OCR'
    case 'path':
      return '文件路径'
    case 'manual':
      return '手工录入'
    case 'email':
      return '邮件'
    case 'chat-forward':
      return '企微/飞书转发'
  }
}

function summarize(text: string, fields: CandidateField[]): string {
  const project = fields.find((f) => f.key === 'projectCode')?.value
  const asset = fields.find((f) => f.key === 'assetId')?.value
  const stage = fields.find((f) => f.key === 'stageCode')?.value
  const parts = [project, asset, stage ? STAGE_LABEL[stage as StageCode] : undefined].filter(Boolean)
  const head = parts.length > 0 ? `识别到 ${parts.join(' / ')}。` : '未能从原文定位到项目与资产。'
  return `${head}原文摘要：${text.trim().slice(0, 40)}${text.trim().length > 40 ? '…' : ''}`
}

function draftPlanFor(kind: CandidateKind, fields: CandidateField[]): string {
  const missing = fields.filter((f) => f.required && !f.value).map((f) => f.label)
  if (missing.length > 0) return `建议先补全 ${missing.join('、')}，再确认为${KIND_LABEL[kind]}。`
  switch (kind) {
    case 'client-feedback':
      return '建议确认为客户反馈批次，拆成资产级反馈项后进入范围分流；不直接改动后续节点。'
    case 'stage-done':
      return '建议确认为阶段完成，把阶段推进到「已交 PM」并写入实际完成日；是否提交客户由 PM 决定。'
    case 'quote-request':
      return '建议确认为报价需求，交 2D/3D 总监出人天与节点。'
    case 'it-receipt':
      return '建议确认为结项证据，作为 IT 备份完成的正式回执归档。'
  }
}

// ---------------------------------------------------------------- 确认事务

export interface ConfirmOptions {
  actor: string
  now: string
}

export interface ConfirmResult {
  state: DemoState
  recordKind: string
  recordId: string
}

interface StageLocation {
  project: Project
  assetId: string
  stage: StagePlan
}

function locateStage(state: DemoState, projectCode: string, assetId: string, stageCode: string):
  | StageLocation
  | undefined {
  const project = state.projects.find((entry) => entry.code === projectCode)
  if (!project) return undefined
  const asset = project.assets.find((entry) => entry.id === assetId)
  if (!asset) return undefined
  const stage = asset.stages.find((entry) => entry.code === stageCode)
  if (!stage) return undefined
  return { project, assetId, stage }
}

function evidenceFrom(source: SourceRecord): EvidenceRef {
  return {
    id: `EV-${source.id}`,
    kind:
      source.channel === 'screenshot'
        ? 'screenshot'
        : source.channel === 'path'
          ? 'path'
          : source.channel === 'email'
            ? 'email'
            : source.channel === 'chat-forward'
              ? 'chat'
              : 'manual',
    label: channelLabel(source.channel),
    locator: source.subject ?? source.attachments[0] ?? source.body.slice(0, 40),
    receivedAt: source.receivedAt,
    from: source.from,
  }
}

/**
 * 确认候选：一次事务里生成正式记录 + 审计 + 回填候选。
 *
 * 有任何阻断就整体抛出，**调用方拿到的 state 一定是没被动过的那一份**——
 * 这条不能靠调用方自觉，所以所有写入都发生在校验通过之后。
 */
export function confirmCandidate(
  state: DemoState,
  candidateId: string,
  options: ConfirmOptions,
): ConfirmResult {
  const candidate = state.candidates.find((entry) => entry.id === candidateId)
  if (!candidate) throw new CandidateBlocked([`找不到候选 ${candidateId}`])

  const issues = blockingIssues(state, candidate)
  if (issues.length > 0) throw new CandidateBlocked(issues)

  const source = state.sourceRecords.find((entry) => entry.id === candidate.sourceId)!
  const auditId = nextSequentialId(state.auditEvents.map((event) => event.id), 'AE-', 3)

  // 报价需求这时还没有项目可指——定位阶段是后面几类才需要的事
  if (candidate.kind === 'quote-request') {
    return confirmAsQuoteRequest(state, candidate, source, options, auditId)
  }

  const located = locateStage(
    state,
    fieldValue(candidate, 'projectCode')!,
    fieldValue(candidate, 'assetId')!,
    fieldValue(candidate, 'stageCode')!,
  )!

  switch (candidate.kind) {
    case 'client-feedback':
      return confirmAsFeedback(state, candidate, source, located, options, auditId)
    case 'it-receipt':
      return confirmAsItReceipt(state, candidate, source, located, options, auditId)
    default:
      return confirmAsStageDone(state, candidate, source, located, options, auditId)
  }
}

/**
 * 报价需求 → 报价案件。
 *
 * 建出来的案件停在「总监报价中」，**没有任何报价版本**——
 * 确认候选只是承认「这是一条真需求」，人天和金额得总监自己填。
 */
function confirmAsQuoteRequest(
  state: DemoState,
  candidate: InboxCandidate,
  source: SourceRecord,
  options: ConfirmOptions,
  auditId: string,
): ConfirmResult {
  const caseId = nextSequentialId(state.quoteCases.map((entry) => entry.id), 'Q-', 3)

  // 复核人按角色取，不写死某个人。取不到就诚实阻断——
  // 建一个没人复核的案件，等于把「开工前必须复核」这道门悄悄拆了
  const reviewer =
    state.people.find((person) => person.roles.includes('组长')) ??
    state.people.find((person) => person.roles.includes('BD'))
  if (!reviewer) {
    throw new CandidateBlocked(['成员里没有组长或 BD，报价案件没有复核人，无法创建'])
  }

  const batchCode = fieldValue(candidate, 'batchCode')!
  const discipline = parseBatchCode(batchCode).discipline === '2D' ? '2D' : '3D'
  // 总监按 2D / 3D 分工。这里按批次编号里的类型段取，取不到才退回第一位艺术总监
  const director =
    state.people.find((person) => person.roles.includes('艺术总监')) ?? state.people[0]

  const quoteCase: QuoteCase = {
    id: caseId,
    // 从收件箱进来的都是新需求；对既有资产的追加走反馈中心的范围外分流，不走这里
    kind: 'initial',
    // 这时它还只是个**提议的**批次编号，正式项目要等客户确认、发出开工通知才建
    projectCode: batchCode,
    client: fieldValue(candidate, 'clientName')!,
    title: candidate.title,
    // 需求原文即证据，不重新措辞
    requirement: source.body,
    status: 'DirectorQuoting',
    // 资产还没拆，总监报价时才知道有哪些
    affectedAssetIds: [],
    directorName: director?.name ?? '待指派',
    reviewerPersonId: reviewer.id,
    createdAt: options.now,
    dueDate: fieldValue(candidate, 'dueDate'),
    discipline,
    evidence: [evidenceFrom(source)],
  }

  const audit: AuditEvent = {
    id: auditId,
    at: options.now,
    actor: options.actor,
    action: '确认候选并创建报价案件',
    targetKind: 'QuoteCase',
    targetId: caseId,
    reason: `来源 ${candidate.sourceId} · 候选 ${candidate.id}`,
  }

  return {
    state: {
      ...state,
      quoteCases: [...state.quoteCases, quoteCase],
      candidates: markConfirmed(state.candidates, candidate.id, 'QuoteCase', caseId, options),
      auditEvents: [...state.auditEvents, audit],
    },
    recordKind: 'QuoteCase',
    recordId: caseId,
  }
}

/**
 * IT 回执 → 结项的「IT 备份」门禁。
 *
 * 这里**不绕过结项的串行门禁**：证据来自收件箱不代表可以跳步。
 * 前置没走完就照常阻断，理由用结项层给的原话，不另编一套说法。
 */
function confirmAsItReceipt(
  state: DemoState,
  candidate: InboxCandidate,
  source: SourceRecord,
  located: StageLocation,
  options: ConfirmOptions,
  auditId: string,
): ConfirmResult {
  const item = state.closeoutCases.find((entry) => entry.projectCode === located.project.code)
  if (!item) {
    throw new CandidateBlocked([
      `${located.project.code} 还没有结项案件，IT 回执无处可挂——请先在结项中心开启结项`,
    ])
  }

  let next: DemoState
  try {
    next = completeCloseoutGate(state, item.id, 'it-backup', {
      evidence: [evidenceFrom(source)],
      note: `来自候选 ${candidate.id}`,
      actor: options.actor,
      now: options.now,
    })
  } catch (error) {
    // 结项层已经把原因逐条说清了，这里原样透传，不翻译成一句笼统的「无法确认」
    if (error instanceof CloseoutBlocked) throw new CandidateBlocked(error.issues)
    throw error
  }

  const audit: AuditEvent = {
    id: auditId,
    at: options.now,
    actor: options.actor,
    action: '确认候选并登记 IT 备份回执',
    targetKind: 'CloseoutCase',
    targetId: item.id,
    reason: `来源 ${candidate.sourceId} · 候选 ${candidate.id}`,
  }

  return {
    state: {
      ...next,
      candidates: markConfirmed(next.candidates, candidate.id, 'CloseoutCase', item.id, options),
      auditEvents: [...next.auditEvents, audit],
    },
    recordKind: 'CloseoutCase',
    recordId: item.id,
  }
}

function confirmAsFeedback(
  state: DemoState,
  candidate: InboxCandidate,
  source: SourceRecord,
  located: StageLocation,
  options: ConfirmOptions,
  auditId: string,
): ConfirmResult {
  const batchId = nextSequentialId(state.feedbackBatches.map((batch) => batch.id), 'F-', 3)

  const item: FeedbackItem = {
    id: `${batchId}/ITEM-01`,
    batchId,
    assetId: located.assetId,
    stageId: located.stage.id,
    title: candidate.title,
    originalText: source.body,
    // 确认候选 ≠ 判定范围内外。分流是反馈中心里 PM 的下一个动作。
    scope: 'unclassified',
    status: 'NeedsClassification',
    ownerName: located.stage.ownerName,
    estimatedReworkDays: 1,
  }

  const batch: FeedbackBatch = {
    id: batchId,
    projectCode: located.project.code,
    client: located.project.client,
    receivedAt: source.receivedAt,
    feedbackDrivePath:
      fieldValue(candidate, 'drivePath') ??
      `\\\\NAS-ART\\Feedback\\${located.project.code}\\${batchId}`,
    summary: candidate.aiSummary,
    evidence: [evidenceFrom(source)],
    items: [item],
    clientWaitWorkdays: 0,
  }

  const audit: AuditEvent = {
    id: auditId,
    at: options.now,
    actor: options.actor,
    action: '确认候选并创建反馈批次',
    targetKind: 'FeedbackBatch',
    targetId: batchId,
    reason: `来源 ${candidate.sourceId} · 候选 ${candidate.id}`,
  }

  return {
    state: {
      ...state,
      feedbackBatches: [...state.feedbackBatches, batch],
      candidates: markConfirmed(state.candidates, candidate.id, 'FeedbackBatch', batchId, options),
      auditEvents: [...state.auditEvents, audit],
    },
    recordKind: 'FeedbackBatch',
    recordId: batchId,
  }
}

function confirmAsStageDone(
  state: DemoState,
  candidate: InboxCandidate,
  source: SourceRecord,
  located: StageLocation,
  options: ConfirmOptions,
  auditId: string,
): ConfirmResult {
  const finishedOn = fieldValue(candidate, 'completedAt') ?? isoDay(source.receivedAt)

  const projects = state.projects.map((project) =>
    project.code !== located.project.code
      ? project
      : {
          ...project,
          assets: project.assets.map((asset) =>
            asset.id !== located.assetId
              ? asset
              : {
                  ...asset,
                  stages: asset.stages.map((stage) =>
                    stage.id !== located.stage.id
                      ? stage
                      : {
                          ...stage,
                          // 「已交 PM」不等于「已提交客户」，更不等于「客户确认」。
                          // 这三件事在这里必须保持分开——合并过一次就再也拆不回来。
                          status: 'HandedToPm' as const,
                          actualStart: stage.actualStart ?? stage.currentStart,
                          actualFinish: finishedOn,
                        },
                  ),
                },
          ),
        },
  )

  const audit: AuditEvent = {
    id: auditId,
    at: options.now,
    actor: options.actor,
    action: '确认候选并推进阶段到已交 PM',
    targetKind: 'StagePlan',
    targetId: located.stage.id,
    before: located.stage.status,
    after: 'HandedToPm',
    reason: `来源 ${candidate.sourceId} · 候选 ${candidate.id}`,
  }

  return {
    state: {
      ...state,
      projects,
      candidates: markConfirmed(
        state.candidates,
        candidate.id,
        'StagePlan',
        located.stage.id,
        options,
      ),
      auditEvents: [...state.auditEvents, audit],
    },
    recordKind: 'StagePlan',
    recordId: located.stage.id,
  }
}

function markConfirmed(
  candidates: InboxCandidate[],
  candidateId: string,
  recordKind: string,
  recordId: string,
  options: ConfirmOptions,
): InboxCandidate[] {
  return candidates.map((entry) =>
    entry.id !== candidateId
      ? entry
      : {
          ...entry,
          status: 'Confirmed' as const,
          confirmedRecordKind: recordKind,
          confirmedRecordId: recordId,
          confirmedAt: options.now,
          confirmedBy: options.actor,
        },
  )
}

// ---------------------------------------------------------------- 忽略与重复

export interface IgnoreOptions extends ConfirmOptions {
  reason: string
}

export function ignoreCandidate(
  state: DemoState,
  candidateId: string,
  options: IgnoreOptions,
): { state: DemoState } {
  return {
    state: applyCandidateStatus(state, candidateId, options, {
      status: 'Ignored',
      action: '忽略候选',
      patch: { ignoredReason: options.reason },
      reason: options.reason,
    }),
  }
}

export interface DuplicateOptions extends ConfirmOptions {
  duplicateOfId: string
}

export function markDuplicate(
  state: DemoState,
  candidateId: string,
  options: DuplicateOptions,
): { state: DemoState } {
  return {
    state: applyCandidateStatus(state, candidateId, options, {
      status: 'Duplicate',
      action: '标记候选为重复',
      patch: { duplicateOfId: options.duplicateOfId },
      reason: `重复于 ${options.duplicateOfId}`,
    }),
  }
}

/** 恢复到待确认。判错了要能退回来——不可逆的分类比没有分类更糟。 */
export function restoreCandidate(
  state: DemoState,
  candidateId: string,
  options: ConfirmOptions,
): { state: DemoState } {
  return {
    state: applyCandidateStatus(state, candidateId, options, {
      status: 'NeedsReview',
      action: '退回待确认',
      patch: { ignoredReason: undefined, duplicateOfId: undefined },
      reason: '人工退回',
    }),
  }
}

function applyCandidateStatus(
  state: DemoState,
  candidateId: string,
  options: ConfirmOptions,
  change: {
    status: InboxCandidate['status']
    action: string
    patch: Partial<InboxCandidate>
    reason: string
  },
): DemoState {
  const candidate = state.candidates.find((entry) => entry.id === candidateId)
  if (!candidate) throw new CandidateBlocked([`找不到候选 ${candidateId}`])
  if (candidate.status === 'Confirmed') {
    // 已经生成正式记录了，退回候选不会把记录收回去——那要走各自模块的撤销
    throw new CandidateBlocked(['该候选已确认并生成正式记录，请到对应模块撤销'])
  }

  const audit: AuditEvent = {
    id: nextSequentialId(state.auditEvents.map((event) => event.id), 'AE-', 3),
    at: options.now,
    actor: options.actor,
    action: change.action,
    targetKind: 'InboxCandidate',
    targetId: candidateId,
    before: candidate.status,
    after: change.status,
    reason: change.reason,
  }

  return {
    ...state,
    candidates: state.candidates.map((entry) =>
      entry.id !== candidateId ? entry : { ...entry, ...change.patch, status: change.status },
    ),
    auditEvents: [...state.auditEvents, audit],
  }
}

// ---------------------------------------------------------------- 投影

export interface InboxMetrics {
  needsReview: number
  readyToConfirm: number
  incomplete: number
  confirmedToday: number
}

export function inboxMetrics(state: DemoState, today: string): InboxMetrics {
  const open = state.candidates.filter((entry) => entry.status === 'NeedsReview' || entry.status === 'New')
  return {
    needsReview: open.length,
    readyToConfirm: open.filter((entry) => canConfirm(state, entry)).length,
    incomplete: open.filter((entry) => !canConfirm(state, entry)).length,
    confirmedToday: state.candidates.filter(
      (entry) => entry.status === 'Confirmed' && entry.confirmedAt?.startsWith(today),
    ).length,
  }
}

export const CANDIDATE_KIND_LABEL = KIND_LABEL
