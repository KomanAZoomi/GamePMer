import type {
  AuditEvent,
  DemoState,
  Drive,
  FileIndexEntry,
  FileNameParse,
  StageCode,
  StagePlan,
} from './model'

/**
 * 文件与归档。
 *
 * 这一层只做**索引**：记录盘上有哪个文件、属于哪个资产的哪个阶段。
 * 它不复制、不移动、不删除、不改名任何真实文件——剪切备份由 IT 用自己的权限执行。
 *
 * 一条压倒性的规则：**命名不规范时保留原文件名，进待关联队列**。
 * 丢证据比在列表里留一条难看的记录严重得多。
 */

export const NAMING_RULE = '资产名_阶段名_YYYYMMDD_rNN'

export class FileLinkBlocked extends Error {
  constructor(readonly issues: string[]) {
    super(`文件关联被阻断：${issues.join('；')}`)
    this.name = 'FileLinkBlocked'
  }
}

// ---------------------------------------------------------------- 解析

/** 阶段名写法有多种，都要认；顺序重要——「细化50」要先于「细化」匹配。 */
const STAGE_ALIASES: Array<[RegExp, StageCode]> = [
  [/^草图$/, '2D_SKETCH'],
  [/^细化\s*50%?$/, '2D_DETAIL_50'],
  [/^完成稿$/, '2D_FINAL'],
  [/^中模$/, '3D_MID'],
  [/^高模$/, '3D_HIGH'],
  [/^低模$/, '3D_LOW'],
  [/^烘焙$/, '3D_BAKE'],
  [/^贴图$/, '3D_TEXTURE'],
  [/^LOD$/i, '3D_LOD'],
]

const ASSET_PATTERN = /^[A-Z]{3,6}-[0-9A-Z]{2,3}$/

function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

function parseDate(segment: string): string | undefined {
  if (!/^\d{8}$/.test(segment)) return undefined
  const year = Number(segment.slice(0, 4))
  const month = Number(segment.slice(4, 6))
  const day = Number(segment.slice(6, 8))
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return undefined
  return `${segment.slice(0, 4)}-${segment.slice(4, 6)}-${segment.slice(6, 8)}`
}

/**
 * 按 `资产名_阶段名_YYYYMMDD_rNN` 解析。
 *
 * 前三段齐了就算识别成功，版本缺失只压低置信度并说明原因。
 * **一段都对不上时四个字段全是 undefined**——不猜、不填默认值。
 */
export function parseFileName(fileName: string): FileNameParse {
  const segments = stripExtension(fileName).split('_')

  const assetId = segments[0] && ASSET_PATTERN.test(segments[0]) ? segments[0] : undefined
  const stageCode = segments[1]
    ? STAGE_ALIASES.find(([pattern]) => pattern.test(segments[1]))?.[1]
    : undefined
  const fileDate = segments[2] ? parseDate(segments[2]) : undefined
  const revision = segments[3] && /^r\d{2}$/i.test(segments[3]) ? segments[3].toLowerCase() : undefined

  if (!assetId || !stageCode || !fileDate) {
    const missing = [
      !assetId && '资产名',
      !stageCode && '阶段名',
      !fileDate && '日期',
    ].filter(Boolean)
    return {
      confidence: 0,
      problem: `不符合命名规范 ${NAMING_RULE}：无法识别${missing.join('、')}。原文件名已保留，请手工关联。`,
    }
  }

  if (!revision) {
    return {
      assetId,
      stageCode,
      fileDate,
      confidence: 0.78,
      problem: '缺版本号，按 r01 待确认。',
    }
  }

  return { assetId, stageCode, fileDate, revision, confidence: 0.98 }
}

export interface StageHint {
  stageId: string
  projectCode: string
  confidence: number
  rationale: string
}

