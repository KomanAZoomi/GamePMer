import { DEMO_SCHEMA_VERSION } from '../domain/model'
import type {
  Asset,
  AuditEvent,
  DemoState,
  FeedbackBatch,
  IsoDate,
  NotificationDraft,
  Project,
  ProductionGroup,
  StageCode,
  StageFlag,
  StageMainStatus,
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
    code: '3D_BAKE',
    group: 'grp-3d-a',
    owner: 'Chen',
    days: 1,
    baseline: ['2026-07-30', '2026-07-30'],
    status: 'NotStarted',
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
    feedbackBatches,
    revisions,
    notificationDrafts,
    auditEvents,
    changeRequests: [],
  } satisfies DemoState)
}
