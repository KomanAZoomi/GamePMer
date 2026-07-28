import { DEMO_SCHEMA_VERSION } from '../domain/model'
import { parseFileName } from '../domain/fileIndex'
import type {
  Asset,
  AuditEvent,
  CandidateField,
  ChangeRequest,
  CloseoutCase,
  CloseoutGate,
  CloseoutGateCode,
  Drive,
  EvidenceRef,
  FileIndexEntry,
  InboxCandidate,
  Person,
  QuoteCase,
  QuoteLine,
  QuoteVersion,
  DemoState,
  FeedbackBatch,
  IsoDate,
  NotificationDraft,
  Project,
  ProductionGroup,
  StageCode,
  StageFlag,
  StageMainStatus,
  SourceRecord,
  StagePlan,
  WorkCalendar,
} from '../domain/model'

/**
 * Demo 种子数据。
 *
 * 全部虚构、脱敏。时间基准锁定在 2026-07-27（周一），与 `domain/clock.ts` 的 DEMO_TODAY 一致。
 * 2026-08-05（周三）是公司休息日，用来验证排期跨休息日顺延。
 *
 * 覆盖要求（设计说明 §11）：正常阶段、T-1 提醒、可能延期、客户等待、客户反馈、
 * 范围内返修、范围外追加、已确认修订与基准差异、制作组容量对照、来源与路径证据。
 */

const CALENDAR_ID = 'cal-company'

const calendars: WorkCalendar[] = [
  {
    id: CALENDAR_ID,
    name: '公司日历 2026',
    holidays: ['2026-08-05'], // 全员团建
    extraWorkdays: [],
  },
]

const productionGroups: ProductionGroup[] = [
  { id: 'grp-3d-a', name: '3D 角色 A 组', discipline: '3D', leadName: 'Leo', dailyCapacity: 1.5 },
  { id: 'grp-3d-b', name: '3D 场景 B 组', discipline: '3D', leadName: 'Rui', dailyCapacity: 3 },
  { id: 'grp-2d-a', name: '2D 角色 A 组', discipline: '2D', leadName: 'Yuki', dailyCapacity: 2 },
]

const STAGE_NAMES: Record<StageCode, string> = {
  '2D_SKETCH': '草图',
  '2D_DETAIL_50': '细化 50%',
  '2D_FINAL': '完成稿',
  '3D_MID': '中模',
  '3D_HIGH': '高模',
  '3D_LOW': '低模',
  '3D_BAKE': '烘焙',
  '3D_TEXTURE': '贴图',
  '3D_LOD': 'LOD',
}

interface StageSeed {
  code: StageCode
  group: string
  owner: string
  days: number
  baseline: [IsoDate, IsoDate]
  /** 缺省时与基准相同；不同表示已经过确认修订 */
  current?: [IsoDate, IsoDate]
  actual?: [IsoDate, IsoDate?]
  submittedToClientAt?: IsoDate
  clientApprovedAt?: IsoDate
  status: StageMainStatus
  flags?: StageFlag[]
  revisionReason?: string
}

function buildAsset(
  projectCode: string,
  id: string,
  name: string,
  discipline: '2D' | '3D',
  seeds: StageSeed[],
): Asset {
  const stages: StagePlan[] = seeds.map((seed, index) => ({
    id: `${id}/${seed.code}`,
    code: seed.code,
    name: STAGE_NAMES[seed.code],
    assetId: id,
    productionGroupId: seed.group,
    ownerName: seed.owner,
    estimatedPersonDays: seed.days,
    baselineStart: seed.baseline[0],
    baselineFinish: seed.baseline[1],
    currentStart: (seed.current ?? seed.baseline)[0],
    currentFinish: (seed.current ?? seed.baseline)[1],
    actualStart: seed.actual?.[0],
    actualFinish: seed.actual?.[1],
    submittedToClientAt: seed.submittedToClientAt,
    clientApprovedAt: seed.clientApprovedAt,
    dependsOn: index === 0 ? [] : [`${id}/${seeds[index - 1].code}`],
    status: seed.status,
    flags: seed.flags ?? [],
    revisionReason: seed.revisionReason,
  }))

  return { id, name, discipline, projectCode, stages }
}

// ---------------------------------------------------------------- P-3D-024 主路径

const mech01 = buildAsset('P-3D-024', 'MECH-01', '主角机甲', '3D', [
  {
    code: '3D_MID',
    group: 'grp-3d-a',
    owner: 'Chen',
    days: 3,
    baseline: ['2026-07-20', '2026-07-22'],
    actual: ['2026-07-20', '2026-07-22'],
    submittedToClientAt: '2026-07-22',
    clientApprovedAt: '2026-07-23',
    status: 'Approved',
  },
  {
    // 已交付客户并收到反馈：主状态保留「等待客户」的事实，返修以叠加标记表达
    code: '3D_HIGH',
    group: 'grp-3d-a',
    owner: 'Chen',
    days: 2,
    baseline: ['2026-07-23', '2026-07-24'],
    actual: ['2026-07-23', '2026-07-24'],
    submittedToClientAt: '2026-07-24',
    status: 'AwaitingClient',
    flags: ['Rework', 'ScheduleRevisionRequired'],
  },
  {
    // 计划今天开始，但上游还在等客户 → 只标「可能延期」，不自动判定实际延期
    code: '3D_LOW',
    group: 'grp-3d-a',
    owner: 'Chen',
    days: 3,
    baseline: ['2026-07-27', '2026-07-29'],
    status: 'NotStarted',
    flags: ['PossibleDelay'],
  },
  {
    // 被追加报价 CQ-004（背部能源模块）冻结，等待复核与变更开工。
    // 只冻这一个阶段——同资产的其他阶段和 MECH-02 都继续制作
    code: '3D_BAKE',
    group: 'grp-3d-a',
    owner: 'Chen',
    days: 1,
    baseline: ['2026-07-30', '2026-07-30'],
    status: 'NotStarted',
    flags: ['WaitingChangeQuote'],
  },
  {
    code: '3D_TEXTURE',
    group: 'grp-3d-a',
    owner: 'Mei',
    days: 3,
    baseline: ['2026-07-31', '2026-08-04'],
    status: 'NotStarted',
  },
  {
    // 跨过 8/5 公司休息日
    code: '3D_LOD',
    group: 'grp-3d-a',
    owner: 'Mei',
    days: 2,
    baseline: ['2026-08-06', '2026-08-07'],
    status: 'NotStarted',
  },
])

const mech02 = buildAsset('P-3D-024', 'MECH-02', '轻型载具', '3D', [
  {
    code: '3D_MID',
    group: 'grp-3d-b',
    owner: 'Rui',
    days: 2,
    baseline: ['2026-07-27', '2026-07-28'],
    actual: ['2026-07-27'],
    status: 'InProduction',
  },
  { code: '3D_HIGH', group: 'grp-3d-b', owner: 'Rui', days: 3, baseline: ['2026-07-29', '2026-07-31'], status: 'NotStarted' },
  { code: '3D_LOW', group: 'grp-3d-b', owner: 'Rui', days: 2, baseline: ['2026-08-03', '2026-08-04'], status: 'NotStarted' },
])

// ---------------------------------------------------------------- P-2D-018 客户等待

