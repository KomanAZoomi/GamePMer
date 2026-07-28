import type { Clock } from '../../domain/clock'
import { createDemoClock } from '../../domain/clock'
import type { AxisScale } from '../../domain/gantt'
import type { StageRow } from '../../domain/conflicts'
import type { DemoState, RevisionReason, ScheduleRevisionDraft } from '../../domain/model'
import { confirmScheduleEntry as confirmEntry } from '../../domain/scheduleEntry'
import {
  classifyInScope,
  classifyOutOfScope,
  confirmReplan,
  generateReplanDraft,
  moveDraftStage,
  reclassifyFeedback,
} from '../../domain/replan'
import { EMPTY_CALENDAR } from '../../domain/workCalendar'
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
  selectedFeedbackItemId?: string
  /** 排期草案只活在界面状态里，永不落盘——草案不污染正式数据 */
  draft?: ScheduleRevisionDraft
}

export interface WorkspaceStore {
  getState(): WorkspaceState
  subscribe(listener: () => void): () => void
  selectWorkItem(id: string): void
  selectProject(code: string): void
  selectStage(stageId: string): void
  setAxisScale(scale: AxisScale): void
  confirmScheduleEntry(
    projectCode: string,
    assetId: string,
    rows: StageRow[],
    reason: RevisionReason,
    note: string,
  ): void
  selectFeedbackItem(itemId: string): void
  classifyFeedback(itemId: string, scope: 'in-scope' | 'out-of-scope'): void
  reclassifyFeedback(itemId: string): void
  startReplan(itemId: string): void
  moveDraft(stageId: string, deltaWorkdays: number): void
  cancelDraft(): void
  confirmDraft(note: string): void
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
    confirmScheduleEntry(projectCode, assetId, rows, reason, note) {
      // 领域层在有阻断时抛错且不产生副作用，这里让它冒泡——静默吞掉会让界面显示虚假的成功
      const demo = confirmEntry(state.demo, {
        projectCode,
        assetId,
        rows,
        reason,
        note,
        actor: 'Brandon',
        at: clock.now(),
      })
      if (demo === state.demo) return
      repository.save(demo)
      state = { ...state, demo }
      emit()
    },
    selectFeedbackItem(itemId) {
      state = { ...state, selectedFeedbackItemId: itemId }
      emit()
    },
    classifyFeedback(itemId, scope) {
      const demo =
        scope === 'in-scope'
          ? classifyInScope(state.demo, itemId, clock.now(), 'Brandon')
          : classifyOutOfScope(state.demo, itemId, clock.now(), 'Brandon')
      repository.save(demo)
      state = { ...state, demo, selectedFeedbackItemId: itemId }
      emit()
    },
    reclassifyFeedback(itemId) {
      const demo = reclassifyFeedback(state.demo, itemId, clock.now(), 'Brandon')
      repository.save(demo)
      // 撤销判定时连带丢掉基于它生成的草案
      const draft = state.draft?.sourceFeedbackItemId === itemId ? undefined : state.draft
      state = { ...state, demo, draft, selectedFeedbackItemId: itemId }
      emit()
    },
    startReplan(itemId) {
      // 生成草案不写任何正式数据，因此不落盘
      state = {
        ...state,
        selectedFeedbackItemId: itemId,
        draft: generateReplanDraft(state.demo, itemId, state.today),
      }
      emit()
    },
    moveDraft(stageId, deltaWorkdays) {
      if (!state.draft) return
      const calendar = state.demo.calendars[0] ?? EMPTY_CALENDAR
      state = { ...state, draft: moveDraftStage(state.draft, stageId, deltaWorkdays, calendar) }
      emit()
    },
    cancelDraft() {
      // 丢掉草案就是全部撤销：正式计划从来没被碰过
      state = { ...state, draft: undefined }
      emit()
    },
    confirmDraft(note) {
      if (!state.draft) return
      const demo = confirmReplan(state.demo, {
        draft: state.draft,
        note,
        actor: 'Brandon',
        at: clock.now(),
      })
      repository.save(demo)
      state = { ...state, demo, draft: undefined }
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
