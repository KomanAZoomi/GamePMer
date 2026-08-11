import type { Asset, CloseoutCase, DemoState, EvidenceRef, Project, StageFlag, StagePlan } from '../domain/model'
import { createDemoState } from './seed'

export const ACCEPTANCE_SCENARIO = {
  quoteCaseId: 'CO-004',
  projectCode: 'SKF_A_3D_B52',
  feedbackBatchId: 'F-018',
} as const

const projectCode = ACCEPTANCE_SCENARIO.projectCode
const affectedAssetId = 'SKF-A-01'
const companionAssetId = 'SKF-A-02'

const evidence = (id: string, label: string, locator: string, receivedAt: string, from?: string): EvidenceRef => ({
  id,
  kind: locator.startsWith('\\\\') ? 'path' : 'email',
  label,
  locator,
  receivedAt,
  from,
})

function renameAsset(source: Asset, id: string, name: string, shiftAfterHigh: boolean): Asset {
  const stages = source.stages.map((stage, index): StagePlan => {
    const shift = shiftAfterHigh && index >= 2
    const shiftedStart = shift ? `2026-07-${String(12 + index * 2).padStart(2, '0')}` : stage.currentStart
    const shiftedFinish = shift ? `2026-07-${String(13 + index * 2).padStart(2, '0')}` : stage.currentFinish
    return {
      ...stage,
      id: `${id}/${stage.code}`,
      assetId: id,
      dependsOn: index === 0 ? [] : [`${id}/${source.stages[index - 1].code}`],
      currentStart: shiftedStart,
      currentFinish: shiftedFinish,
      revisionReason: shift ? 'client-feedback' : stage.revisionReason,
      flags: shift ? [...new Set<StageFlag>([...stage.flags, 'ScheduleRevisionRequired'])] : stage.flags,
    }
  })
  return { ...source, id, name, projectCode, stages }
}

function completedCloseout(source: CloseoutCase): CloseoutCase {
  return {
    ...source,
    id: 'CO-SKF-004',
    projectCode,
    client: 'Silver Kite Forge',
    status: 'Archived',
    archivedAt: '2026-07-29T16:20:00+08:00',
    gates: source.gates.map((gate, index) => ({
      ...gate,
      completedAt: `2026-07-${String(24 + index).padStart(2, '0')}T10:00:00+08:00`,
      completedBy: index === 1 ? 'Evan' : index === 3 ? 'Project Archive' : 'Brandon',
      evidence: [
        evidence(
          `EV-SKF-CO-${index + 1}`,
          gate.title,
          index === 3
            ? '\\ARCHIVE\\2026\\SKF_A_3D_B52'
            : `SKF_A_3D_B52 ${gate.title} confirmation`,
          `2026-07-${String(24 + index).padStart(2, '0')}T10:00:00+08:00`,
          index === 3 ? 'it.archive@studio.example' : undefined,
        ),
      ],
    })),
  }
}

/**
 * 固定的虚构业务案例，供任何浏览器一键复现验收，而不是依赖某个浏览器已有 localStorage。
 * 这里复用基础种子的组织配置与已验证的领域对象形状，但所有正式业务集合都替换为该案例。
 */
