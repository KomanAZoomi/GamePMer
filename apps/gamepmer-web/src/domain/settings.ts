import type { AuditEvent, DemoState, PersonRole } from './model'

/**
 * 设置中心。
 *
 * LLM 部分参照 cc-switch：**预设 + 切换**，地址和模型预填，用户只填 API Key。
 *
 * 三条不可让步的安全约束，写在类型和用例里而不只是文案里：
 * 1. **Key 只提交到内网服务端密钥库。** 前端只保留后 4 位用于识别——
 *    所以 `LlmProvider` 上根本没有存完整 Key 的字段，想存也存不进去。
 * 2. **所有调用经内网服务端网关**，浏览器不直连任何外部域名。
 * 3. **每次调用写审计**（谁、用途、模型、token、费用），结果一律标「建议 · 未执行」。
 */

export class SettingsBlocked extends Error {
  constructor(readonly issues: string[]) {
    super(`设置未保存：${issues.join('；')}`)
    this.name = 'SettingsBlocked'
  }
}

// ---------------------------------------------------------------- 连接器

export type ConnectorId = 'paste' | 'screenshot' | 'path' | 'manual' | 'email' | 'wecom' | 'feishu'

/** 接不接得上不取决于我们写不写代码，取决于企业管理员批不批。 */
export type ConnectorApproval = 'none' | 'self' | 'admin'

export interface ConnectorStatus {
  id: ConnectorId
  label: string
  approval: ConnectorApproval
  connected: boolean
  /** 为什么是这个状态，如实写给用户看 */
  reason: string
  /** 拿不到官方接口时的替代路径 */
  fallback?: string
}

export const CONNECTORS: ConnectorStatus[] = [
  {
    id: 'paste',
    label: '粘贴文本',
    approval: 'none',
    connected: true,
    reason: '零审批。把邮件正文或聊天记录整段贴进候选收件箱。',
  },
  {
    id: 'screenshot',
    label: '截图文字',
    approval: 'none',
    connected: true,
    reason: '零审批。截图 OCR 后的文字贴进来，原图作为附件留底。',
  },
  {
    id: 'path',
    label: '文件路径',
    approval: 'none',
    connected: true,
    reason: '零审批。贴一条网络盘路径，按命名规范解析。',
  },
  {
    id: 'manual',
    label: '手工录入',
    approval: 'none',
    connected: true,
    reason: '零审批。什么都没有时自己写一条。',
  },
  {
    id: 'email',
    label: '公司邮箱',
    approval: 'self',
    connected: false,
    reason:
      '读本人邮箱属委托授权，通常你自己点一次同意即可；读全公司邮箱需管理员同意，且很难通过。',
    fallback: '转发到共享邮箱（只需 IT 建一个信箱）或直接粘贴邮件正文',
  },
  {
    id: 'wecom',
    label: '企业微信',
    approval: 'admin',
    connected: false,
    reason:
      '自建应用必须由企业管理员在管理后台创建并授权，个人账号无法自助申请。机器人 webhook 只能发、不能读。',
    fallback: '转发给机器人后粘贴，或拖入聊天截图',
  },
  {
    id: 'feishu',
    label: '飞书',
    approval: 'admin',
    connected: false,
    reason:
      '同企业微信：自建应用必须由企业管理员创建授权。会话归档类权限还要额外合规审批，落地周期不可控。',
    fallback: '转发给机器人后粘贴文本或贴文件路径',
  },
]

export const APPROVAL_LABEL: Record<ConnectorApproval, string> = {
  none: '零审批',
  self: '本人可授权',
  admin: '需企业管理员',
}

// ---------------------------------------------------------------- LLM 供应商

export type LlmPurpose =
  | 'field-extract'
  | 'path-parse'
  | 'feedback-triage'
  | 'draft-mail'
  | 'insight'

export const LLM_PURPOSE_LABEL: Record<LlmPurpose, string> = {
  'field-extract': '邮件字段提取',
  'path-parse': '路径与编号解析',
  'feedback-triage': '反馈范围内外分流建议',
  'draft-mail': '通知与邮件起草',
  insight: '分析洞察',
}

export const LLM_PURPOSE_TRIGGER: Record<LlmPurpose, string> = {
  'field-extract': '粘贴 / 转发 / 截图导入时',
  'path-parse': '登记路径或扫描命中不规范命名时',
  'feedback-triage': '反馈批次拆项后',
  'draft-mail': 'PM 点「生成草稿」时',
  insight: '每日 08:00 定时 + 手动刷新',
}