const char08 = buildAsset('P-2D-018', 'CHAR-08', '商人 NPC', '2D', [
  {
    code: '2D_SKETCH',
    group: 'grp-2d-a',
    owner: 'Yuki',
    days: 2,
    baseline: ['2026-07-20', '2026-07-21'],
    actual: ['2026-07-20', '2026-07-21'],
    submittedToClientAt: '2026-07-21',
    clientApprovedAt: '2026-07-22',
    status: 'Approved',
  },
  {
    // 已提交客户 3 个工作日无回复
    code: '2D_DETAIL_50',
    group: 'grp-2d-a',
    owner: 'Yuki',
    days: 3,
    baseline: ['2026-07-22', '2026-07-24'],
    actual: ['2026-07-22', '2026-07-24'],
    submittedToClientAt: '2026-07-24',
    status: 'AwaitingClient',
  },
  {
    // 已确认修订 v1：客户等待导致右移 1 个工作日，基准保持不变
    code: '2D_FINAL',
    group: 'grp-2d-a',
    owner: 'Yuki',
    days: 3,
    baseline: ['2026-07-27', '2026-07-29'],
    current: ['2026-07-28', '2026-07-30'],
    status: 'NotStarted',
    revisionReason: 'client-wait',
  },
])

const char09 = buildAsset('P-2D-018', 'CHAR-09', '卫兵 NPC', '2D', [
  {
    code: '2D_SKETCH',
    group: 'grp-2d-a',
    owner: 'Mika',
    days: 2,
    baseline: ['2026-07-27', '2026-07-28'],
    actual: ['2026-07-27'],
    status: 'InProduction',
  },
  { code: '2D_DETAIL_50', group: 'grp-2d-a', owner: 'Mika', days: 3, baseline: ['2026-07-29', '2026-07-31'], status: 'NotStarted' },
  { code: '2D_FINAL', group: 'grp-2d-a', owner: 'Mika', days: 3, baseline: ['2026-08-03', '2026-08-06'], status: 'NotStarted' },
])

// ---------------------------------------------------------------- P-3D-031 正常对照

const prop01 = buildAsset('P-3D-031', 'PROP-01', '补给箱', '3D', [
  {
    // 明日到期且尚未收到完成邮件 → T-1 提醒草稿
    code: '3D_MID',
    group: 'grp-3d-b',
    owner: 'Lin',
    days: 2,
    baseline: ['2026-07-27', '2026-07-28'],
    actual: ['2026-07-27'],
    status: 'InProduction',
  },
  { code: '3D_HIGH', group: 'grp-3d-b', owner: 'Lin', days: 2, baseline: ['2026-07-29', '2026-07-30'], status: 'NotStarted' },
  { code: '3D_LOW', group: 'grp-3d-b', owner: 'Lin', days: 1, baseline: ['2026-07-31', '2026-07-31'], status: 'NotStarted' },
  { code: '3D_BAKE', group: 'grp-3d-b', owner: 'Lin', days: 1, baseline: ['2026-08-03', '2026-08-03'], status: 'NotStarted' },
  { code: '3D_TEXTURE', group: 'grp-3d-b', owner: 'Lin', days: 2, baseline: ['2026-08-04', '2026-08-06'], status: 'NotStarted' },
  { code: '3D_LOD', group: 'grp-3d-b', owner: 'Lin', days: 1, baseline: ['2026-08-07', '2026-08-07'], status: 'NotStarted' },
])

const prop02 = buildAsset('P-3D-031', 'PROP-02', '霓虹灯柱', '3D', [
  { code: '3D_MID', group: 'grp-3d-b', owner: 'Lin', days: 2, baseline: ['2026-07-29', '2026-07-30'], status: 'NotStarted' },
  { code: '3D_HIGH', group: 'grp-3d-b', owner: 'Lin', days: 2, baseline: ['2026-07-31', '2026-08-03'], status: 'NotStarted' },
  { code: '3D_LOW', group: 'grp-3d-b', owner: 'Lin', days: 1, baseline: ['2026-08-04', '2026-08-04'], status: 'NotStarted' },
])

// 与 MECH-01 共用 3D-A 组，用于制造可解释的容量冲突
const prop03 = buildAsset('P-3D-031', 'PROP-03', '街道路障', '3D', [
  { code: '3D_MID', group: 'grp-3d-a', owner: 'Chen', days: 2, baseline: ['2026-07-30', '2026-07-31'], status: 'NotStarted' },
  { code: '3D_HIGH', group: 'grp-3d-a', owner: 'Chen', days: 2, baseline: ['2026-08-03', '2026-08-04'], status: 'NotStarted' },
])

// ---------------------------------------------------------------- P-3D-011 结项对照

const approved = (
  code: StageCode,
  days: number,
  start: IsoDate,
  finish: IsoDate,
  approvedAt: IsoDate,
): StageSeed => ({
  code,
  group: 'grp-3d-b',
  owner: 'Lin',
  days,
  baseline: [start, finish],
  actual: [start, finish],
  submittedToClientAt: finish,
  clientApprovedAt: approvedAt,
  status: 'Approved',
})

const relay01 = buildAsset('P-3D-011', 'RELAY-01', '中继终端', '3D', [
  approved('3D_MID', 2, '2026-07-06', '2026-07-07', '2026-07-08'),
  approved('3D_HIGH', 2, '2026-07-08', '2026-07-09', '2026-07-10'),
  approved('3D_LOW', 1, '2026-07-10', '2026-07-10', '2026-07-13'),
  approved('3D_BAKE', 1, '2026-07-13', '2026-07-13', '2026-07-14'),
  approved('3D_TEXTURE', 2, '2026-07-14', '2026-07-15', '2026-07-16'),
  approved('3D_LOD', 2, '2026-07-16', '2026-07-17', '2026-07-20'),
])

const projects: Project[] = [
  {
    id: 'prj-3d-024',
    code: 'P-3D-024',
    name: '蒸汽守卫角色资产包',
    client: 'Northstar Studio',
    discipline: '3D',
    status: 'InProduction',
    pmName: 'Brandon',
    artDirectorName: 'Evan',
    calendarId: CALENDAR_ID,
    assets: [mech01, mech02],
  },
  {
    id: 'prj-2d-018',
    code: 'P-2D-018',
    name: 'NPC 服装套装',
    client: 'Lumen Games',
    discipline: '2D',
    status: 'AwaitingClient',
    pmName: 'Brandon',
    artDirectorName: 'Ines',
    calendarId: CALENDAR_ID,
    assets: [char08, char09],
  },
  {
    id: 'prj-3d-031',
    code: 'P-3D-031',
    name: '赛博街区场景包',
    client: 'Northstar Studio',
    discipline: '3D',
    status: 'InProduction',
    pmName: 'Brandon',
    artDirectorName: 'Evan',
    calendarId: CALENDAR_ID,
    assets: [prop01, prop02, prop03],
  },
  {
    // 全部阶段已验收，等待总监整理最终包 → 结项与备份分组的对照数据
    id: 'prj-3d-011',
    code: 'P-3D-011',
    name: '幽灵中继站道具组',
    client: 'Northstar Studio',
    discipline: '3D',
    status: 'Closing',
    pmName: 'Brandon',
    artDirectorName: 'Evan',
    calendarId: CALENDAR_ID,
    assets: [relay01],
  },
]

// ---------------------------------------------------------------- 人与角色

/** Leo 同时是组长和 BD——这是公司里最常见的兼职组合，也是复核合并规则的来源。 */
const people: Person[] = [
  { id: 'PER-brandon', name: 'Brandon', roles: ['PM'] },
  { id: 'PER-evan', name: 'Evan', roles: ['艺术总监'] },
  { id: 'PER-leo', name: 'Leo', roles: ['组长', 'BD'] },
  { id: 'PER-liu', name: 'Liu', roles: ['BD'] },
  { id: 'PER-yuki', name: 'Yuki', roles: ['组长'] },
  { id: 'PER-it', name: 'Project Archive', roles: ['IT'] },
]

// ---------------------------------------------------------------- 报价与变更