function findStage(state: DemoState, assetId: string, stageCode: StageCode) {
  for (const project of state.projects) {
    const asset = project.assets.find((entry) => entry.id === assetId)
    const stage = asset?.stages.find((entry) => entry.code === stageCode)
    if (asset && stage) return { project, asset, stage }
  }
  return undefined
}

/**
 * 关联建议。
 *
 * 解析出的资产与阶段必须在正式数据里找得到才给建议——
 * 一个库里不存在的资产名，猜出来也没有用，只会误导。
 */
export function suggestStage(state: DemoState, parse: FileNameParse): StageHint | undefined {
  if (!parse.assetId || !parse.stageCode) return undefined
  const found = findStage(state, parse.assetId, parse.stageCode)
  if (!found) return undefined

  return {
    stageId: found.stage.id,
    projectCode: found.project.code,
    confidence: parse.confidence,
    rationale: `文件名解析出 ${parse.assetId} / ${found.stage.name}，与 ${found.project.code} 的正式排期匹配。`,
  }
}

// ---------------------------------------------------------------- 查询

export function entryOf(state: DemoState, entryId: string): FileIndexEntry | undefined {
  return state.fileIndex.find((entry) => entry.id === entryId)
}

export function driveOf(state: DemoState, driveId: string): Drive | undefined {
  return state.drives.find((drive) => drive.id === driveId)
}

export interface DriveRow {
  drive: Drive
  total: number
  /** 需要 PM 动手的：待确认 + 无法解析 */
  pending: number
  ignored: number
}

export function driveSummary(state: DemoState): DriveRow[] {
  return state.drives.map((drive) => {
    const entries = state.fileIndex.filter((entry) => entry.driveId === drive.id)
    return {
      drive,
      total: entries.length,
      pending: entries.filter(
        (entry) => entry.status === 'needs-review' || entry.status === 'unresolved',
      ).length,
      ignored: entries.filter((entry) => entry.status === 'ignored').length,
    }
  })
}

export interface IndexMetrics {
  total: number
  linked: number
  /** 解析出来了但置信度不足，PM 确认一下即可 */
  needsReview: number
  /** 完全解析不出，必须手工关联——两者要采取的动作不同，不能合并成一个数字 */
  unresolved: number
  ignored: number
}

export function indexMetrics(state: DemoState): IndexMetrics {
  const entries = state.fileIndex
  return {
    total: entries.length,
    linked: entries.filter((entry) => entry.status === 'auto' || entry.status === 'linked').length,
    needsReview: entries.filter((entry) => entry.status === 'needs-review').length,
    unresolved: entries.filter((entry) => entry.status === 'unresolved').length,
    ignored: entries.filter((entry) => entry.status === 'ignored').length,
  }
}

/** 阶段 id → 可读描述，用于关联下拉与已关联展示。 */
export function stageLabel(state: DemoState, stageId: string): string {
  for (const project of state.projects) {
    for (const asset of project.assets) {
      const stage = asset.stages.find((entry) => entry.id === stageId)
      if (stage) return `${project.code} / ${asset.id} / ${stage.name}`
    }
  }
  return stageId
}

export function allStages(state: DemoState): Array<{ stage: StagePlan; label: string }> {
  return state.projects.flatMap((project) =>
    project.assets.flatMap((asset) =>
      asset.stages.map((stage) => ({
        stage,
        label: `${project.code} / ${asset.id} / ${stage.name}`,
      })),
    ),
  )
}

// ---------------------------------------------------------------- 用例