export interface LlmModel {
  id: string
  label: string
  /** 每百万 token 的输入 / 输出价格，单位美元；未定价的供应商为 undefined */
  inputPrice?: number
  outputPrice?: number
  tier: 'fast' | 'balanced' | 'strong'
}

/**
 * 供应商预设。
 *
 * **注意这个类型上没有 `apiKey` 字段。** Key 提交后由内网服务端密钥库保管，
 * 前端只拿得到后 4 位——不是「我们记得不要存」，是结构上就存不进来。
 */
export interface LlmProvider {
  id: string
  label: string
  note: string
  baseUrl: string
  models: LlmModel[]
  /** Key 的后 4 位，仅用于识别；未配置时为 undefined */
  keyTail?: string
  /** 内网自托管不需要 Key */
  keyless?: boolean
  status: 'active' | 'configured' | 'unconfigured' | 'undeployed'
}

export const LLM_PROVIDERS: LlmProvider[] = [
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    note: 'Messages API · 官方 SDK',
    baseUrl: 'https://api.anthropic.com/v1',
    keyTail: '4f2a',
    status: 'active',
    models: [
      { id: 'claude-opus-5', label: 'Claude Opus 5', inputPrice: 5, outputPrice: 25, tier: 'strong' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', inputPrice: 3, outputPrice: 15, tier: 'balanced' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', inputPrice: 1, outputPrice: 5, tier: 'fast' },
    ],
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI 兼容网关',
    note: '可指向任意兼容 /chat/completions 的服务',
    baseUrl: '（由管理员填写）',
    status: 'unconfigured',
    models: [],
  },
  {
    id: 'dashscope',
    label: '阿里云百炼',
    note: '国内可直连 · 待公司确认采购',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    status: 'unconfigured',
    models: [],
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    note: '国内可直连 · 待公司确认采购',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    status: 'unconfigured',
    models: [],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    note: '国内可直连 · 待公司确认采购',
    baseUrl: 'https://api.deepseek.com/v1',
    status: 'unconfigured',
    models: [],
  },
  {
    id: 'self-hosted',
    label: '内网自托管',
    note: 'vLLM / Ollama · 数据完全不出内网',
    baseUrl: 'http://llm.intra.company.local:8000/v1',
    keyless: true,
    status: 'undeployed',
    models: [],
  },
]

export interface PurposeBinding {
  purpose: LlmPurpose
  providerId: string
  modelId: string
  enabled: boolean
}

/**
 * 用途 → 模型的默认分配。
 *
 * 三类任务难度差一个数量级：提取和解析用最便宜的档，分流和起草用中档。
 * 一个模型跑到底不是更简单，是更贵。
 */
export const DEFAULT_BINDINGS: PurposeBinding[] = [
  { purpose: 'field-extract', providerId: 'anthropic', modelId: 'claude-haiku-4-5', enabled: true },
  { purpose: 'path-parse', providerId: 'anthropic', modelId: 'claude-haiku-4-5', enabled: true },
  { purpose: 'feedback-triage', providerId: 'anthropic', modelId: 'claude-sonnet-5', enabled: true },
  { purpose: 'draft-mail', providerId: 'anthropic', modelId: 'claude-sonnet-5', enabled: true },
  { purpose: 'insight', providerId: 'anthropic', modelId: 'claude-sonnet-5', enabled: false },
]

// ---------------------------------------------------------------- 脱敏

export interface RedactionRule {
  id: string
  label: string
  enabled: boolean
  /** 关掉会有什么后果，说清楚再让人关 */
  risk: string
}

export const DEFAULT_REDACTIONS: RedactionRule[] = [
  {
    id: 'client-name',
    label: '移除客户公司全称，替换为批次编号',
    enabled: true,
    risk: '关掉后客户名会随请求发给外部供应商',
  },
  { id: 'contact', label: '移除邮箱地址与电话', enabled: true, risk: '关掉后联系方式会外发' },
  { id: 'amount', label: '不发送报价金额', enabled: true, risk: '关掉后报价金额会外发' },
  {
    id: 'path',
    label: '不发送文件路径',
    enabled: false,
    risk: '路径含内网服务器名；开启后候选收件箱的路径识别会失效',
  },
]

