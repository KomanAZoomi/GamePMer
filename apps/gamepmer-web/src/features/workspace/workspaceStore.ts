import type { Clock } from '../../domain/clock'
import { createDemoClock } from '../../domain/clock'
import type { AxisScale } from '../../domain/gantt'
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
  selectedProjectCode: string
  selectedStageId?: string
  axisScale: AxisScale
}

export interface WorkspaceStore {
  getState(): WorkspaceState
  subscribe(listener: () => void): () => void
  selectWorkItem(id: string): void
  selectProject(code: string): void
  selectStage(stageId: string): void
  setAxisScale(scale: AxisScale): void
  resetDemo(): void
}

const DEFAULT_PROJECT = 'P-3D-024'

function initialState(demo: DemoState, today: string): WorkspaceState {
  const items = projectWorkItems(demo, today)
  const first = items[0]
  return {
    demo,
    today,
    selectedWorkItemId: first?.id,
    selectedProjectCode: first?.projectCode ?? DEFAULT_PROJECT,
    selectedStageId: first?.stageId,
    axisScale: 'day',
  }
}

export function createWorkspaceStore(
  repository: DemoRepository = new LocalDemoRepository(),
  clock: Clock = createDemoClock(),
): WorkspaceStore {
  let state = initialState(repository.load(), clock.today())

  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((listener) => listener())

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    selectWorkItem(id) {
      const item = projectWorkItems(state.demo, state.today).find((entry) => entry.id === id)
      state = {
        ...state,
        selectedWorkItemId: id,
        // 选中待办同时把甘特定位到它所属的项目和阶段，避免两处上下文脱节
        selectedProjectCode: item?.projectCode ?? state.selectedProjectCode,
        selectedStageId: item?.stageId ?? state.selectedStageId,
      }
      emit()
    },
    selectProject(code) {
      if (code === state.selectedProjectCode) return
      state = { ...state, selectedProjectCode: code, selectedStageId: undefined }
      emit()
    },
    selectStage(stageId) {
      state = { ...state, selectedStageId: stageId }
      emit()
    },
    setAxisScale(scale) {
      state = { ...state, axisScale: scale }
      emit()
    },
    resetDemo() {
      state = initialState(repository.reset(), clock.today())
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
