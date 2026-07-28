import { describe, expect, it } from 'vitest'
import { createDemoState } from '../data/seed'
import { DEMO_TODAY } from './clock'
import {
  ReclassifyBlocked,
  confirmReplan,
  generateReplanDraft,
  revisionNotified,
  markNotificationSent,
  revokeRevision,
  unmarkNotificationSent,
} from './replan'

const AT = '2026-07-27T15:00:00+08:00'
const ITEM = 'F-017/ITEM-01'

function confirmed() {
  const state = createDemoState()
  const draft = generateReplanDraft(state, ITEM, DEMO_TODAY)
  const next = confirmReplan(state, { draft, note: '返修 2 个工作日', actor: 'Brandon', at: AT })
  const revision = next.revisions.find((item) => item.projectCode === 'P-3D-024')!
  return { before: state, state: next, revision }
}

describe('revokeRevision', () => {
  it('通知未发送时可以撤销，阶段日期回滚到修订前', () => {
    const { state, revision } = confirmed()
    const reverted = revokeRevision(state, revision.id, AT, 'Brandon')
    const low = reverted.projects[0].assets[0].stages.find((s) => s.id === 'MECH-01/3D_LOW')

    expect(low?.currentStart).toBe('2026-07-27')
    expect(low?.currentFinish).toBe('2026-07-29')
    expect(low?.revisionReason).toBeUndefined()
  })

  it('基准日期自始至终没被动过', () => {
    const { state, revision } = confirmed()
    const reverted = revokeRevision(state, revision.id, AT, 'Brandon')
    const low = reverted.projects[0].assets[0].stages.find((s) => s.id === 'MECH-01/3D_LOW')

    expect(low?.baselineStart).toBe('2026-07-27')
    expect(low?.baselineFinish).toBe('2026-07-29')
  })

  it('撤销是标记不是删除，版本号留在历史里', () => {
    const { state, revision } = confirmed()
    const reverted = revokeRevision(state, revision.id, AT, 'Brandon', '客户改口')

    const kept = reverted.revisions.find((item) => item.id === revision.id)
    expect(kept).toBeDefined()
    expect(kept?.version).toBe(1)
    expect(kept?.revokedAt).toBe(AT)
    expect(kept?.revokedBy).toBe('Brandon')
    expect(kept?.revokedReason).toBe('客户改口')
  })

  it('未发送的通知草稿一并作废', () => {
    const { state, revision } = confirmed()
    expect(state.notificationDrafts.filter((n) => n.sourceId === revision.id)).toHaveLength(2)

    const reverted = revokeRevision(state, revision.id, AT, 'Brandon')
    expect(reverted.notificationDrafts.filter((n) => n.sourceId === revision.id)).toHaveLength(0)
  })

  it('反馈项退回待分流，重排需求重新亮起', () => {
    const { state, revision } = confirmed()
    const reverted = revokeRevision(state, revision.id, AT, 'Brandon')
    const item = reverted.feedbackBatches[0].items.find((entry) => entry.id === ITEM)

    expect(item?.scope).toBe('unclassified')
    expect(item?.status).toBe('NeedsClassification')
    const high = reverted.projects[0].assets[0].stages.find((s) => s.id === 'MECH-01/3D_HIGH')
    expect(high?.flags).toContain('ScheduleRevisionRequired')
  })

  it('审计只增不减：确认与撤销都留痕', () => {
    const { state, revision } = confirmed()
    const reverted = revokeRevision(state, revision.id, AT, 'Brandon')

    expect(reverted.auditEvents.some((e) => e.action === '确认排期修订 v1')).toBe(true)
    const revoke = reverted.auditEvents.find((e) => e.action === '撤销排期修订 v1')
    expect(revoke?.reason).toContain('作废 2 封未发送通知草稿')
  })

  it('撤销后再次确认，版本号从 2 起，不复用 1', () => {
    const { state, revision } = confirmed()
    const reverted = revokeRevision(state, revision.id, AT, 'Brandon')

    const draft = generateReplanDraft(reverted, ITEM, DEMO_TODAY)
    const again = confirmReplan(reverted, { draft, note: '重来一次', actor: 'Brandon', at: AT })

    expect(again.revisions.filter((r) => r.projectCode === 'P-3D-024').map((r) => r.version)).toEqual([
      1, 2,
    ])
  })

  it('不能撤销两次', () => {
    const { state, revision } = confirmed()
    const reverted = revokeRevision(state, revision.id, AT, 'Brandon')
    expect(() => revokeRevision(reverted, revision.id, AT, 'Brandon')).toThrow(ReclassifyBlocked)
  })

  it('未受影响的资产在撤销过程中始终没被碰过', () => {
    const { before, state, revision } = confirmed()
    const reverted = revokeRevision(state, revision.id, AT, 'Brandon')

    expect(reverted.projects[0].assets[1]).toEqual(before.projects[0].assets[1])
    expect(reverted.projects[1]).toEqual(before.projects[1])
  })
})

describe('人工标记发出是不可逆的分界点', () => {
  it('标记前修订可撤销', () => {
    const { state, revision } = confirmed()
    expect(revisionNotified(state, revision.id)).toBe(false)
    expect(() => revokeRevision(state, revision.id, AT, 'Brandon')).not.toThrow()
  })

  it('标记为已发出后就不允许撤销——团队已经收到新排期了', () => {
    const { state, revision } = confirmed()
    const notification = state.notificationDrafts.find((entry) => entry.sourceId === revision.id)!
    const marked = markNotificationSent(state, notification.id, AT, 'Brandon')

    expect(revisionNotified(marked, revision.id)).toBe(true)
    expect(() => revokeRevision(marked, revision.id, AT, 'Brandon')).toThrow(ReclassifyBlocked)
  })

  it('标记记录的是人工声明，审计里写明工作台未执行发送', () => {
    const { state, revision } = confirmed()
    const notification = state.notificationDrafts.find((entry) => entry.sourceId === revision.id)!
    const marked = markNotificationSent(state, notification.id, AT, 'Brandon', '企业微信')

    const event = marked.auditEvents.at(-1)
    expect(event?.action).toBe('标记通知为已发出')
    expect(event?.after).toBe('markedSent')
    expect(event?.reason).toContain('工作台未执行发送')
    expect(event?.reason).toContain('企业微信')

    const saved = marked.notificationDrafts.find((entry) => entry.id === notification.id)
    expect(saved?.markedSentAt).toBe(AT)
    expect(saved?.markedSentBy).toBe('Brandon')
    expect(saved?.markedSentVia).toBe('企业微信')
  })

  it('标记错了可以撤回，撤回后修订重新可撤销', () => {
    const { state, revision } = confirmed()
    const notification = state.notificationDrafts.find((entry) => entry.sourceId === revision.id)!
    const marked = markNotificationSent(state, notification.id, AT, 'Brandon')
    const unmarked = unmarkNotificationSent(marked, notification.id, AT, 'Brandon')

    expect(revisionNotified(unmarked, revision.id)).toBe(false)
    expect(() => revokeRevision(unmarked, revision.id, AT, 'Brandon')).not.toThrow()
    expect(unmarked.auditEvents.at(-1)?.action).toBe('撤回已发出标记')
  })
})