const line = (
  id: string,
  assetId: string,
  stageCode: StageCode,
  title: string,
  note: string,
  personDays: number,
  plannedStart?: IsoDate,
  plannedFinish?: IsoDate,
): QuoteLine => ({
  id,
  assetId,
  stageCode,
  title,
  note,
  personDays,
  unitPrice: 2000,
  plannedStart,
  plannedFinish,
})

const quoteVersions: QuoteVersion[] = [
  {
    // 首次报价：已开工，作为「原报价永不覆盖」的基数
    id: 'Q-021/V01',
    caseId: 'Q-021',
    version: 1,
    submittedBy: 'Evan',
    submittedAt: '2026-07-15T14:20:00+08:00',
    scheduleImpactWorkdays: 0,
    lines: [
      line('Q-021/L01', 'MECH-01', '3D_MID', '主角机甲 · 中模', '基础比例与结构', 3, '2026-07-20', '2026-07-22'),
      line('Q-021/L02', 'MECH-01', '3D_HIGH', '主角机甲 · 高模', '细节雕刻', 2, '2026-07-23', '2026-07-24'),
      line('Q-021/L03', 'MECH-01', '3D_LOW', '主角机甲 · 低模', '拓扑与 UV', 3, '2026-07-27', '2026-07-29'),
      line('Q-021/L04', 'MECH-01', '3D_BAKE', '主角机甲 · 烘焙', '法线与 AO', 1, '2026-07-30', '2026-07-30'),
      line('Q-021/L05', 'MECH-01', '3D_TEXTURE', '主角机甲 · 贴图', 'PBR 材质', 3, '2026-07-31', '2026-08-04'),
      line('Q-021/L06', 'MECH-01', '3D_LOD', '主角机甲 · LOD', '三级细节', 2, '2026-08-06', '2026-08-07'),
      line('Q-021/L07', 'MECH-02', '3D_MID', '轻型载具 · 中模', '车体结构', 2, '2026-07-27', '2026-07-28'),
      line('Q-021/L08', 'MECH-02', '3D_HIGH', '轻型载具 · 高模', '细节与部件', 3, '2026-07-29', '2026-07-31'),
      line('Q-021/L09', 'MECH-02', '3D_LOW', '轻型载具 · 低模', '拓扑与 UV', 2, '2026-08-03', '2026-08-04'),
    ],
    review: {
      personId: 'PER-leo',
      roles: ['组长', 'BD'],
      decision: 'approve',
      decidedAt: '2026-07-16T10:05:00+08:00',
      note: '人天与节点合理，同意接入。',
    },
  },
  {
    // P-3D-011 的首次报价，已开工并已交付——结项出账要汇总的就是它
    id: 'Q-018/V01',
    caseId: 'Q-018',
    version: 1,
    submittedBy: 'Evan',
    submittedAt: '2026-07-02T10:15:00+08:00',
    scheduleImpactWorkdays: 0,
    lines: [
      line('Q-018/L01', 'RELAY-01', '3D_MID', '中继终端 · 中模', '基础结构', 2, '2026-07-06', '2026-07-07'),
      line('Q-018/L02', 'RELAY-01', '3D_HIGH', '中继终端 · 高模', '面板与线缆细节', 2, '2026-07-08', '2026-07-09'),
      line('Q-018/L03', 'RELAY-01', '3D_LOW', '中继终端 · 低模', '拓扑与 UV', 1, '2026-07-10', '2026-07-10'),
      line('Q-018/L04', 'RELAY-01', '3D_BAKE', '中继终端 · 烘焙', '法线与 AO', 1, '2026-07-13', '2026-07-13'),
      line('Q-018/L05', 'RELAY-01', '3D_TEXTURE', '中继终端 · 贴图', 'PBR 材质', 2, '2026-07-14', '2026-07-15'),
      line('Q-018/L06', 'RELAY-01', '3D_LOD', '中继终端 · LOD', '三级细节', 2, '2026-07-16', '2026-07-17'),
    ],
    review: {
      personId: 'PER-liu',
      roles: ['BD'],
      decision: 'approve',
      decidedAt: '2026-07-02T16:40:00+08:00',
      note: '价格与客户预算一致。',
    },
  },
  {
    // 追加报价：等待复核，4.5 人天 / ¥9,000 / +3 工作日
    // 8/5 是公司休息日，8/8~8/9 是周末，节点已避开
    id: 'CQ-004/V01',
    caseId: 'CQ-004',
    version: 1,
    submittedBy: 'Evan',
    submittedAt: '2026-07-27T11:18:00+08:00',
    scheduleImpactWorkdays: 3,
    lines: [
      line('CQ-004/L01', 'MECH-01', '3D_HIGH', '高模 · 能源模块结构', '新增结构设计与细化', 1.5, '2026-08-03', '2026-08-04'),
      line('CQ-004/L02', 'MECH-01', '3D_LOW', '低模', '拓扑与结构适配', 0.8, '2026-08-06', '2026-08-06'),
      line('CQ-004/L03', 'MECH-01', '3D_BAKE', '烘焙', '新部件法线与检查', 0.4, '2026-08-07', '2026-08-07'),
      line('CQ-004/L04', 'MECH-01', '3D_TEXTURE', '贴图', '材质表现与整合', 1.2, '2026-08-10', '2026-08-11'),
      line('CQ-004/L05', 'MECH-01', '3D_LOD', 'LOD', '新增模块多级细节', 0.6, '2026-08-12', '2026-08-12'),
    ],
  },
  {
    // 首次报价：等待复核，复核人只担任 BD 一个角色
    id: 'Q-031/V01',
    caseId: 'Q-031',
    version: 1,
    submittedBy: 'Evan',
    submittedAt: '2026-07-27T16:40:00+08:00',
    scheduleImpactWorkdays: 12,
    lines: [
      line('Q-031/L01', 'COSTUME-01', '3D_MID', '时装 A · 中模', '6 套时装的基础结构', 6, '2026-08-17', '2026-08-24'),
      line('Q-031/L02', 'COSTUME-01', '3D_HIGH', '时装 A · 高模', '布料细节', 8, '2026-08-25', '2026-09-03'),
      line('Q-031/L03', 'COSTUME-01', '3D_TEXTURE', '时装 A · 贴图', '材质与配色变体', 10, '2026-09-04', '2026-09-17'),
    ],
  },
  {
    // 复核通过、等待 PM 发开工邮件
    id: 'Q-029/V01',
    caseId: 'Q-029',
    version: 1,
    submittedBy: 'Evan',
    submittedAt: '2026-07-24T09:30:00+08:00',
    scheduleImpactWorkdays: 15,
    lines: [
      line('Q-029/L01', 'VEHICLE-01', '3D_MID', '载具 · 中模', '4 台载具基础结构', 8, '2026-08-17', '2026-08-26'),
      line('Q-029/L02', 'VEHICLE-01', '3D_HIGH', '载具 · 高模', '机械细节', 10, '2026-08-27', '2026-09-09'),
    ],
    review: {
      personId: 'PER-liu',
      roles: ['BD'],
      decision: 'approve',
      decidedAt: '2026-07-24T17:10:00+08:00',
      note: '客户已口头认可价格。',
    },
  },
]

