import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { LocalDemoRepository, type StorageLike } from '../../data/LocalDemoRepository'
import { createAcceptanceScenarioState } from '../../data/acceptanceScenario'
import { serializeDemoBackup } from '../../data/demoBackup'
import { createWorkspaceStore } from '../workspace/workspaceStore'
import { DataOpsPanel } from './DataOpsPanel'

function memoryStorage(): StorageLike {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  }
}

function renderPanel() {
  const store = createWorkspaceStore(new LocalDemoRepository(memoryStorage()))
  const user = userEvent.setup()
  render(<DataOpsPanel demo={store.getState().demo} store={store} now="2026-08-04T10:00:00+08:00" />)
  return { store, user }
}

describe('DataOpsPanel', () => {
  it('二次确认后整体载入完整验收场景', async () => {
    const { store, user } = renderPanel()

    await user.click(screen.getByRole('button', { name: '载入完整验收场景' }))
    expect(screen.getByText(/将覆盖当前浏览器中的全部 Demo 数据/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认载入完整验收场景' }))

    expect(store.getState().demo.projects.map((item) => item.code)).toContain('SKF_A_3D_B52')
    expect(screen.getByRole('status')).toHaveTextContent('已载入完整验收场景')
  })

  it('无效导入显示错误且不覆盖当前数据', async () => {
    const { store, user } = renderPanel()
    const before = store.getState().demo.projects.map((item) => item.code)

    await user.upload(screen.getByLabelText('导入 GamePMer JSON 备份'), new File(['not json'], 'broken.json'))

    expect(await screen.findByRole('alert')).toHaveTextContent('文件不是有效的 JSON 备份包')
    expect(store.getState().demo.projects.map((item) => item.code)).toEqual(before)
  })

  it('有效备份在确认后整体替换当前数据', async () => {
    const { store, user } = renderPanel()
    const backup = serializeDemoBackup(createAcceptanceScenarioState(), '2026-08-04T10:00:00+08:00')

    await user.upload(
      screen.getByLabelText('导入 GamePMer JSON 备份'),
      new File([backup], 'acceptance-backup.json', { type: 'application/json' }),
    )

    expect(await screen.findByRole('dialog', { name: '确认导入数据' })).toBeInTheDocument()
    expect(store.getState().demo.projects.map((item) => item.code)).not.toContain('SKF_A_3D_B52')
    await user.click(screen.getByRole('button', { name: '确认导入并替换数据' }))

    expect(store.getState().demo.projects.map((item) => item.code)).toContain('SKF_A_3D_B52')
    expect(screen.getByRole('status')).toHaveTextContent('已载入备份')
  })

  it('导出生成带日期的 JSON 下载', async () => {
    const click = vi.fn()
    const createObjectURL = vi.fn(() => 'blob:backup')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const element = document.createElementNS('http://www.w3.org/1999/xhtml', tag)
      if (tag === 'a') Object.assign(element, { click })
      return element
    }) as typeof document.createElement)
    const { user } = renderPanel()

    await user.click(screen.getByRole('button', { name: '导出当前数据' }))

    expect(createObjectURL).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:backup')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
})