// ---------------------------------------------------------------- 校验

/**
 * Key 校验。
 *
 * 只看格式，**不做联通性测试**——Demo 环境没有也不该有真实凭证。
 */
export function keyIssues(key: string): string[] {
  const value = key.trim()
  const issues: string[] = []
  if (!value) issues.push('API Key 不能为空')
  else if (value.length < 20) issues.push('Key 太短，请确认复制完整')
  else if (/\s/.test(value)) issues.push('Key 中间不应有空格，请检查是否复制到了换行')
  return issues
}

export function keyTailOf(key: string): string {
  return key.trim().slice(-4)
}

export interface SaveKeyInput {
  providerId: string
  key: string
  actor: string
  now: string
}

/**
 * 保存 API Key。
 *
 * **只把后 4 位写进 state。** 完整 Key 在正式版会提交给内网服务端密钥库；
 * 这里连一个能装它的字段都没有，所以既不会落 localStorage，也不会进导出文件。
 * 审计里同样只记后 4 位。
 */
export function saveApiKey(state: DemoState, input: SaveKeyInput): DemoState {
  const issues = keyIssues(input.key)
  if (issues.length > 0) throw new SettingsBlocked(issues)

  const provider = LLM_PROVIDERS.find((entry) => entry.id === input.providerId)
  if (!provider) throw new SettingsBlocked([`找不到供应商预设 ${input.providerId}`])

  const audit: AuditEvent = {
    id: `AE-key-${input.providerId}-${input.now}`,
    at: input.now,
    actor: input.actor,
    action: '更新 LLM 供应商 API Key',
    targetKind: 'LlmProvider',
    targetId: input.providerId,
    // 审计里也只留后 4 位
    after: `••••${keyTailOf(input.key)}`,
    reason: '完整 Key 提交至内网服务端密钥库，前端不留存',
  }

  return { ...state, auditEvents: [...state.auditEvents, audit] }
}

// ---------------------------------------------------------------- 角色

export function peopleByRole(state: DemoState): Array<{ role: PersonRole; names: string[] }> {
  const roles: PersonRole[] = ['PM', '艺术总监', '组长', 'BD', 'IT']
  return roles.map((role) => ({
    role,
    names: state.people.filter((person) => person.roles.includes(role)).map((person) => person.name),
  }))
}

/** 同一人兼多角的组合，界面上要点名——复核合并规则就是从这里来的。 */
export function multiRolePeople(state: DemoState): Array<{ name: string; roles: PersonRole[] }> {
  return state.people
    .filter((person) => person.roles.length > 1)
    .map((person) => ({ name: person.name, roles: person.roles }))
}

// ---------------------------------------------------------------- 运维

/**
 * 已知限制。写在这里而不是散在文档里，是因为运维页要照着渲染——
 * 页面上说「都做完了」而实际没做，比没有这一栏更糟。
 */
export const KNOWN_LIMITS: Array<{ item: string; detail: string }> = [
  { item: '无后端与账号', detail: '数据存在浏览器本地，换机器就没了；也没有登录、权限和多人协同。' },
  { item: '连接器未接入', detail: '邮件、企微、飞书都还是粘贴/转发路径，官方接口要企业管理员批。' },
  { item: 'LLM 未真实调用', detail: '供应商与分档已配好，但没有内网网关，页面上的 AI 结果都是种子数据。' },
  { item: '路径不校验存在性', detail: '工作台只登记字符串，不访问公司盘，所以填错路径要人自己发现。' },
  { item: '一键跳转只能复制', detail: '浏览器不允许从 http 页面打开 UNC 路径，需要装自定义协议助手才能真跳转。' },
]

export function dataScale(state: DemoState): Array<{ label: string; count: number }> {
  const assets = state.projects.flatMap((project) => project.assets)
  return [
    { label: '项目', count: state.projects.length },
    { label: '资产', count: assets.length },
    { label: '阶段', count: assets.flatMap((asset) => asset.stages).length },
    { label: '候选', count: state.candidates.length },
    { label: '报价案件', count: state.quoteCases.length },
    { label: '结项案件', count: state.closeoutCases.length },
    { label: '登记路径', count: state.projectPaths.length },
    { label: '审计事件', count: state.auditEvents.length },
  ]
}
