import type { Asset, DemoState, Project, Stage, StageCode } from '../domain/model'

const stage = (
  code: StageCode,
  name: string,
  start: string,
  finish: string,
  status: Stage['status'] = 'normal',
  clientApprovalDate?: string,
): Stage => ({ code, name, baselineStart: start, baselineFinish: finish, currentStart: start, currentFinish: finish, status, clientApprovalDate })

const mech01: Asset = {
  id: 'MECH-01', name: '机甲主角', production: '3D', stages: [
    stage('3D_MID', '中模', '2026-07-13', '2026-07-14', 'complete', '2026-07-14'),
    stage('3D_HIGH', '高模', '2026-07-15', '2026-07-17', 'rework'),
    stage('3D_LOW', '低模', '2026-07-20', '2026-07-21'),
    stage('3D_BAKE', '烘焙', '2026-07-22', '2026-07-22'),
    stage('3D_TEXTURE', '贴图', '2026-07-23', '2026-07-24'),
    stage('3D_LOD', 'LOD', '2026-07-27', '2026-07-27'),
  ],
}

const projects: Project[] = [
  { id: 'project-3d-024', code: 'P-3D-024', name: '机甲单位', client: '演示客户 A', assets: [mech01, { id: 'MECH-02', name: '轻型载具', production: '3D', stages: [stage('3D_MID', '中模', '2026-07-20', '2026-07-21')] }] },
  { id: 'project-2d-018', code: 'P-2D-018', name: '角色概念', client: '演示客户 B', assets: [{ id: 'CHAR-01', name: '角色立绘', production: '2D', stages: [stage('2D_SKETCH', '草图', '2026-07-15', '2026-07-16', 'complete'), stage('2D_DETAIL_50', '细化 50%', '2026-07-17', '2026-07-20'), stage('2D_FINAL', '完成稿', '2026-07-21', '2026-07-23')] }] },
  { id: 'project-3d-031', code: 'P-3D-031', name: '场景道具', client: '演示客户 C', assets: [{ id: 'PROP-01', name: '补给箱', production: '3D', stages: [stage('3D_MID', '中模', '2026-07-27', '2026-07-28')] }, { id: 'PROP-02', name: '灯柱', production: '3D', stages: [stage('3D_MID', '中模', '2026-07-29', '2026-07-30')] }] },
]

export function createDemoState(): DemoState {
  return {
    schemaVersion: 1,
    projects: structuredClone(projects),
    feedbackBatches: [{ id: 'F-017', projectCode: 'P-3D-024', assetId: 'MECH-01', affectedStageCode: '3D_HIGH', pastedText: '高模肩甲比例需要调整，预计返修 2 个工作日。', addedWorkdays: 2, receivedAt: '2026-07-17' }],
    revisions: [],
    notificationDrafts: [],
  }
}
