import type { DemoState } from '../domain/model'
import { createDemoState } from './seed'

export const DEMO_STORAGE_KEY = 'gamepmer.web-demo.v1'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const fallbackStorage: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

export class LocalDemoRepository {
  private readonly storage: StorageLike

  constructor(storage?: StorageLike) {
    this.storage = storage ?? (typeof window !== 'undefined' && window.localStorage ? window.localStorage : fallbackStorage)
  }

  load(): DemoState {
    const raw = this.storage.getItem(DEMO_STORAGE_KEY)
    if (!raw) return createDemoState()
    try {
      const candidate: unknown = JSON.parse(raw)
      if (!this.isState(candidate)) return createDemoState()
      return candidate
    } catch {
      return createDemoState()
    }
  }

  save(state: DemoState): void { this.storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state)) }

  reset(): DemoState { this.storage.removeItem(DEMO_STORAGE_KEY); return createDemoState() }

  private isState(value: unknown): value is DemoState {
    return typeof value === 'object' && value !== null && (value as { schemaVersion?: unknown }).schemaVersion === 1
  }
}
