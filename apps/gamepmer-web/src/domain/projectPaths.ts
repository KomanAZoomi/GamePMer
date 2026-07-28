import { parseBatchCode } from './batchCode'
import type { AuditEvent, DemoState, PathKind, ProjectPathEntry } from './model'

/**
 * 项目路径登记簿。
 *
 * 只做三件事：**登记、保存、跳转**。
 *
 * 路径挂在项目（批次）上，不挂到阶段——一个批次几十个资产，逐资产登记只会让表没法看。
 * 实际用法本来就是「这个批次的反馈都在这个总盘里」，批次内部按日期分子目录是制作侧自己的事。
 *
 * 工作台**不复制、不移动、不删除、不改名**任何真实文件。这里存的是一串字符串。
 */

export class PathBlocked extends Error {
  constructor(readonly issues: string[]) {
    super(`路径登记被阻断：${issues.join('；')}`)
    this.name = 'PathBlocked'
  }
}

export const PATH_KIND_LABEL: Record<PathKind, string> = {
  feedback: '反馈盘',
  production: '制作盘',
  delivery: '提交盘',
  final: '最终包',
  archive: '归档盘（IT 管辖）',
  reference: '参考资料',
}

/** 登记表默认列出这几种，缺哪种一眼可见。 */
export const PATH_KIND_ORDER: PathKind[] = [
  'feedback',
  'production',
  'delivery',
  'final',
  'archive',
  'reference',
]

/** 归档盘由 IT 建、IT 管；工作台只记它长什么样。 */
export const IT_OWNED_KINDS: PathKind[] = ['archive']

// ---------------------------------------------------------------- 查询

export function pathsOf(state: DemoState, projectCode: string): ProjectPathEntry[] {
  const registered = state.projectPaths.filter((entry) => entry.projectCode === projectCode)
  return PATH_KIND_ORDER.map((kind) => registered.find((entry) => entry.kind === kind)).filter(
    (entry): entry is ProjectPathEntry => Boolean(entry),
  )
}

export function pathOf(
  state: DemoState,
  projectCode: string,
  kind: PathKind,
): ProjectPathEntry | undefined {
  return state.projectPaths.find(
    (entry) => entry.projectCode === projectCode && entry.kind === kind,
  )
}

/** 还没登记的盘位。界面按这个提示 PM 补齐，而不是让他自己数。 */
export function missingKinds(state: DemoState, projectCode: string): PathKind[] {
  return PATH_KIND_ORDER.filter((kind) => !pathOf(state, projectCode, kind))
}

export interface PathsSummary {
  projectCode: string
  registered: number
  total: number
}

export function pathsSummary(state: DemoState, projectCode: string): PathsSummary {
  return {
    projectCode,
    registered: pathsOf(state, projectCode).length,
    total: PATH_KIND_ORDER.length,
  }
}

/**
 * 按约定生成建议路径。
 *
 * 只是**建议**，填进输入框等 PM 改——公司盘的根路径以后可能变，
 * 也可能某个批次就是放在别处，所以永远不自动保存。
 */
export function suggestPath(projectCode: string, kind: PathKind, root = '\\\\NAS-ART'): string {
  const folder: Record<PathKind, string> = {
    feedback: 'Feedback',
    production: 'Production',
    delivery: 'Delivery',
    final: 'Final',
    archive: 'Archive',
    reference: 'Reference',
  }
  if (kind === 'archive') return `\\\\ARCHIVE\\2026\\${projectCode}`
  return `${root}\\${folder[kind]}\\${projectCode}`
}

// ---------------------------------------------------------------- 校验

/**
 * 路径校验。
 *
 * 只挡明显填错的：空、不是 UNC 或盘符开头、含非法字符。
 * **不校验路径是否真实存在**——工作台没有也不该有访问公司盘的权限。
 */
export function pathIssues(path: string): string[] {
  const value = path.trim()
  const issues: string[] = []

  if (!value) {
    issues.push('路径不能为空')
    return issues
  }
  const unc = value.startsWith('\\\\')
  const drive = /^[A-Za-z]:\\/.test(value)
  if (!unc && !drive) {
    issues.push('要填完整路径，UNC（\\\\服务器\\共享）或盘符（D:\\）开头')
  }
  if (/[<>"|?*]/.test(value)) {
    issues.push('路径里有 Windows 不允许的字符：< > " | ? *')
  }
  return issues
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

export interface SavePathInput {
  projectCode: string
  kind: PathKind
  path: string
  label?: string
  note?: string
  actor: string
  now: string
}

/**
 * 登记或更新一条路径。
 *
 * 同一个项目同一种盘位只有一条——再保存就是覆盖，并在审计里留下旧值。
 */
export function savePath(state: DemoState, input: SavePathInput): DemoState {
  const issues = pathIssues(input.path)
  if (issues.length > 0) throw new PathBlocked(issues)

  const project = state.projects.find((entry) => entry.code === input.projectCode)
  const known = project !== undefined
  if (!known && !parseBatchCode(input.projectCode).valid) {
    throw new PathBlocked([`${input.projectCode} 既不是在管项目，也不符合批次编号规范`])
  }

  const existing = pathOf(state, input.projectCode, input.kind)
  const value = input.path.trim()
  const entry: ProjectPathEntry = {
    id: existing?.id ?? nextId(state.projectPaths.map((row) => row.id), 'PP-', 4),
    projectCode: input.projectCode,
    kind: input.kind,
    label: input.label?.trim() || existing?.label || PATH_KIND_LABEL[input.kind],
    path: value,
    note: input.note?.trim() || undefined,
    updatedAt: input.now,
    updatedBy: input.actor,
  }

  const audit: AuditEvent = {
    id: nextId(state.auditEvents.map((event) => event.id), 'AE-', 3),
    at: input.now,
    actor: input.actor,
    action: existing ? '更新项目路径登记' : '登记项目路径',
    targetKind: 'ProjectPath',
    targetId: `${input.projectCode}/${input.kind}`,
    before: existing?.path,
    after: value,
    reason: input.note,
  }

  return {
    ...state,
    projectPaths: existing
      ? state.projectPaths.map((row) => (row.id === existing.id ? entry : row))
      : [...state.projectPaths, entry],
    auditEvents: [...state.auditEvents, audit],
  }
}

/** 删除一条登记。删的是索引，不是盘上的东西——这一点在界面上要写清楚。 */
export function removePath(
  state: DemoState,
  entryId: string,
  input: { actor: string; now: string },
): DemoState {
  const entry = state.projectPaths.find((row) => row.id === entryId)
  if (!entry) throw new PathBlocked([`找不到路径登记 ${entryId}`])

  const audit: AuditEvent = {
    id: nextId(state.auditEvents.map((event) => event.id), 'AE-', 3),
    at: input.now,
    actor: input.actor,
    action: '删除项目路径登记',
    targetKind: 'ProjectPath',
    targetId: `${entry.projectCode}/${entry.kind}`,
    before: entry.path,
    reason: '只删索引，盘上的文件不受影响',
  }

  return {
    ...state,
    projectPaths: state.projectPaths.filter((row) => row.id !== entryId),
    auditEvents: [...state.auditEvents, audit],
  }
}