const quoteCases: QuoteCase[] = [
  {
    id: 'Q-021',
    kind: 'initial',
    projectCode: 'P-3D-024',
    client: 'Northstar Studio',
    title: '蒸汽守卫角色资产包',
    requirement: 'BD 转来的首次需求：主角机甲与轻型载具各一套 PBR 资产。',
    status: 'KickoffSent',
    affectedAssetIds: ['MECH-01', 'MECH-02'],
    directorName: 'Evan',
    reviewerPersonId: 'PER-leo',
    createdAt: '2026-07-14T09:10:00+08:00',
    activeVersionId: 'Q-021/V01',
    kickoffSentAt: '2026-07-17T09:00:00+08:00',
    kickoffSentBy: 'Brandon',
    evidence: [
      {
        id: 'EV-Q021-1',
        kind: 'email',
        label: 'BD 需求邮件',
        locator: '【新需求】Northstar 蒸汽守卫资产包',
        receivedAt: '2026-07-14T09:08:00+08:00',
        from: 'bd.liu@studio.example',
      },
    ],
  },
  {
    id: 'Q-018',
    kind: 'initial',
    projectCode: 'P-3D-011',
    client: 'Aurora Interactive',
    title: 'NPC 中继终端资产',
    requirement: 'BD 转来的首次需求：中继终端一套完整 PBR 资产。',
    status: 'KickoffSent',
    affectedAssetIds: ['RELAY-01'],
    directorName: 'Evan',
    reviewerPersonId: 'PER-liu',
    createdAt: '2026-07-01T14:00:00+08:00',
    activeVersionId: 'Q-018/V01',
    kickoffSentAt: '2026-07-03T09:20:00+08:00',
    kickoffSentBy: 'Brandon',
    evidence: [
      {
        id: 'EV-Q018-1',
        kind: 'email',
        label: 'BD 需求邮件',
        locator: '【新需求】Aurora 中继终端资产',
        receivedAt: '2026-07-01T13:55:00+08:00',
        from: 'bd.liu@studio.example',
      },
    ],
  },
  {
    id: 'CQ-004',
    kind: 'change',
    projectCode: 'P-3D-024',
    client: 'Northstar Studio',
    title: '新增背部能源模块',
    requirement:
      '原始报价与需求清单中没有背部能源模块；需要补充高模、低模、烘焙、贴图和 LOD 工作，并更新受影响节点排期。',
    status: 'AwaitingReview',
    sourceFeedbackItemId: 'F-017/ITEM-04',
    changeRequestId: 'CQ-004',
    // 只有 MECH-01 受影响。MECH-02 与其他项目照常制作
    affectedAssetIds: ['MECH-01'],
    directorName: 'Evan',
    reviewerPersonId: 'PER-leo',
    createdAt: '2026-07-27T10:52:00+08:00',
    activeVersionId: 'CQ-004/V01',
    evidence: [
      {
        id: 'EV-CQ004-1',
        kind: 'email',
        label: '客户反馈原文',
        locator: 'Re: P-3D-024 / MECH-01 Highpoly Review',
        receivedAt: '2026-07-27T10:42:00+08:00',
        from: 'client.review@northstar.example',
      },
      {
        id: 'EV-CQ004-2',
        kind: 'email',
        label: '总监返回报价',
        locator: 'RE: CQ-004 背部能源模块人天与节点',
        receivedAt: '2026-07-27T11:18:00+08:00',
        from: 'evan@studio.example',
      },
    ],
  },
  {
    id: 'Q-031',
    kind: 'initial',
    projectCode: 'P-3D-033',
    client: 'Northstar Studio',
    title: '新角色 6 套时装',
    requirement: '客户想加 6 套时装，需要报价和排期。项目尚未创建。',
    status: 'AwaitingReview',
    affectedAssetIds: ['COSTUME-01'],
    directorName: 'Evan',
    reviewerPersonId: 'PER-liu',
    createdAt: '2026-07-26T16:31:00+08:00',
    activeVersionId: 'Q-031/V01',
    evidence: [
      {
        id: 'EV-Q031-1',
        kind: 'email',
        label: 'BD 需求邮件',
        locator: '新角色 6 套时装需求',
        receivedAt: '2026-07-26T16:30:00+08:00',
        from: 'bd.liu@studio.example',
      },
    ],
  },
  {
    id: 'Q-030',
    kind: 'initial',
    projectCode: 'P-2D-020',
    client: 'Halcyon Games',
    title: '场景概念图 12 张',
    requirement: '12 张场景概念设计，含 2 轮修改。',
    status: 'DirectorQuoting',
    affectedAssetIds: [],
    directorName: 'Yuki',
    reviewerPersonId: 'PER-yuki',
    createdAt: '2026-07-26T11:05:00+08:00',
    evidence: [
      {
        id: 'EV-Q030-1',
        kind: 'email',
        label: 'BD 需求邮件',
        locator: '场景概念图需求',
        receivedAt: '2026-07-26T11:00:00+08:00',
        from: 'bd.liu@studio.example',
      },
    ],
  },
  {
    id: 'Q-029',
    kind: 'initial',
    projectCode: 'P-3D-034',
    client: 'Aurora Interactive',
    title: '载具模型 4 台',
    requirement: '4 台载具，含中模与高模，不含贴图。',
    status: 'Approved',
    affectedAssetIds: ['VEHICLE-01'],
    directorName: 'Evan',
    reviewerPersonId: 'PER-liu',
    createdAt: '2026-07-23T15:20:00+08:00',
    activeVersionId: 'Q-029/V01',
    evidence: [
      {
        id: 'EV-Q029-1',
        kind: 'email',
        label: 'BD 需求邮件',
        locator: '载具模型报价请求',
        receivedAt: '2026-07-23T15:18:00+08:00',
        from: 'bd.liu@studio.example',
      },
    ],
  },
]

/** 与 CQ-004 报价案件配对的变更单。反馈中心判为范围外时会从 CQ-005 起继续编号。 */
const changeRequests: ChangeRequest[] = [
  {
    id: 'CQ-004',
    projectCode: 'P-3D-024',
    assetId: 'MECH-01',
    sourceFeedbackItemId: 'F-017/ITEM-04',
    title: '新增背部能源模块',
    status: 'AwaitingReview',
  },
]

// ---------------------------------------------------------------- 盘位与文件索引

const drives: Drive[] = [
  { id: 'DR-feedback', kind: 'feedback', label: '反馈盘', path: '\\\\NAS-ART\\Feedback' },
  { id: 'DR-production', kind: 'production', label: '制作盘', path: '\\\\NAS-ART\\Production' },
  { id: 'DR-delivery', kind: 'delivery', label: '提交盘', path: '\\\\NAS-ART\\Delivery' },
  { id: 'DR-final', kind: 'final', label: '最终包', path: '\\\\NAS-ART\\Final' },
  { id: 'DR-archive', kind: 'archive', label: '归档盘（IT 管辖）', path: '\\\\ARCHIVE\\2026' },
]

interface FileSeed {
  id: string
  driveId: string
  fileName: string
  folder: string
  discoveredAt: string
  status: FileIndexEntry['status']
  linkedStageId?: string
  linkedBy?: string
  linkedAt?: string
  ignoredReason?: string
  aiHint?: string
}

/**
 * 文件索引种子。
 *
 * 覆盖三档解析结果：规范命名自动关联、缺版本号待确认、完全不规范待手工关联。
 * 最后一类**原文件名原样保留**——这是这一页最重要的一条规则。
 */
