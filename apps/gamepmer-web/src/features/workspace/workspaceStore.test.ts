import { describe, expect, it } from 'vitest'

import { createAcceptanceScenarioState } from '../../data/acceptanceScenario'
import { LocalDemoRepository, type StorageLike } from '../../data/LocalDemoRepository'
import { createWorkspaceStore } from './workspaceStore'

function memoryStorage(): StorageLike {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  }
}

describe('WorkspaceStore 数据整体替换', () => {
  it('载入完整验收场景后重建选择，并在重新打开时仍可读取', () => {
    const repository = new LocalDemoRepository(memoryStorage())
    const store = createWorkspaceStore(repository)
    store.selectProject('NST_A_3D_B24')

    store.loadAcceptanceScenario()

    expect(store.getState().selectedProjectCode).toBe('SKF_A_3D_B52')
    expect(createWorkspaceStore(repository).getState().demo.projects.map((item) => item.code)).toEqual([
      'SKF_A_3D_B52',
    ])
  })

  it('replaceDemo 整体替换而不是和旧项目合并', () => {
    const store = createWorkspaceStore(new LocalDemoRepository(memoryStorage()))

    store.replaceDemo(createAcceptanceScenarioState())

    expect(store.getState().demo.projects.map((item) => item.code)).toEqual(['SKF_A_3D_B52'])
    expect(store.getState().demo.projects.some((item) => item.code === 'NST_A_3D_B24')).toBe(false)
  })
})
