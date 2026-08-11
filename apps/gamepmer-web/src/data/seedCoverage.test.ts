import { describe, expect, it } from 'vitest'
import { createDemoState } from './seed'
import { DEMO_TODAY } from '../domain/clock'
import { capacityMatrix, weekStartsFrom } from '../domain/capacity'
import { activeProjects } from '../domain/lookup'
import type { StageMainStatus, StagePlan } from '../domain/model'

/**
 * 种子数据对照设计文档 §11「Demo 种子数据」的覆盖门禁。
 *
 * 这组用例不测行为，测的是「首次打开有没有东西可看」。
 * 它存在的理由：§11 的清单是用户验收 Demo 时逐条对的，
 * 而种子数据最容易在重构里被顺手删薄——删薄了没有任何功能测试会红。
 *
 * 每条断言前面引的是设计文档原话，改断言前先回去看那一行还算不算数。
 */

const state = createDemoState()
const allStages: StagePlan[] = state.projects.flatMap((project) =>
  project.assets.flatMap((asset) => asset.stages),
)

describe('设计文档 §11：Demo 首次打开必须提供真实密度的虚构数据', () => {
  it('三个主路径项目都在，且各自的演示目的还成立', () => {
    const byCode = new Map(state.projects.map((project) => [project.code, project]))

    // §11 表格第一行：MECH-01 收到反馈 F-017；存在变更 CQ-004
    const main = byCode.get('NST_A_3D_B24')
    expect(main, '客户反馈主路径项目').toBeDefined()
    expect(main!.assets.some((asset) => asset.name.includes('主角机甲'))).toBe(true)
    expect(state.feedbackBatches.some((batch) => batch.id === 'F-017')).toBe(true)
    expect(state.changeRequests.some((request) => request.id === 'CQ-004')).toBe(true)

    // §11 表格第二行：2D 阶段与客户等待
    const twoD = byCode.get('HLC_B_2D_B18')
    expect(twoD, '2D 项目').toBeDefined()
    expect(twoD!.discipline).toBe('2D')
    expect(twoD!.status).toBe('AwaitingClient')

    // §11 表格第三行：多资产按计划制作，用于并行排期对照
    const parallel = byCode.get('NST_C_3D_B31')
    expect(parallel, '并行排期对照项目').toBeDefined()
    expect(parallel!.assets.length).toBeGreaterThanOrEqual(2)
  })

  it('六个阶段主状态一个不少——四件不同的事不许合并成一个完成状态', () => {
    const present = new Set(allStages.map((stage) => stage.status))
    const required: StageMainStatus[] = [
      'NotStarted',
      'InProduction',
      'HandedToPm',
      'SubmittedToClient',
      'AwaitingClient',
      'Approved',
    ]
    for (const status of required) {
      expect(present.has(status), `种子里没有 ${status} 的阶段，这条状态没法验收`).toBe(true)
    }
  })

  it('四个项目状态都有实例，归档项目也在（否则「在管项目数」永远不会被验证）', () => {
    const present = new Set(state.projects.map((project) => project.status))
    for (const status of ['InProduction', 'AwaitingClient', 'Closing', 'Archived'] as const) {
      expect(present.has(status), `种子里没有 ${status} 的项目`).toBe(true)
    }
    expect(activeProjects(state).length).toBeLessThan(state.projects.length)
  })

  it('§11：正常阶段、T-1 提醒、可能延期、客户等待、客户反馈和追加报价', () => {
    // 正常阶段
    expect(allStages.some((stage) => stage.status === 'InProduction' && stage.flags.length === 0)).toBe(
      true,
    )

    // T-1 提醒：至少有一个阶段的当前完成日就落在演示"今天"的次日
    const tomorrow = '2026-07-28'
    expect(DEMO_TODAY).toBe('2026-07-27')
    expect(
      allStages.some((stage) => stage.currentFinish === tomorrow && stage.status !== 'Approved'),
      'T-1 提醒需要一个明天到期且尚未验收的阶段',
    ).toBe(true)

    // 可能延期 / 返修 / 等待变更报价 / 需要重排，四个叠加标记都要有实例
    const flags = new Set(allStages.flatMap((stage) => stage.flags))
    for (const flag of ['PossibleDelay', 'Rework', 'WaitingChangeQuote', 'ScheduleRevisionRequired'] as const) {
      expect(flags.has(flag), `种子里没有带 ${flag} 标记的阶段`).toBe(true)
    }

    // 客户等待
    expect(allStages.some((stage) => stage.status === 'AwaitingClient')).toBe(true)

    // 客户反馈：反馈项的四种判定都要有实例，否则反馈中心三栏看板有一栏是空的
    const items = state.feedbackBatches.flatMap((batch) => batch.items)
    const scopes = new Set(items.map((item) => item.scope ?? 'unclassified'))
    for (const scope of ['unclassified', 'in-scope', 'out-of-scope', 'no-change'] as const) {
      expect(scopes.has(scope), `种子里没有判定为 ${scope} 的反馈项`).toBe(true)
    }

    // 追加报价
    expect(state.quoteCases.some((entry) => entry.kind === 'change')).toBe(true)
    expect(state.quoteCases.some((entry) => entry.kind === 'initial')).toBe(true)
  })

  it('§11：基准、当前、实际日期同时存在，且基准与当前确实分叉过', () => {
    expect(allStages.every((stage) => stage.baselineStart && stage.currentStart)).toBe(true)
    expect(allStages.some((stage) => stage.actualStart && stage.actualFinish)).toBe(true)
    expect(
      allStages.some((stage) => stage.currentStart !== stage.baselineStart),
      '没有任何阶段的当前计划偏离基准，就看不出「基准不可覆盖」这条规则',
    ).toBe(true)
    expect(allStages.some((stage) => stage.submittedToClientAt)).toBe(true)
    expect(allStages.some((stage) => stage.clientApprovedAt)).toBe(true)
  })

  it('§11：至少一个可解释的容量预警', () => {
    const calendar = state.calendars[0]
    const weeks = weekStartsFrom(DEMO_TODAY, 4)
    const rows = capacityMatrix(state, weeks, calendar)
    const overloaded = rows.flatMap((row) => row.weeks).filter((week) => week.overBy > 0)
    expect(overloaded.length, '没有任何一周超载，档期页的预警没有数据可演示').toBeGreaterThan(0)
    // 「可解释」= 超载那一周排得进具体阶段，而不是凭空一个红数字
    expect(rows.some((row) => row.weeks.some((week) => week.scheduled > 0))).toBe(true)
  })

  it('§11：团队完成邮件、客户反馈、文件路径、报价版本、客户确认和 IT 回执六类证据都在', () => {
    const channels = new Set(state.sourceRecords.map((record) => record.channel))
    const evidenceKinds = new Set(
      state.closeoutCases.flatMap((entry) =>
        entry.gates.flatMap((gate) => gate.evidence.map((item) => item.kind)),
      ),
    )
    expect(channels.has('email'), '缺少邮件来源的候选证据').toBe(true)
    expect(evidenceKinds.has('email'), '结项门禁缺少正式邮件证据').toBe(true)
    expect(evidenceKinds.has('path'), '结项门禁缺少盘位路径证据').toBe(true)
    expect(state.projectPaths.length, '缺少盘位路径登记').toBeGreaterThan(0)
    expect(state.quoteVersions.length, '缺少报价版本').toBeGreaterThan(0)
    expect(state.feedbackBatches.length, '缺少客户反馈').toBeGreaterThan(0)
    expect(state.notificationDrafts.length, '缺少通知草稿').toBeGreaterThan(0)

    // IT 回执与客户最终确认属于结项门禁，必须有一个走完全程的归档案件做对照。
    // 第一道门禁 assets-approved 由阶段验收实时推导，数据里没有 completedAt，
    // 所以这里只断言四道需要人工登记证据的门禁，它的真实来源在下一条用例里查。
    const archived = state.closeoutCases.filter((entry) => entry.status === 'Archived')
    expect(archived.length, '没有已归档的结项案件，结项页看不到「走完是什么样」').toBeGreaterThan(0)
    for (const entry of archived) {
      for (const gate of entry.gates.filter((item) => item.code !== 'assets-approved')) {
        expect(gate.completedAt, `${entry.id} 已归档，但「${gate.title}」没有完成时间`).toBeTruthy()
        expect(gate.evidence.length, `${entry.id} 的「${gate.title}」没有留下证据`).toBeGreaterThan(0)
      }
    }
  })

  it('归档项目必须有对应的结项案件，且它的资产确实全部验收过', () => {
    const archivedProjects = state.projects.filter((entry) => entry.status === 'Archived')
    expect(archivedProjects.length).toBeGreaterThan(0)

    for (const project of archivedProjects) {
      expect(
        state.closeoutCases.some(
          (entry) => entry.projectCode === project.code && entry.status === 'Archived',
        ),
        `${project.code} 已归档，但结项中心里没有它的归档案件`,
      ).toBe(true)

      // 第一道门禁不能手工打勾，它的唯一来源是每个阶段都已验收
      const stages = project.assets.flatMap((asset) => asset.stages)
      expect(stages.length, `${project.code} 没有任何阶段`).toBeGreaterThan(0)
      expect(
        stages.every((stage) => stage.status === 'Approved'),
        `${project.code} 已归档，却还有阶段没走到客户验收`,
      ).toBe(true)
    }
  })
})
