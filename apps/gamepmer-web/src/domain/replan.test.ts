import { createDemoState } from '../data/seed'
import { confirmDraft, discardDraft, generateReplanDraft, moveDraftStage } from './replan'
import type { DemoState, StageCode } from './model'

function findStage(state: DemoState, assetId: string, stageCode: StageCode) {
  return state.projects.flatMap((project) => project.assets).find((asset) => asset.id === assetId)?.stages.find((stage) => stage.code === stageCode)
}

describe('安全重排草案', () => {
  it('生成工作日草案但不改变正式当前排期', () => {
    const state = createDemoState()
    const before = findStage(state, 'MECH-01', '3D_LOW')?.currentStart
    const draft = generateReplanDraft(state, 'F-017')

    expect(draft.changes.find((change) => change.stageCode === '3D_LOW')?.newStart).toBe('2026-07-22')
    expect(findStage(state, 'MECH-01', '3D_LOW')?.currentStart).toBe(before)
  })

  it('只允许在草案中按完整工作日调整一个节点', () => {
    const draft = generateReplanDraft(createDemoState(), 'F-017')
    const moved = moveDraftStage(draft, '3D_LOW', 1)

    expect(moved.changes.find((change) => change.stageCode === '3D_LOW')?.newStart).toBe('2026-07-23')
    expect(draft.changes.find((change) => change.stageCode === '3D_LOW')?.newStart).toBe('2026-07-22')
  })

  it('只在确认后写入当前日期、修订记录和通知草稿', () => {
    const state = createDemoState()
    const draft = generateReplanDraft(state, 'F-017')
    const confirmed = confirmDraft(state, draft, '客户反馈延期', '肩甲比例返修')

    expect(findStage(confirmed, 'MECH-01', '3D_LOW')?.currentStart).toBe('2026-07-22')
    expect(confirmed.revisions).toHaveLength(1)
    expect(confirmed.notificationDrafts.map((draft) => draft.recipientRole)).toEqual(['组长', '艺术总监'])
    expect(findStage(state, 'MECH-01', '3D_LOW')?.currentStart).toBe('2026-07-20')
  })

  it('丢弃草案不会写入任何内容', () => {
    expect(discardDraft(generateReplanDraft(createDemoState(), 'F-017'))).toBeUndefined()
  })
})
