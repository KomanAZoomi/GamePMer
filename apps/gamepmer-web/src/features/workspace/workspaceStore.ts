import type { DemoState, ScheduleDraft, StageCode } from '../../domain/model'
import { confirmDraft, discardDraft, generateReplanDraft, moveDraftStage } from '../../domain/replan'
import { LocalDemoRepository } from '../../data/LocalDemoRepository'

export interface WorkspaceState {
  demo: DemoState
  selectedProjectCode: string
  selectedAssetId: string
  draft?: ScheduleDraft
}

export interface WorkspaceStore {
  getState(): WorkspaceState
  subscribe(listener: () => void): () => void
  selectAsset(projectCode: string, assetId: string): void
  startFeedback(feedbackId: string): void
  moveDraft(stageCode: StageCode, deltaWorkdays: number): void
  cancelDraft(): void
  confirmDraft(reason: string, note: string): void
  resetDemo(): void
}

export function createWorkspaceStore(repository = new LocalDemoRepository()): WorkspaceStore {
  let state: WorkspaceState = { demo: repository.load(), selectedProjectCode: 'P-3D-024', selectedAssetId: 'MECH-01' }
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((listener) => listener())

  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    selectAsset(projectCode, assetId) { state = { ...state, selectedProjectCode: projectCode, selectedAssetId: assetId }; emit() },
    startFeedback(feedbackId) { state = { ...state, draft: generateReplanDraft(state.demo, feedbackId) }; emit() },
    moveDraft(stageCode, deltaWorkdays) { if (!state.draft) return; state = { ...state, draft: moveDraftStage(state.draft, stageCode, deltaWorkdays) }; emit() },
    cancelDraft() { if (!state.draft) return; state = { ...state, draft: discardDraft(state.draft) }; emit() },
    confirmDraft(reason, note) {
      if (!state.draft) return
      const demo = confirmDraft(state.demo, state.draft, reason, note)
      repository.save(demo)
      state = { ...state, demo, draft: undefined }
      emit()
    },
    resetDemo() { state = { demo: repository.reset(), selectedProjectCode: 'P-3D-024', selectedAssetId: 'MECH-01' }; emit() },
  }
}
