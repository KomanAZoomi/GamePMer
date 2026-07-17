import { LocalDemoRepository, type StorageLike } from '../../data/LocalDemoRepository'
import { createWorkspaceStore } from './workspaceStore'

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

describe('工作台状态', () => {
  it('取消草案不会保存任何正式排期', () => {
    const store = createWorkspaceStore(new LocalDemoRepository(new MemoryStorage()))
    store.startFeedback('F-017')
    store.cancelDraft()
    expect(store.getState().draft).toBeUndefined()
    expect(store.getState().demo.revisions).toHaveLength(0)
  })

  it('确认后会由仓库恢复修订记录', () => {
    const storage = new MemoryStorage()
    const store = createWorkspaceStore(new LocalDemoRepository(storage))
    store.startFeedback('F-017')
    store.confirmDraft('客户反馈延期', '肩甲比例返修')
    const restored = createWorkspaceStore(new LocalDemoRepository(storage)).getState()
    expect(restored.demo.revisions).toHaveLength(1)
  })
})
