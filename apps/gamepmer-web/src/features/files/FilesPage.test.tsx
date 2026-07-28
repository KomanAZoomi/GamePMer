import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { App } from '../../App'
import { LocalDemoRepository } from '../../data/LocalDemoRepository'
import { createWorkspaceStore, type WorkspaceStore } from '../workspace/workspaceStore'

/**
 * 文件与归档的界面契约。
 *
 * 三条：路径只挂批次不挂阶段、手工填写并保存、删除只删索引不动盘上的文件。
 */

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  }
}

let store: WorkspaceStore

function renderFiles() {
  store = createWorkspaceStore(new LocalDemoRepository(memoryStorage()))
  const user = userEvent.setup()
  render(<App store={store} />)
  return { user }
}

async function goto(user: ReturnType<typeof userEvent.setup>) {
  const nav = screen.getByLabelText('全局导航')
  await user.click(within(nav).getByRole('button', { name: /文件与归档/ }))
}

const pathOf = (code: string, kind: string) =>
  store.getState().demo.projectPaths.find((e) => e.projectCode === code && e.kind === kind)

beforeEach(() => {
  window.location.hash = ''
})

describe('首次打开就有密度', () => {
  it('批次列表、路径登记表与编号解析同屏可见', async () => {
    const { user } = renderFiles()
    await goto(user)

    expect(screen.getByLabelText('批次')).toBeInTheDocument()
    expect(screen.getByLabelText('路径登记')).toBeInTheDocument()
    expect(screen.getByLabelText('批次详情')).toBeInTheDocument()
    expect(screen.getByLabelText('盘位路径')).toBeInTheDocument()
  })

  it('边界说明写明路径只挂批次、工作台不搬文件', async () => {
    const { user } = renderFiles()
    await goto(user)

    expect(screen.getByText(/只挂在批次上，不挂到阶段/)).toBeInTheDocument()
    expect(screen.getByText(/不复制、不移动、不删除/)).toBeInTheDocument()
  })

  it('六个盘位都列出来，没登记的也占一行', async () => {
    const { user } = renderFiles()
    await goto(user)

    const table = screen.getByLabelText('盘位路径')
    for (const label of ['反馈盘', '制作盘', '提交盘', '最终包', '参考资料']) {
      expect(within(table).getByText(label)).toBeInTheDocument()
    }
    expect(within(table).getAllByText('还没登记').length).toBeGreaterThan(0)
  })
})

describe('批次编号解析', () => {
  it('四段拆开显示', async () => {
    const { user } = renderFiles()
    await goto(user)

    const detail = screen.getByLabelText('批次详情')
    expect(within(detail).getByText('NST')).toBeInTheDocument()
    expect(within(detail).getByText('3D')).toBeInTheDocument()
    expect(within(detail).getByText('B24')).toBeInTheDocument()
  })
})