const FILE_SEEDS: FileSeed[] = [
  {
    id: 'FI-0001',
    driveId: 'DR-production',
    fileName: 'MECH-01_低模_20260803_r02.fbx',
    folder: '\\P-3D-024\\MECH-01',
    discoveredAt: '2026-07-27T14:22:00+08:00',
    status: 'auto',
    linkedStageId: 'MECH-01/3D_LOW',
  },
  {
    id: 'FI-0002',
    driveId: 'DR-production',
    fileName: 'MECH-01_烘焙_20260805_r01.zip',
    folder: '\\P-3D-024\\MECH-01',
    discoveredAt: '2026-07-27T11:07:00+08:00',
    status: 'auto',
    linkedStageId: 'MECH-01/3D_BAKE',
  },
  {
    // 缺版本号：解析出前三段，按 r01 待确认
    id: 'FI-0003',
    driveId: 'DR-production',
    fileName: 'MECH-02_高模_20260727.max',
    folder: '\\P-3D-024\\MECH-02',
    discoveredAt: '2026-07-27T10:41:00+08:00',
    status: 'needs-review',
    aiHint: '同目录下没有 r01，推测这是首版。确认后建议按 r01 归档。',
  },
  {
    // 完全不规范：原文件名保留，等 PM 手工关联
    id: 'FI-0004',
    driveId: 'DR-production',
    fileName: '机甲主角_最终版本_改过的_v3_ok.fbx',
    folder: '\\P-3D-024\\临时',
    discoveredAt: '2026-07-27T09:58:00+08:00',
    status: 'unresolved',
    aiHint:
      '文件名含「最终版本」「改过的」「ok」等非规范词，无法定位阶段。同目录下 MECH-01_低模_20260803_r02.fbx 与本文件大小接近（±3%），可能是同一阶段的另一版；两者哈希不同，不能自动认定。',
  },
  {
    id: 'FI-0005',
    driveId: 'DR-production',
    fileName: 'CHAR-08_细化50_20260724_r03.psd',
    folder: '\\P-2D-018\\CHAR-08',
    discoveredAt: '2026-07-24T18:30:00+08:00',
    status: 'auto',
    linkedStageId: 'CHAR-08/2D_DETAIL_50',
  },
  {
    id: 'FI-0006',
    driveId: 'DR-production',
    fileName: 'PROP-01_中模_20260727_r01.fbx',
    folder: '\\P-3D-031\\PROP-01',
    discoveredAt: '2026-07-27T17:12:00+08:00',
    status: 'auto',
    linkedStageId: 'PROP-01/3D_MID',
  },
  {
    // 资产名里字母 O 与数字 0 混淆：解析得出格式，但库里查无此资产
    id: 'FI-0007',
    driveId: 'DR-production',
    fileName: 'PROP-O1_高模_20260729_r01.fbx',
    folder: '\\P-3D-031\\PROP-01',
    discoveredAt: '2026-07-27T16:04:00+08:00',
    status: 'needs-review',
    aiHint: '资产名 PROP-O1 在库里不存在，字母 O 疑似应为数字 0（PROP-01）。请核对后手工关联。',
  },
  {
    id: 'FI-0008',
    driveId: 'DR-delivery',
    fileName: 'RELAY-01_LOD_20260717_r01.zip',
    folder: '\\P-3D-011\\RELAY-01',
    discoveredAt: '2026-07-17T16:40:00+08:00',
    status: 'auto',
    linkedStageId: 'RELAY-01/3D_LOD',
  },
  {
    id: 'FI-0009',
    driveId: 'DR-feedback',
    fileName: 'review_03.jpg',
    folder: '\\P-3D-024\\F-017_20260727',
    discoveredAt: '2026-07-27T10:42:00+08:00',
    status: 'ignored',
    ignoredReason: '客户批注图，已挂在反馈批次 F-017 的证据上，不作为阶段交付物',
  },
  {
    id: 'FI-0010',
    driveId: 'DR-final',
    fileName: 'P-3D-011_最终包_v2.zip',
    folder: '\\P-3D-011',
    discoveredAt: '2026-07-22T11:05:00+08:00',
    status: 'linked',
    linkedStageId: 'RELAY-01/3D_LOD',
    linkedBy: 'Evan',
    linkedAt: '2026-07-22T11:06:00+08:00',
  },
]

const fileIndex: FileIndexEntry[] = FILE_SEEDS.map((seed) => ({
  id: seed.id,
  driveId: seed.driveId,
  fileName: seed.fileName,
  folder: seed.folder,
  discoveredAt: seed.discoveredAt,
  parse: parseFileName(seed.fileName),
  status: seed.status,
  linkedStageId: seed.linkedStageId,
  linkedBy: seed.linkedBy,
  linkedAt: seed.linkedAt,
  ignoredReason: seed.ignoredReason,
  aiHint: seed.aiHint,
}))

// ---------------------------------------------------------------- 结项、备份与出账

const gate = (
  code: CloseoutGateCode,
  title: string,
  description: string,
  requires: string,
  done?: { at: string; by: string; evidence?: EvidenceRef[]; note?: string },
): CloseoutGate => ({
  code,
  title,
  description,
  requires,
  completedAt: done?.at,
  completedBy: done?.by,
  evidence: done?.evidence ?? [],
  note: done?.note,
})

const GATE_SPECS: Array<[CloseoutGateCode, string, string, string]> = [
  [
    'assets-approved',
    '全部资产验收',
    '2D/3D 阶段与返修任务全部关闭。',
    '由阶段状态自动推导，不能手工打勾',
  ],
  [
    'final-package',
    '总监整理最终包',
    '交付文件、源文件、贴图和 LOD 清单齐全。',
    '最终包路径 + 总监确认',
  ],
  ['client-final', '客户最终确认', '最终提交已通过邮件确认，无未关闭反馈。', '客户的正式邮件回执'],
  ['it-backup', 'IT 剪切备份', '由 IT 执行剪切与归档，工作台只登记路径。', 'IT 的正式邮件回执'],
  ['billing-notified', '通知 BD 出账', '报价、交付清单与全部证据齐备后通知 BD。', '出账通知邮件草稿已发出'],
]

const buildGates = (
  done: Partial<Record<CloseoutGateCode, { at: string; by: string; evidence?: EvidenceRef[]; note?: string }>>,
): CloseoutGate[] => GATE_SPECS.map(([code, title, desc, requires]) => gate(code, title, desc, requires, done[code]))

const closeoutCases: CloseoutCase[] = [
  {
    // 主路径：RELAY-01 六个阶段全部验收，当前卡在 IT 备份回执
    id: 'CO-011',
    projectCode: 'P-3D-011',
    client: 'Aurora Interactive',
    status: 'AwaitingIT',
    openedAt: '2026-07-21T09:30:00+08:00',
    finalPackageOwner: 'Evan',
    paths: [
      {
        id: 'PR-011-final',
        kind: 'final',
        label: '最终包',
        path: '\\\\NAS-ART\\Final\\P-3D-011\\v2',
        verifiedAt: '2026-07-22T11:05:00+08:00',
      },
      {
        id: 'PR-011-src',
        kind: 'production',
        label: '制作盘源路径',
        path: '\\\\NAS-ART\\Production\\P-3D-011',
        verifiedAt: '2026-07-22T11:05:00+08:00',
      },
      {
        id: 'PR-011-archive',
        kind: 'archive',
        label: '归档目标（IT 管辖）',
        path: '\\\\ARCHIVE\\2026\\P-3D-011',
      },
    ],
    gates: buildGates({
      'final-package': {
        at: '2026-07-22T11:05:00+08:00',
        by: 'Evan',
        note: '交付文件、源文件、贴图与 LOD 清单齐全',
        evidence: [
          {
            id: 'EV-CO011-pkg',
            kind: 'path',
            label: '最终包路径',
            locator: '\\\\NAS-ART\\Final\\P-3D-011\\v2',
            receivedAt: '2026-07-22T11:05:00+08:00',
            from: 'Evan',
          },
        ],
      },
      'client-final': {
        at: '2026-07-23T15:20:00+08:00',
        by: 'Brandon',
        note: '客户邮件确认最终包，无未关闭反馈',
        evidence: [
          {
            id: 'EV-CO011-client',
            kind: 'email',
            label: '客户最终确认邮件',
            locator: 'RE: P-3D-011 Final Delivery — Approved',
            receivedAt: '2026-07-23T15:20:00+08:00',
            from: 'pm@aurora.example',
          },
        ],
      },
    }),
  },
  {
    // 被第一道门禁挡住：项目还在制作，26 个阶段没走完
    id: 'CO-024',
    projectCode: 'P-3D-024',
    client: 'Northstar Studio',
    status: 'Precheck',
    openedAt: '2026-07-27T09:00:00+08:00',
    finalPackageOwner: 'Evan',
    paths: [
      {
        id: 'PR-024-src',
        kind: 'production',
        label: '制作盘源路径',
        path: '\\\\NAS-ART\\Production\\P-3D-024',
      },
    ],
    gates: buildGates({}),
  },
  {
    // 也停在第一道：还在等客户验收细化稿
    id: 'CO-018',
    projectCode: 'P-2D-018',
    client: 'Halcyon Games',
    status: 'Precheck',
    openedAt: '2026-07-24T14:00:00+08:00',
    finalPackageOwner: 'Yuki',
    paths: [
      {
        id: 'PR-018-src',
        kind: 'production',
        label: '制作盘源路径',
        path: '\\\\NAS-ART\\Production\\P-2D-018',
      },
    ],
    gates: buildGates({}),
  },
]

