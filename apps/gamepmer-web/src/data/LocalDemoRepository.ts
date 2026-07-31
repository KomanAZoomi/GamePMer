import { DEMO_SCHEMA_VERSION } from '../domain/model'
import type { DemoState } from '../domain/model'
import { createBlankState, createDemoState } from './seed'

/**
 * Repository 是 UI 与存储之间的唯一边界。
 *
 * UI 和用例层只依赖这个接口，不允许直接读写 localStorage——正式内网版会换成调用内网 API 的实现。
 * Demo 阶段接口保持同步；换成 API 实现时需要改为异步并补加载态，这是已知的迁移成本。
 */
export interface DemoRepository {
  load(): DemoState
  save(state: DemoState): void
  reset(): DemoState
  /** 清空业务数据，保留组织配置。用于把演示数据换成自己的真实业务。 */
  clear(): DemoState
}

export const DEMO_STORAGE_KEY = `gamepmer.web-demo.v${DEMO_SCHEMA_VERSION}`

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const memoryStorage = (): StorageLike => {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

const REQUIRED_COLLECTIONS = [
  'calendars',
  'productionGroups',
  'projects',
  'sourceRecords',
  'candidates',
  'people',
  'quoteCases',
  'quoteVersions',
  'closeoutCases',
  'projectPaths',
  'feedbackBatches',
  'revisions',
  'notificationDrafts',
  'auditEvents',
  'changeRequests',
  'insightDispositions',
] as const

export class LocalDemoRepository implements DemoRepository {
  private readonly storage: StorageLike

  constructor(storage?: StorageLike) {
    this.storage =
      storage ??
      (typeof window !== 'undefined' && window.localStorage ? window.localStorage : memoryStorage())
  }

  load(): DemoState {
    const raw = this.storage.getItem(DEMO_STORAGE_KEY)
    if (!raw) return createDemoState()
    try {
      const candidate: unknown = JSON.parse(raw)
      // 结构不合法时回落到种子数据，而不是把损坏的数据喂给页面
      return isDemoState(candidate) ? candidate : createDemoState()
    } catch {
      return createDemoState()
    }
  }

  save(state: DemoState): void {
    this.storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state))
  }

  reset(): DemoState {
    this.storage.removeItem(DEMO_STORAGE_KEY)
    return createDemoState()
  }

  clear(): DemoState {
    const blank = createBlankState()
    // 空状态必须落盘：不落盘的话刷新一次又回到示例数据，等于没清
    this.save(blank)
    return blank
  }
}

/** 只认版本号是不够的——旧版本或被手工改坏的数据同样会让页面崩在渲染中途。 */
export function isDemoState(value: unknown): value is DemoState {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  if (candidate.schemaVersion !== DEMO_SCHEMA_VERSION) return false
  return REQUIRED_COLLECTIONS.every((key) => Array.isArray(candidate[key]))
}