describe('手工填写并保存', () => {
  it('登记一条没填过的路径', async () => {
    const { user } = renderFiles()
    await goto(user)
    expect(pathOf('NST_A_3D_B24', 'final')).toBeUndefined()

    const table = screen.getByLabelText('盘位路径')
    const finalRow = within(table).getByText('最终包').closest('tr')!
    await user.click(within(finalRow).getByRole('button', { name: '登记路径' }))

    await user.type(
      within(finalRow).getByLabelText('最终包 路径'),
      '\\\\NAS-ART\\Final\\NST_A_3D_B24\\v1',
    )
    await user.click(within(finalRow).getByRole('button', { name: '保存' }))

    expect(pathOf('NST_A_3D_B24', 'final')?.path).toBe('\\\\NAS-ART\\Final\\NST_A_3D_B24\\v1')
  })

  it('路径不合法时保存被阻断，并说清怎么填', async () => {
    const { user } = renderFiles()
    await goto(user)

    const table = screen.getByLabelText('盘位路径')
    const finalRow = within(table).getByText('最终包').closest('tr')!
    await user.click(within(finalRow).getByRole('button', { name: '登记路径' }))
    await user.type(within(finalRow).getByLabelText('最终包 路径'), 'Final/NST')

    expect(within(finalRow).getByText(/UNC/)).toBeInTheDocument()
    expect(within(finalRow).getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('提供按约定填入，但只是建议，不自动保存', async () => {
    const { user } = renderFiles()
    await goto(user)

    const table = screen.getByLabelText('盘位路径')
    const finalRow = within(table).getByText('最终包').closest('tr')!
    await user.click(within(finalRow).getByRole('button', { name: '登记路径' }))
    await user.click(within(finalRow).getByRole('button', { name: /按约定填入/ }))

    expect(within(finalRow).getByLabelText('最终包 路径')).toHaveValue(
      '\\\\NAS-ART\\Final\\NST_A_3D_B24',
    )
    // 点了填入还没保存
    expect(pathOf('NST_A_3D_B24', 'final')).toBeUndefined()
  })

  it('修改已登记的路径是覆盖，不产生第二条', async () => {
    const { user } = renderFiles()
    await goto(user)

    const table = screen.getByLabelText('盘位路径')
    const row = within(table).getByText('反馈盘').closest('tr')!
    await user.click(within(row).getByRole('button', { name: '修改' }))

    const input = within(row).getByLabelText('反馈盘 路径')
    await user.clear(input)
    await user.type(input, '\\\\NAS2\\Feedback\\NST_A_3D_B24')
    await user.click(within(row).getByRole('button', { name: '保存' }))

    const all = store
      .getState()
      .demo.projectPaths.filter((e) => e.projectCode === 'NST_A_3D_B24' && e.kind === 'feedback')
    expect(all).toHaveLength(1)
    expect(all[0].path).toBe('\\\\NAS2\\Feedback\\NST_A_3D_B24')
  })
})

describe('复制与删除', () => {
  it('已登记的路径给复制按钮，而不是一个打不开的链接', async () => {
    const { user } = renderFiles()
    await goto(user)

    const table = screen.getByLabelText('盘位路径')
    const row = within(table).getByText('反馈盘').closest('tr')!
    expect(within(row).getByRole('button', { name: '复制路径' })).toBeEnabled()
    // 不给 <a href="file://">——浏览器打不开，那就是个假控件
    expect(within(row).queryByRole('link')).toBeNull()
  })

  it('说明为什么是复制而不是直接打开', async () => {
    const { user } = renderFiles()
    await goto(user)
    expect(screen.getByText(/浏览器出于安全限制/)).toBeInTheDocument()
    expect(screen.getByText(/盘上的文件不受任何影响/)).toBeInTheDocument()
  })

  it('删除登记只删索引', async () => {
    const { user } = renderFiles()
    await goto(user)

    const table = screen.getByLabelText('盘位路径')
    const row = within(table).getByText('参考资料').closest('tr')!
    await user.click(within(row).getByRole('button', { name: '删除登记' }))

    expect(pathOf('NST_A_3D_B24', 'reference')).toBeUndefined()
    // 项目本身一动没动
    expect(store.getState().demo.projects.find((p) => p.code === 'NST_A_3D_B24')).toBeTruthy()
  })
})

describe('批次切换', () => {
  it('切到只登记了一半的批次，右侧列出还差哪几个', async () => {
    const { user } = renderFiles()
    await goto(user)
    await user.click(within(screen.getByLabelText('批次')).getByText('NPC 服装套装'))

    const detail = screen.getByLabelText('批次详情')
    expect(within(detail).getByText(/还差 4 个盘位没登记/)).toBeInTheDocument()
    expect(within(detail).getByText('最终包')).toBeInTheDocument()
  })

  it('还没建项但已报价的批次也能先占盘', async () => {
    const { user } = renderFiles()
    await goto(user)

    const list = screen.getByLabelText('批次')
    expect(within(list).getAllByText('尚未建项（报价中）').length).toBeGreaterThan(0)
  })
})
