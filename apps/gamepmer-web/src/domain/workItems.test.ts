import { describe, expect, it } from 'vitest'
import { createDemoState } from '../data/seed'
import { DEMO_TODAY } from './clock'
import { projectWorkItems, summarizeMetrics } from './workItems'

const state = createDemoState()
const items = projectWorkItems(state, DEMO_TODAY)

describe('projectWorkItems', () => {
  it('每一条待办都能追溯到项目与来源对象', () => {
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(item.projectCode).toBeTruthy()
      expect(item.sourceId).toBeTruthy()
      const project = state.projects.find((p) => p.code === item.projectCode)
      expect(project, `孤立任务：${item.id}`).toBeDefined()
    }
  })

  it('待分流的客户反馈项逐条进入需求评审', () => {
    const feedbackItems = items.filter((item) => item.sourceKind === 'feedback')
    expect(feedbackItems).toHaveLength(3)
    expect(feedbackItems.every((item) => item.group === '需求评审')).toBe(true)
    expect(feedbackItems.every((item) => item.priority === 'high')).toBe(true)
    expect(feedbackItems.map((item) => item.sourceId)).toContain('F-017/ITEM-01')
  })

  it('可能延期的阶段生成高优先级待办，且措辞不判定为已延期', () => {
    const item = items.find((entry) => entry.sourceId === 'MECH-01/3D_LOW')
    expect(item).toBeDefined()
    expect(item?.priority).toBe('high')
    expect(item?.reason).toContain('可能延期')
    expect(item?.reason).not.toContain('已延期')
  })

  it('明日到期且未收到完成邮件的阶段生成 T-1 提醒', () => {
    const item = items.find((entry) => entry.sourceId === 'PROP-01/3D_MID')
    expect(item?.reason).toContain('明日到期')
    expect(item?.priority).toBe('high')
  })

  it('等待客户的阶段生成跟进待办，并归因为客户侧', () => {
    const item = items.find((entry) => entry.sourceId === 'CHAR-08/2D_DETAIL_50')
    expect(item?.reason).toContain('等待客户')
    expect(item?.group).toBe('需求评审')
  })

  it('一个阶段最多只产生一条待办', () => {
    const stageItems = items.filter((item) => item.sourceKind === 'stage')
    const ids = stageItems.map((item) => item.sourceId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('全部验收且处于结项中的项目进入结项与备份', () => {
    const item = items.find((entry) => entry.group === '结项与备份')
    expect(item?.projectCode).toBe('P-3D-011')
    expect(item?.reason).toContain('最终包')
  })

  it('已验收的阶段不再产生待办', () => {
    expect(items.some((item) => item.sourceId === 'MECH-01/3D_MID')).toBe(false)
  })
})

describe('summarizeMetrics', () => {
  const metrics = summarizeMetrics(state, DEMO_TODAY)

  it('今日待办等于投影出的待办总数', () => {
    expect(metrics.todo).toBe(items.length)
  })

  it('进行中只统计已实际开工、尚未交付 PM 的阶段', () => {
    expect(metrics.inProduction).toBe(3)
  })

  it('已完成只统计客户已验收的阶段', () => {
    expect(metrics.approved).toBe(8)
  })

  it('可能延期与已逾期分开统计', () => {
    expect(metrics.possibleDelay).toBe(1)
    expect(metrics).toHaveProperty('overdue')
  })
})
