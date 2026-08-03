import { describe, expect, it } from 'vitest'
import { createDemoState } from '../data/seed'
import { DEMO_TODAY } from './clock'
import type { DemoState } from './model'
import { classifyInScope, classifyNoChange, confirmReplan, generateReplanDraft } from './replan'
import { advanceStage } from './stageFlow'
import { waitingBoard } from './waitingBoard'

const AT = '2026-07-27T14:00:00+08:00'
const ITEM = 'F-017/ITEM-01'
const STAGE = 'MECH-01/3D_HIGH'

/**
 * 走到「这个阶段上只剩 ITEM-01 在返修」这一步。
 *
 * 同阶段还有没判的反馈时，看板本来就该报待分流——那是真的还在等我。
 * 要观察后面几步，得先把它们判掉。
 */
function toRework(): DemoState {
  let state: DemoState = createDemoState()
  for (const item of state.feedbackBatches.flatMap((batch) => batch.items)) {
    if (item.stageId !== STAGE || item.status !== 'NeedsClassification' || item.id === ITEM) continue
    state = classifyNoChange(state, item.id, DEMO_TODAY, 'Brandon')
  }
  state = classifyInScope(state, ITEM, DEMO_TODAY, 'Brandon')
  const draft = generateReplanDraft(state, ITEM, DEMO_TODAY)
  return confirmReplan(state, { draft, note: '客户要求缩小肩甲', actor: 'Brandon', at: AT })
}

function cardFor(board: ReturnType<typeof waitingBoard>, stageId: string) {
  return [...board.me, ...board.team, ...board.client].find((card) => card.stageId === stageId)
}

describe('在等谁看板', () => {
  it('三栏各自只装该等的人', () => {
    const board = waitingBoard(createDemoState(), DEMO_TODAY)

    expect(board.me.every((card) => card.waitingOn === 'me')).toBe(true)
    expect(board.team.every((card) => card.waitingOn === 'team')).toBe(true)
    expect(board.client.every((card) => card.waitingOn === 'client')).toBe(true)
    expect(board.me.length + board.team.length + board.client.length).toBeGreaterThan(0)
  })

  it('未开始与已验收的阶段不占看板——一个还没进循环，一个已经离场', () => {
    const state = createDemoState()
    const board = waitingBoard(state, DEMO_TODAY)
    const onBoard = new Set([...board.me, ...board.team, ...board.client].map((c) => c.stageId))

    const stages = state.projects.flatMap((p) => p.assets).flatMap((a) => a.stages)
    for (const stage of stages) {
      if (stage.status === 'NotStarted' || stage.status === 'Approved') {
        expect(onBoard.has(stage.id)).toBe(false)
      }
    }
    expect(board.approved).toBe(stages.filter((s) => s.status === 'Approved').length)
  })

  it('客户反馈没判范围时归「等我」，且排在最前', () => {
    const board = waitingBoard(createDemoState(), DEMO_TODAY)
    const card = cardFor(board, STAGE)

    expect(card?.waitingOn).toBe('me')
    expect(card?.kind).toBe('triage')
    expect(board.me[0].kind).toBe('triage')
  })

  it('判完范围、排期确认后，通知还没发出仍然算「等我」', () => {
    const state = toRework()

    const card = cardFor(waitingBoard(state, DEMO_TODAY), STAGE)
    // 通知压在手里没发，团队根本不知道要返修——这时候算「等团队」是骗自己
    expect(card?.waitingOn).toBe('me')
    expect(card?.kind).toBe('send-rework')
  })

  it('通知标记发出后才轮到团队', () => {
    let state = toRework()
    state = {
      ...state,
      notificationDrafts: state.notificationDrafts.map((item) =>
        item.sourceKind === 'schedule-revision' ? { ...item, status: 'markedSent' as const } : item,
      ),
    }

    const card = cardFor(waitingBoard(state, DEMO_TODAY), STAGE)
    expect(card?.waitingOn).toBe('team')
    expect(card?.headline).toContain('返修')
  })

  it('团队交回 PM 后是「等我」转交客户，提交后才变成「等客户」', () => {
    let state = toRework()

    state = advanceStage(state, STAGE, 'hand-to-pm', { actor: 'Chen', now: '2026-07-29T18:00:00+08:00' })
    expect(cardFor(waitingBoard(state, '2026-07-29'), STAGE)?.kind).toBe('hand-to-client')

    state = advanceStage(state, STAGE, 'submit-to-client', { actor: 'Brandon', now: '2026-07-30T10:00:00+08:00' })
    const card = cardFor(waitingBoard(state, '2026-07-30'), STAGE)
    expect(card?.waitingOn).toBe('client')
    expect(card?.headline).toContain('等客户验收')
  })

  it('客户验收通过就离开看板，全部验收后指向结项中心', () => {
    let state: DemoState = createDemoState()
    const target = state.projects[0]

    for (const asset of target.assets) {
      for (const stage of asset.stages) {
        stage.status = 'Approved'
      }
    }
    // 反馈项还开着不影响——阶段已验收就说明客户认过了
    const board = waitingBoard(state, DEMO_TODAY)

    expect(board.me.some((card) => card.projectCode === target.code)).toBe(false)
    expect(board.team.some((card) => card.projectCode === target.code)).toBe(false)
    expect(board.client.some((card) => card.projectCode === target.code)).toBe(false)
    expect(board.readyForCloseout).toContain(target.code)
  })

  it('客户久未回话只陈述事实，并写明不计团队延期', () => {
    const state = createDemoState()
    const board = waitingBoard(state, '2026-08-10')
    const silent = board.client.filter((card) => card.warnings.length > 0)

    expect(silent.length).toBeGreaterThan(0)
    expect(silent[0].warnings[0]).toContain('不计团队延期')
  })

  it('已等待天数按工作日算，周末不算谁拖延', () => {
    const state = createDemoState()
    // 07-24 提交客户，到 07-27（周一）只过了 1 个工作日，不是 3 天
    const card = waitingBoard(state, '2026-07-27').client.find(
      (entry) => entry.detail.includes('2026-07-24'),
    )
    expect(card?.waitedWorkdays).toBe(1)
  })
})
