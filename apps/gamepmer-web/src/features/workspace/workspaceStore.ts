import type { Clock } from '../../domain/clock'
import { createDemoClock } from '../../domain/clock'
import type { DemoState } from '../../domain/model'
import { projectWorkItems, summarizeMetrics, type HomeMetrics, type WorkItem } from '../../domain/workItems'
import { LocalDemoRepository, type DemoRepository } from '../../data/LocalDemoRepository'

/**
 * 工作台 Store。
 *
 * 只保存「当前数据 + 用户在界面上的选择」，业务规则一律留在 domain 层。
 * 后续切片新增用例时应新建独立 Store 或用例函数，不要让这个文件长成全局巨型 Store。
 */

export interface WorkspaceState {
  demo: DemoState
  today: string
  selectedWorkItemId?: string
}

export interface WorkspaceStore {
  getState(): WorkspaceState
  subscribe(listener: () => void): () => void
  selectWorkItem(id: string): void
  resetDemo(): void
}

export function createWorkspaceStore(
  repository: DemoRepository = new LocalDemoRepository(),
  clock: Clock = createDemoClock(),
): WorkspaceStore {
  const initial = repository.load()
  let state: WorkspaceState = {
    demo: initial,
    today: clock.today(),
    selectedWorkItemId: projectWorkItems(initial, clock.today())[0]?.id,
  }

  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((listener) => listener())

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    selectWorkItem(id) {
      state = { ...state, selectedWorkItemId: id }
      emit()
    },
    resetDemo() {
      const demo = repository.reset()
      state = {
        demo,
        today: clock.today(),
        selectedWorkItemId: projectWorkItems(demo, clock.today())[0]?.id,
      }
      emit()
    },
  }
}

/** 首页需要的派生数据集中在这里算，组件只负责渲染。 */
export interface HomeView {
  metrics: HomeMetrics
  items: WorkItem[]
  selected?: WorkItem
}

export function selectHomeView(state: WorkspaceState): HomeView {
  const items = projectWorkItems(state.demo, state.today)
  return {
    metrics: summarizeMetrics(state.demo, state.today),
    items,
    selected: items.find((item) => item.id === state.selectedWorkItemId) ?? items[0],
  }
}
