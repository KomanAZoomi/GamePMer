import { DEMO_SCHEMA_VERSION, type DemoState } from '../domain/model'
import { isDemoState } from './LocalDemoRepository'

export class DemoBackupError extends Error {}

export interface DemoBackupPackage {
  format: 'gamepmer-demo-backup'
  schemaVersion: number
  exportedAt: string
  state: DemoState
}

export function exportDemoBackup(state: DemoState, exportedAt: string): DemoBackupPackage {
  return {
    format: 'gamepmer-demo-backup',
    schemaVersion: DEMO_SCHEMA_VERSION,
    exportedAt,
    state: structuredClone(state),
  }
}

export function serializeDemoBackup(state: DemoState, exportedAt: string): string {
  return JSON.stringify(exportDemoBackup(state, exportedAt))
}

export function importDemoBackup(raw: string): DemoState {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new DemoBackupError('文件不是有效的 JSON 备份包。')
  }

  if (typeof value !== 'object' || value === null) {
    throw new DemoBackupError('不是 GamePMer 备份文件。')
  }
  const backup = value as Partial<DemoBackupPackage>
  if (backup.format !== 'gamepmer-demo-backup') {
    throw new DemoBackupError('不是 GamePMer 备份文件。')
  }
  if (backup.schemaVersion !== DEMO_SCHEMA_VERSION) {
    throw new DemoBackupError('备份文件版本与当前 Demo 不兼容。')
  }
  if (!isDemoState(backup.state)) {
    throw new DemoBackupError('备份文件缺少必需业务数据。')
  }
  return structuredClone(backup.state)
}