// ---------------------------------------------------------------- 候选收件箱

/**
 * 候选记录。
 *
 * 覆盖四种业务类型、三档置信度和五种状态，让第一次打开就能看出这一页在管什么：
 * 两条可直接确认、两条被字段阻断、两条被「模块尚未交付」诚实阻断、
 * 一条自动判重、一条已确认（能追回正式记录）、一条已忽略。
 */
const sourceRecords: SourceRecord[] = [
  {
    id: 'SRC-0001',
    channel: 'email',
    receivedAt: '2026-07-27T10:42:00+08:00',
    from: 'client.review@northstar.example',
    subject: 'Re: P-3D-024 / MECH-01 Highpoly Review',
    body: '肩甲整体比例需要缩小一些，外侧结构请向身体收拢。修改后请重新提交高模评审，后续低模节点可相应顺延。',
    attachments: ['review_03.jpg', 'review_04.jpg'],
    contentHash: 'a1c3f907',
  },
  {
    id: 'SRC-0002',
    channel: 'email',
    receivedAt: '2026-07-27T09:18:00+08:00',
    from: 'rui@studio.example',
    subject: 'MECH-02 高模已完成',
    body: 'MECH-02 高模已完成，请查收。文件在 \\\\NAS-ART\\Production\\P-3D-024\\MECH-02\\MECH-02_高模_20260727_r01.max',
    attachments: [],
    contentHash: 'b7d21e44',
  },
  {
    id: 'SRC-0003',
    channel: 'chat-forward',
    receivedAt: '2026-07-27T11:05:00+08:00',
    from: 'Evan（转发）',
    subject: undefined,
    body: 'P-3D-024 客户又提了一条：高模的散热口位置要往下挪。具体哪个资产他没说清楚，我截图给你。',
    attachments: ['wechat_20260727_1105.png'],
    contentHash: 'c5e80a13',
  },
  {
    id: 'SRC-0004',
    channel: 'screenshot',
    receivedAt: '2026-07-27T14:20:00+08:00',
    from: undefined,
    subject: undefined,
    // OCR 出来的文字本来就残缺，识别置信度低是应该的
    body: '贴图材质偏灰…金属部分再亮一点…P-3D-O31 PROP-02（截图 OCR，部分字符不可靠）',
    attachments: ['ocr_20260727_1420.png'],
    contentHash: 'd93f7c20',
  },
  {
    id: 'SRC-0005',
    channel: 'email',
    receivedAt: '2026-07-26T16:30:00+08:00',
    from: 'bd.liu@studio.example',
    subject: '新角色 6 套时装需求',
    body: '客户想加 6 套时装，麻烦出个报价和排期。P-3D-024 这个项目下走。',
    attachments: ['需求说明_v2.docx'],
    contentHash: 'e2081bb5',
  },
  {
    id: 'SRC-0006',
    channel: 'email',
    receivedAt: '2026-07-25T17:12:00+08:00',
    from: 'it.archive@studio.example',
    subject: 'P-3D-011 已完成剪切备份',
    body: 'P-3D-011 RELAY-01 已完成剪切备份，归档目标 \\\\ARCHIVE\\2026\\P-3D-011。请确认后通知 BD 出账。',
    attachments: [],
    contentHash: 'f4a9d331',
  },
  {
    id: 'SRC-0007',
    channel: 'paste',
    receivedAt: '2026-07-27T13:02:00+08:00',
    from: 'Mika（粘贴）',
    subject: 'CHAR-09 草图完成',
    body: 'P-2D-018 CHAR-09 草图已完成，请查收。',
    attachments: [],
    contentHash: '0b5c72ae',
  },
  {
    id: 'SRC-0008',
    channel: 'email',
    receivedAt: '2026-07-27T10:47:00+08:00',
    from: 'client.review@northstar.example',
    subject: 'Fwd: Re: P-3D-024 / MECH-01 Highpoly Review',
    // 同一封邮件被转发了一次，正文一致 → 自动判重
    body: '肩甲整体比例需要缩小一些，外侧结构请向身体收拢。修改后请重新提交高模评审，后续低模节点可相应顺延。',
    attachments: [],
    contentHash: 'a1c3f907',
  },
  {
    id: 'SRC-0009',
    channel: 'email',
    receivedAt: '2026-07-27T08:40:00+08:00',
    from: 'lin@studio.example',
    subject: 'PROP-01 中模进度',
    body: 'P-3D-031 PROP-01 中模今天能收尾，明天交。',
    attachments: [],
    contentHash: '17ce4b92',
  },
  {
    id: 'SRC-0010',
    channel: 'path',
    receivedAt: '2026-07-27T09:55:00+08:00',
    from: 'Chen（贴路径）',
    subject: undefined,
    body: '\\\\NAS-ART\\Production\\P-3D-024\\临时\\机甲主角_最终版本_改过的_v3_ok.fbx',
    attachments: [],
    contentHash: '2a6b0f81',
  },
]

const field = (
  key: string,
  label: string,
  value: string | undefined,
  confidence: number,
  required: boolean,
  sourceExcerpt?: string,
): CandidateField => ({ key, label, value, confidence, required, sourceExcerpt })