function nextId(existing: string[], prefix: string, width: number): string {
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)`)
  const max = existing.reduce((acc, id) => {
    const hit = id.match(pattern)
    return hit ? Math.max(acc, Number(hit[1])) : acc
  }, 0)
  return `${prefix}${String(max + 1).padStart(width, '0')}`
}

export interface LinkInput {
  actor: string
  now: string
}

function withAudit(
  state: DemoState,
  entryId: string,
  patch: Partial<FileIndexEntry>,
  audit: Omit<AuditEvent, 'id'>,
): DemoState {
  return {
    ...state,
    fileIndex: state.fileIndex.map((entry) =>
      entry.id === entryId ? { ...entry, ...patch } : entry,
    ),
    auditEvents: [
      ...state.auditEvents,
      { id: nextId(state.auditEvents.map((event) => event.id), 'AE-', 3), ...audit },
    ],
  }
}

/**
 * 手工关联。
 *
 * 只写索引里的 `linkedStageId`——**`fileName` 从头到尾没被碰过**。
 * PM 关联的是「这个盘上的文件对应哪个阶段」，不是「把文件改成规范名字」。
 */
export function linkFile(
  state: DemoState,
  entryId: string,
  stageId: string,
  input: LinkInput,
): DemoState {
  const entry = entryOf(state, entryId)
  if (!entry) throw new FileLinkBlocked([`找不到索引条目 ${entryId}`])
  if (entry.status === 'ignored') {
    throw new FileLinkBlocked(['该文件已被忽略，请先退回待关联再做关联'])
  }

  const exists = state.projects
    .flatMap((project) => project.assets)
    .flatMap((asset) => asset.stages)
    .some((stage) => stage.id === stageId)
  if (!exists) throw new FileLinkBlocked([`阶段 ${stageId} 在正式排期里不存在`])

  return withAudit(
    state,
    entryId,
    { status: 'linked', linkedStageId: stageId, linkedBy: input.actor, linkedAt: input.now },
    {
      at: input.now,
      actor: input.actor,
      action: '手工关联文件到阶段',
      targetKind: 'FileIndexEntry',
      targetId: entryId,
      before: entry.linkedStageId ?? entry.status,
      after: stageId,
      reason: entry.fileName,
    },
  )
}

/** 忽略不是删除：条目和原文件名都留着，只是不再占用待关联队列。 */
export function ignoreFile(
  state: DemoState,
  entryId: string,
  reason: string,
  input: LinkInput,
): DemoState {
  const entry = entryOf(state, entryId)
  if (!entry) throw new FileLinkBlocked([`找不到索引条目 ${entryId}`])

  return withAudit(
    state,
    entryId,
    { status: 'ignored', ignoredReason: reason, linkedStageId: undefined },
    {
      at: input.now,
      actor: input.actor,
      action: '标记文件为与正式流程无关',
      targetKind: 'FileIndexEntry',
      targetId: entryId,
      before: entry.status,
      after: 'ignored',
      reason,
    },
  )
}

/** 退回待关联。判错了要能改回来。 */
export function restoreFile(state: DemoState, entryId: string, input: LinkInput): DemoState {
  const entry = entryOf(state, entryId)
  if (!entry) throw new FileLinkBlocked([`找不到索引条目 ${entryId}`])

  // 退回到解析结果决定的状态：解析得出就是待确认，解析不出就是待关联
  const status = entry.parse.assetId && entry.parse.stageCode ? 'needs-review' : 'unresolved'

  return withAudit(
    state,
    entryId,
    { status, ignoredReason: undefined, linkedStageId: undefined, linkedBy: undefined, linkedAt: undefined },
    {
      at: input.now,
      actor: input.actor,
      action: '退回文件到待关联',
      targetKind: 'FileIndexEntry',
      targetId: entryId,
      before: entry.status,
      after: status,
      reason: entry.fileName,
    },
  )
}

// ---------------------------------------------------------------- 标签

export const FILE_STATUS_LABEL: Record<FileIndexEntry['status'], string> = {
  auto: '已自动关联',
  'needs-review': '待确认',
  unresolved: '待 PM 关联',
  linked: '已手工关联',
  ignored: '已忽略',
}

export const DRIVE_KIND_LABEL: Record<Drive['kind'], string> = {
  production: '制作盘',
  delivery: '提交盘',
  feedback: '反馈盘',
  final: '最终包',
  archive: '归档盘（IT 管辖）',
}