export function createAcceptanceScenarioState(): DemoState {
  const state = createDemoState()
  const relayProject = state.projects.find((item) => item.code === 'AUR_A_3D_B11')!
  const relayAsset = relayProject.assets[0]
  const quote = state.quoteCases.find((item) => item.id === 'Q-018')!
  const quoteVersion = state.quoteVersions.find((item) => item.caseId === quote.id)!
  const feedback = state.feedbackBatches.find((item) => item.id === 'F-016')!
  const closeout = state.closeoutCases.find((item) => item.projectCode === relayProject.code)!

  const affected = renameAsset(relayAsset, affectedAssetId, '行者机甲', true)
  const companion = renameAsset(relayAsset, companionAssetId, '侦察无人机', false)
  const project: Project = {
    ...relayProject,
    id: 'prj-skf-a-3d-b52',
    code: projectCode,
    name: '银鸢远征队装备组',
    client: 'Silver Kite Forge',
    status: 'Archived',
    assets: [affected, companion],
  }

  const feedbackItemId = 'F-018-01'
  return {
    ...state,
    projects: [project],
    quoteCases: [
      {
        ...quote,
        id: ACCEPTANCE_SCENARIO.quoteCaseId,
        projectCode,
        client: project.client,
        title: project.name,
        requirement: 'BD 转入：两套完整 3D PBR 装备资产，含中模、高模、低模、烘焙、贴图和 LOD。',
        affectedAssetIds: [affectedAssetId, companionAssetId],
        activeVersionId: 'CO-004/V01',
      },
    ],
    quoteVersions: [
      {
        ...quoteVersion,
        id: 'CO-004/V01',
        caseId: ACCEPTANCE_SCENARIO.quoteCaseId,
        lines: quoteVersion.lines.map((line, index) => ({
          ...line,
          id: `CO-004/L${String(index + 1).padStart(2, '0')}`,
          assetId: affectedAssetId,
        })),
      },
    ],
    sourceRecords: [
      {
        id: 'SRC-SKF-001',
        channel: 'email',
        receivedAt: '2026-07-18T11:10:00+08:00',
        from: 'client.review@silverkite.example',
        subject: 'SKF_A_3D_B52 Highpoly review',
        body: '行者机甲高模比例需要收窄，后续低模与贴图节点请顺延。',
        attachments: ['SKF_F-018_markup.jpg'],
        contentHash: 'skf-f018-a2b1',
      },
    ],
    candidates: [],
    feedbackBatches: [
      {
        ...feedback,
        id: ACCEPTANCE_SCENARIO.feedbackBatchId,
        projectCode,
        client: project.client,
        receivedAt: '2026-07-18T11:10:00+08:00',
        feedbackDrivePath: '\\NAS-ART\\Feedback\\SKF_A_3D_B52\\F-018_20260718',
        summary: '客户要求调整行者机甲高模比例，确认后对受影响资产的后续阶段重排。',
        evidence: [
          evidence('EV-F018-mail', '客户反馈邮件', 'SKF_A_3D_B52 Highpoly review', '2026-07-18T11:10:00+08:00', 'client.review@silverkite.example'),
          evidence('EV-F018-path', '反馈盘路径', '\\NAS-ART\\Feedback\\SKF_A_3D_B52\\F-018_20260718', '2026-07-18T11:10:00+08:00'),
        ],
        items: [
          {
            ...feedback.items[0],
            id: feedbackItemId,
            batchId: ACCEPTANCE_SCENARIO.feedbackBatchId,
            assetId: affectedAssetId,
            stageId: `${affectedAssetId}/3D_HIGH`,
            title: '收窄高模护甲比例',
            originalText: '行者机甲的护甲比例请收窄，修改后低模、烘焙、贴图和 LOD 节点相应顺延。',
            scope: 'in-scope',
            status: 'Closed',
            ownerName: 'Lin',
            estimatedReworkDays: 2,
          },
        ],
      },
    ],
    revisions: [
      {
        id: 'REV-SKF_A_3D_B52-1',
        version: 1,
        projectCode,
        assetId: affectedAssetId,
        sourceFeedbackItemId: feedbackItemId,
        reason: 'client-feedback',
        note: '客户确认高模比例返修，行者机甲后续阶段顺延 2 个工作日；侦察无人机不受影响。',
        confirmedBy: 'Brandon',
        confirmedAt: '2026-07-19T16:00:00+08:00',
        changes: affected.stages.slice(2).map((stage) => ({
          stageId: stage.id,
          oldStart: stage.baselineStart,
          oldFinish: stage.baselineFinish,
          newStart: stage.currentStart,
          newFinish: stage.currentFinish,
          shiftedWorkdays: 2,
        })),
      },
    ],
    closeoutCases: [completedCloseout(closeout)],
    projectPaths: [
      { id: 'PATH-SKF-feedback', projectCode, kind: 'feedback', label: '反馈盘', path: '\\NAS-ART\\Feedback\\SKF_A_3D_B52', updatedAt: '2026-07-18T11:10:00+08:00', updatedBy: 'Brandon' },
      { id: 'PATH-SKF-final', projectCode, kind: 'final', label: '最终提交包', path: '\\NAS-ART\\Final\\SKF_A_3D_B52\\v03', updatedAt: '2026-07-25T10:00:00+08:00', updatedBy: 'Evan' },
      { id: 'PATH-SKF-archive', projectCode, kind: 'archive', label: '归档盘（IT 管辖）', path: '\\ARCHIVE\\2026\\SKF_A_3D_B52', updatedAt: '2026-07-29T16:20:00+08:00', updatedBy: 'Project Archive' },
    ],
    notificationDrafts: [
      {
        id: 'ND-SKF-billing',
        recipientRole: 'BD',
        recipientName: 'Liu',
        subject: '[出账通知] SKF_A_3D_B52 已完成归档',
        body: '客户确认、IT 备份与归档路径齐备，请按 CO-004 执行出账。',
        sourceKind: 'closeout',
        sourceId: 'CO-SKF-004',
        status: 'markedSent',
        markedSentAt: '2026-07-28T15:00:00+08:00',
        markedSentBy: 'Brandon',
        markedSentVia: '公司邮箱',
      },
    ],
    auditEvents: [
      { id: 'AE-SKF-001', at: '2026-07-03T09:20:00+08:00', actor: 'Brandon', action: '发送开工通知', targetKind: 'QuoteCase', targetId: ACCEPTANCE_SCENARIO.quoteCaseId },
      { id: 'AE-SKF-002', at: '2026-07-18T11:10:00+08:00', actor: 'Brandon', action: '确认客户反馈 F-018', targetKind: 'FeedbackBatch', targetId: ACCEPTANCE_SCENARIO.feedbackBatchId },
      { id: 'AE-SKF-003', at: '2026-07-19T16:00:00+08:00', actor: 'Brandon', action: '确认客户反馈重排', targetKind: 'ScheduleRevision', targetId: 'REV-SKF_A_3D_B52-1', reason: 'client-feedback' },
      { id: 'AE-SKF-004', at: '2026-07-29T16:20:00+08:00', actor: 'Project Archive', action: '归档项目', targetKind: 'CloseoutCase', targetId: 'CO-SKF-004' },
    ],
    changeRequests: [],
    insightDispositions: [],
  }
}
