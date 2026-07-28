import { describe, expect, it } from 'vitest'
import { DEMO_SCHEMA_VERSION } from '../domain/model'
import { DEMO_STORAGE_KEY, LocalDemoRepository, isDemoState, type StorageLike } from './LocalDemoRepository'
import { createDemoState } from './seed'

function fakeStorage(seed: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

describe('LocalDemoRepository', () => {
  it('首次加载返回种子数据，页面不会是空白', () => {
    const state = new LocalDemoRepository(fakeStorage()).load()
    expect(state.projects.length).toBeGreaterThanOrEqual(3)
    // F-017 待处理 + F-016 历史批次（供智能分析有返修与归因可算）
    expect(state.feedbackBatches.length).toBeGreaterThanOrEqual(2)
  })

  it('保存后能读回同一份数据', () => {
    const storage = fakeStorage()
    const repository = new LocalDemoRepository(storage)
    const state = createDemoState()
    state.projects[0].name = '改过的名字'
    repository.save(state)
    expect(repository.load().projects[0].name).toBe('改过的名字')
  })

  it('重置回到种子初始状态', () => {
    const storage = fakeStorage()
    const repository = new LocalDemoRepository(storage)
    const state = createDemoState()
    state.projects[0].name = '改过的名字'
    repository.save(state)
    expect(repository.reset().projects[0].name).toBe('蒸汽守卫角色资产包')
    expect(storage.getItem(DEMO_STORAGE_KEY)).toBeNull()
  })

  it('数据损坏时回落到种子数据而不是抛错', () => {
    const repository = new LocalDemoRepository(fakeStorage({ [DEMO_STORAGE_KEY]: '{ 不是 JSON' }))
    expect(repository.load().projects.length).toBeGreaterThan(0)
  })
})

describe('isDemoState', () => {
  it('接受完整的状态', () => {
    expect(isDemoState(createDemoState())).toBe(true)
  })

  it('拒绝版本不符的数据', () => {
    expect(isDemoState({ ...createDemoState(), schemaVersion: 1 })).toBe(false)
  })

  it('版本号对但集合缺失时同样拒绝', () => {
    expect(isDemoState({ schemaVersion: DEMO_SCHEMA_VERSION, projects: [] })).toBe(false)
  })

  it('集合字段类型不对时拒绝', () => {
    expect(isDemoState({ ...createDemoState(), projects: '不是数组' })).toBe(false)
  })
})
