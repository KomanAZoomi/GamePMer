import { describe, expect, it } from 'vitest'

import { createAcceptanceScenarioState } from './acceptanceScenario'
import { DemoBackupError, importDemoBackup, serializeDemoBackup } from './demoBackup'

describe('Demo JSON 备份包', () => {
  it('导出的备份包可被导入并保留完整场景', () => {
    const state = createAcceptanceScenarioState()
    const raw = serializeDemoBackup(state, '2026-08-04T10:00:00+08:00')

    expect(JSON.parse(raw)).toMatchObject({
      format: 'gamepmer-demo-backup',
      schemaVersion: state.schemaVersion,
      exportedAt: '2026-08-04T10:00:00+08:00',
    })
    expect(importDemoBackup(raw)).toEqual(state)
  })

  it.each([
    ['非 JSON', '{ not json'],
    ['错误格式', JSON.stringify({ format: 'other', schemaVersion: 8, state: {} })],
    ['错误版本', JSON.stringify({ format: 'gamepmer-demo-backup', schemaVersion: 7, state: {} })],
    [
      '缺少集合',
      JSON.stringify({ format: 'gamepmer-demo-backup', schemaVersion: 8, state: { schemaVersion: 8, projects: [] } }),
    ],
  ])('拒绝%s备份包', (_label, raw) => {
    expect(() => importDemoBackup(raw)).toThrow(DemoBackupError)
  })
})