const candidates: InboxCandidate[] = [
  {
    // 主路径：高置信度，可直接确认 → 生成反馈批次
    id: 'C-20260727-017',
    sourceId: 'SRC-0001',
    kind: 'client-feedback',
    title: '高模肩甲比例需要调整',
    status: 'NeedsReview',
    fields: [
      field('projectCode', '关联项目', 'P-3D-024', 0.97, true, 'Re: P-3D-024 / MECH-01 Highpoly…'),
      field('assetId', '关联资产', 'MECH-01', 0.96, true, '…P-3D-024 / MECH-01 Highpoly Review'),
      field('stageCode', '制作阶段', '3D_HIGH', 0.92, true, '…请重新提交高模评审…'),
      field('reason', '反馈原因', '客户修改', 0.88, false, '…比例需要缩小一些…'),
      field('dueDate', '期望回复时间', undefined, 0, false),
    ],
    aiSummary: '缩小肩甲比例并收拢外侧结构；需要重新提交高模评审。原文提到后续节点可顺延，但未给出明确天数。',
    aiDraftPlan:
      '建议确认为客户反馈批次，关联 P-3D-024 / MECH-01 / 高模；随后在反馈中心做范围分流，不直接改动后续节点。',
    createdAt: '2026-07-27T10:43:00+08:00',
  },
  {
    // 阶段完成：可直接确认 → 阶段推进到「已交 PM」
    id: 'C-20260727-018',
    sourceId: 'SRC-0002',
    kind: 'stage-done',
    title: 'MECH-02 高模已完成',
    status: 'NeedsReview',
    fields: [
      field('projectCode', '关联项目', 'P-3D-024', 0.99, true, '…\\P-3D-024\\MECH-02\\…'),
      field('assetId', '关联资产', 'MECH-02', 0.98, true, 'MECH-02 高模已完成…'),
      field('stageCode', '制作阶段', '3D_HIGH', 0.97, true, '…MECH-02_高模_20260727_r01.max'),
      field('drivePath', '盘上路径', '\\\\NAS-ART\\Production\\P-3D-024\\MECH-02', 0.95, false),
      field('completedAt', '完成日期', '2026-07-27', 0.93, false, '…_高模_20260727_r01…'),
    ],
    aiSummary: '文件名符合「资产名_阶段名_日期_版本」规范，与 MECH-02 高模阶段匹配。',
    aiDraftPlan:
      '建议确认为阶段完成，把 MECH-02 高模推进到「已交 PM」并写入实际完成日；是否提交客户仍由 PM 决定。',
    createdAt: '2026-07-27T09:19:00+08:00',
  },
  {
    // 被字段阻断：说了项目和阶段，但没说是哪个资产
    id: 'C-20260727-019',
    sourceId: 'SRC-0003',
    kind: 'client-feedback',
    title: '高模散热口位置需要下移',
    status: 'NeedsReview',
    fields: [
      field('projectCode', '关联项目', 'P-3D-024', 0.94, true, 'P-3D-024 客户又提了一条…'),
      field('assetId', '关联资产', undefined, 0, true),
      field('stageCode', '制作阶段', '3D_HIGH', 0.86, true, '…高模的散热口位置…'),
      field('reason', '反馈原因', '客户修改', 0.8, false),
    ],
    aiSummary: '原文明确是 P-3D-024 的高模问题，但没有指名资产。该项目下有 MECH-01 与 MECH-02 两个资产。',
    aiDraftPlan: '建议先补全关联资产，再确认为客户反馈。转发人可能知道具体是哪个资产，可以先问一句。',
    createdAt: '2026-07-27T11:06:00+08:00',
  },
  {
    // 被置信度阻断：OCR 把 0 认成 O，项目号对不上库里任何一个
    id: 'C-20260727-021',
    sourceId: 'SRC-0004',
    kind: 'client-feedback',
    title: '贴图材质偏灰（截图 OCR）',
    status: 'NeedsReview',
    fields: [
      field('projectCode', '关联项目', 'P-3D-O31', 0.42, true, '…P-3D-O31 PROP-02…'),
      field('assetId', '关联资产', 'PROP-02', 0.63, true, '…PROP-02（截图 OCR…'),
      field('stageCode', '制作阶段', '3D_TEXTURE', 0.71, true, '贴图材质偏灰…'),
      field('reason', '反馈原因', '客户修改', 0.55, false),
    ],
    aiSummary:
      'OCR 结果含不可靠字符：识别出的 P-3D-O31 在库里不存在，字母 O 疑似应为数字 0（P-3D-031）。',
    aiDraftPlan: '建议 PM 打开原图核对项目号后再确认。不要基于 OCR 结果直接写入正式反馈。',
    createdAt: '2026-07-27T14:21:00+08:00',
  },
  {
    // 诚实阻断：模块尚未交付
    id: 'C-20260726-014',
    sourceId: 'SRC-0005',
    kind: 'quote-request',
    title: '新角色 6 套时装需求',
    status: 'NeedsReview',
    fields: [
      field('projectCode', '关联项目', 'P-3D-024', 0.9, true, '…P-3D-024 这个项目下走。'),
      field('assetId', '关联资产', 'MECH-01', 0.5, true),
      field('stageCode', '制作阶段', '3D_HIGH', 0.4, true),
      field('dueDate', '期望交付时间', undefined, 0, false),
    ],
    aiSummary: 'BD 转来的新增需求，共 6 套时装，未给出期望交付时间。',
    aiDraftPlan: '建议确认为报价需求，交 2D/3D 总监出人天与节点。',
    createdAt: '2026-07-26T16:31:00+08:00',
  },
  {
    id: 'C-20260725-009',
    sourceId: 'SRC-0006',
    kind: 'it-receipt',
    title: 'P-3D-011 已完成剪切备份',
    status: 'NeedsReview',
    fields: [
      field('projectCode', '关联项目', 'P-3D-011', 0.98, true, 'P-3D-011 RELAY-01 已完成…'),
      field('assetId', '关联资产', 'RELAY-01', 0.96, true),
      field('stageCode', '制作阶段', '3D_LOD', 0.7, true),
      field('drivePath', '归档目标', '\\\\ARCHIVE\\2026\\P-3D-011', 0.94, false),
    ],
    aiSummary: 'IT 正式邮件回执，归档目标路径已给出，可作为结项门槛「IT 备份」的完成证据。',
    aiDraftPlan: '建议确认为结项证据，随后解锁「通知 BD 出账」。',
    createdAt: '2026-07-25T17:13:00+08:00',
  },
  {
    // 零审批路径：粘贴文本，可直接确认
    id: 'C-20260727-020',
    sourceId: 'SRC-0007',
    kind: 'stage-done',
    title: 'CHAR-09 草图已完成',
    status: 'NeedsReview',
    fields: [
      field('projectCode', '关联项目', 'P-2D-018', 0.95, true, 'P-2D-018 CHAR-09 草图…'),
      field('assetId', '关联资产', 'CHAR-09', 0.95, true),
      field('stageCode', '制作阶段', '2D_SKETCH', 0.93, true, '…CHAR-09 草图已完成…'),
      field('completedAt', '完成日期', '2026-07-27', 0.85, false),
    ],
    aiSummary: '粘贴文本导入，字段齐全且与 P-2D-018 的 CHAR-09 草图阶段匹配。',
    aiDraftPlan: '建议确认为阶段完成，把 CHAR-09 草图推进到「已交 PM」。',
    createdAt: '2026-07-27T13:03:00+08:00',
  },
  {
    // 自动判重：同一封邮件被转发了一次
    id: 'C-20260727-022',
    sourceId: 'SRC-0008',
    kind: 'client-feedback',
    title: 'Fwd: 高模肩甲比例需要调整',
    status: 'Duplicate',
    duplicateOfId: 'C-20260727-017',
    fields: [
      field('projectCode', '关联项目', 'P-3D-024', 0.97, true),
      field('assetId', '关联资产', 'MECH-01', 0.96, true),
      field('stageCode', '制作阶段', '3D_HIGH', 0.92, true),
    ],
    aiSummary: '与候选 C-20260727-017 正文哈希一致，已自动判为重复。',
    aiDraftPlan: '不建议重复确认。如果确实是两件事，可手工解除重复标记。',
    createdAt: '2026-07-27T10:48:00+08:00',
  },
  {
    // 已确认：能从这里追回正式记录
    id: 'C-20260727-016',
    sourceId: 'SRC-0009',
    kind: 'stage-done',
    title: 'PROP-01 中模进度同步',
    status: 'Confirmed',
    fields: [
      field('projectCode', '关联项目', 'P-3D-031', 0.96, true),
      field('assetId', '关联资产', 'PROP-01', 0.95, true),
      field('stageCode', '制作阶段', '3D_MID', 0.9, true),
    ],
    aiSummary: '进度同步邮件，与 PROP-01 中模阶段匹配。',
    aiDraftPlan: '已确认为阶段进度更新。',
    createdAt: '2026-07-27T08:41:00+08:00',
    confirmedAt: '2026-07-27T08:52:00+08:00',
    confirmedBy: 'Brandon',
    confirmedRecordKind: 'StagePlan',
    confirmedRecordId: 'PROP-01/3D_MID',
  },
  {
    // 已忽略：命名不规范的临时文件，不该进正式流程
    id: 'C-20260727-015',
    sourceId: 'SRC-0010',
    kind: 'stage-done',
    title: '机甲主角_最终版本_改过的_v3_ok.fbx',
    status: 'Ignored',
    ignoredReason: '临时目录下的过程文件，已在「文件与归档」手工关联，不作为阶段完成证据',
    fields: [
      field('projectCode', '关联项目', 'P-3D-024', 0.75, true, '…\\P-3D-024\\临时\\…'),
      field('assetId', '关联资产', undefined, 0, true),
      field('stageCode', '制作阶段', undefined, 0, true),
    ],
    aiSummary: '文件名不符合命名规范，无法定位资产与阶段。原文件名已保留。',
    aiDraftPlan: '建议先在「文件与归档」手工关联，不要作为阶段完成候选确认。',
    createdAt: '2026-07-27T09:56:00+08:00',
  },
]

// ---------------------------------------------------------------- 客户反馈 F-017

const feedbackBatches: FeedbackBatch[] = [
  {
    id: 'F-017',
    projectCode: 'P-3D-024',
    client: 'Northstar Studio',
    receivedAt: '2026-07-27T10:42:00+08:00',
    feedbackDrivePath: '\\\\NAS-ART\\Feedback\\P-3D-024\\F-017_20260727',
    summary: '高模评审反馈：肩甲比例偏大、腰部要求新增挂件、胸甲纹理走向需调整。',
    clientWaitWorkdays: 1,
    evidence: [
      {
        id: 'EV-F017-mail',
        kind: 'email',
        label: 'Outlook 邮件',
        locator: 'Re: P-3D-024 / MECH-01 Highpoly Review',
        receivedAt: '2026-07-27T10:42:00+08:00',
        from: 'client.review@northstar.example',
      },
      {
        id: 'EV-F017-shot',
        kind: 'screenshot',
        label: '批注截图 3 张',
        locator: '\\\\NAS-ART\\Feedback\\P-3D-024\\F-017_20260727\\review_03.jpg',
        receivedAt: '2026-07-27T10:42:00+08:00',
      },
    ],
    items: [
      {
        id: 'F-017/ITEM-01',
        batchId: 'F-017',
        assetId: 'MECH-01',
        stageId: 'MECH-01/3D_HIGH',
        title: '缩小肩甲比例',
        originalText: '肩甲比例明显大于设定身体比例，护肩边缘也太厚，需要压一档并收薄边缘。',
        scope: 'unclassified',
        status: 'NeedsClassification',
        ownerName: 'Chen',
        estimatedReworkDays: 2,
        aiSuggestion: {
          scope: 'in-scope',
          rationale: '原始报价已包含高模比例修正，属于既有资产的返修，不涉及新增部件。',
        },
      },
      {
        id: 'F-017/ITEM-02',
        batchId: 'F-017',
        assetId: 'MECH-01',
        stageId: 'MECH-01/3D_HIGH',
        title: '新增腰部挂件',
        originalText: '希望在腰侧增加两个可拆卸挂件，与武器主题呼应。',
        scope: 'unclassified',
        status: 'NeedsClassification',
        ownerName: 'Chen',
        estimatedReworkDays: 3,
        aiSuggestion: {
          scope: 'out-of-scope',
          rationale: '原始报价清单中没有腰部挂件，属于新增部件，建议走追加报价。',
        },
      },
      {
        id: 'F-017/ITEM-03',
        batchId: 'F-017',
        assetId: 'MECH-01',
        stageId: 'MECH-01/3D_HIGH',
        title: '胸甲纹理走向调整',
        originalText: '胸甲的分块走向与参考图不一致，请按参考图重新排布。',
        scope: 'unclassified',
        status: 'NeedsClassification',
        ownerName: 'Chen',
        estimatedReworkDays: 1,
        aiSuggestion: {
          scope: 'in-scope',
          rationale: '属于已报价高模的表面细节修正。',
        },
      },
      {
        // 已判为范围外并进入追加报价 CQ-004——报价页的主路径从这里接上
        id: 'F-017/ITEM-04',
        batchId: 'F-017',
        assetId: 'MECH-01',
        stageId: 'MECH-01/3D_BAKE',
        title: '新增背部能源模块',
        originalText: '另外希望背部增加一组能源模块，形态可以参考附图 04 的机甲。',
        scope: 'out-of-scope',
        status: 'WaitingChangeQuote',
        ownerName: 'Chen',
        estimatedReworkDays: 3,
        aiSuggestion: {
          scope: 'out-of-scope',
          rationale: '原始需求清单和首次报价 Q-021 中没有背部模块，属于新增工作量。',
        },
      },
    ],
  },
]

// ---------------------------------------------------------------- 历史修订、通知与审计

const revisions: DemoState['revisions'] = [
  {
    id: 'REV-P-2D-018-1',
    version: 1,
    projectCode: 'P-2D-018',
    assetId: 'CHAR-08',
    reason: 'client-wait',
    note: '客户对细化 50% 的确认晚于约定日期，完成稿顺延 1 个工作日。等待归因为客户侧。',
    confirmedBy: 'Brandon',
    confirmedAt: '2026-07-27T09:30:00+08:00',
    changes: [
      {
        stageId: 'CHAR-08/2D_FINAL',
        oldStart: '2026-07-27',
        oldFinish: '2026-07-29',
        newStart: '2026-07-28',
        newFinish: '2026-07-30',
        shiftedWorkdays: 1,
      },
    ],
  },
]

const notificationDrafts: NotificationDraft[] = [
  {
    id: 'ND-T1-PROP-01',
    recipientRole: '组长',
    recipientName: 'Rui',
    subject: '[提醒] PROP-01 中模明日到期',
    body: 'PROP-01 中模计划于 2026-07-28 完成，目前尚未收到完成邮件。请确认是否能按期交付。',
    sourceKind: 'reminder',
    sourceId: 'PROP-01/3D_MID',
    status: 'draft',
  },
]

const auditEvents: AuditEvent[] = [
  {
    id: 'AE-001',
    at: '2026-07-23T14:05:00+08:00',
    actor: 'Brandon',
    action: '记录客户验收',
    targetKind: 'StagePlan',
    targetId: 'MECH-01/3D_MID',
    before: 'AwaitingClient',
    after: 'Approved',
    reason: '客户邮件确认中模通过',
  },
  {
    id: 'AE-002',
    at: '2026-07-24T17:20:00+08:00',
    actor: 'Brandon',
    action: '提交客户',
    targetKind: 'StagePlan',
    targetId: 'MECH-01/3D_HIGH',
    before: 'HandedToPm',
    after: 'SubmittedToClient',
  },
  {
    id: 'AE-003',
    at: '2026-07-27T09:30:00+08:00',
    actor: 'Brandon',
    action: '确认排期修订 v1',
    targetKind: 'ScheduleRevision',
    targetId: 'REV-P-2D-018-1',
    before: '2026-07-27—2026-07-29',
    after: '2026-07-28—2026-07-30',
    reason: 'client-wait',
  },
  {
    id: 'AE-004',
    at: '2026-07-27T10:44:00+08:00',
    actor: '系统',
    action: '识别客户反馈并生成候选',
    targetKind: 'FeedbackBatch',
    targetId: 'F-017',
    reason: 'Outlook 邮件与 3 张批注截图',
  },
]

export function createDemoState(): DemoState {
  return structuredClone({
    schemaVersion: DEMO_SCHEMA_VERSION,
    calendars,
    productionGroups,
    projects,
    sourceRecords,
    candidates,
    people,
    quoteCases,
    quoteVersions,
    closeoutCases,
    drives,
    fileIndex,
    feedbackBatches,
    revisions,
    notificationDrafts,
    auditEvents,
    changeRequests,
  } satisfies DemoState)
}
