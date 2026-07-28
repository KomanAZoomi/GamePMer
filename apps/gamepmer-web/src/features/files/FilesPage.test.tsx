import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { App } from '../../App'
import { LocalDemoRepository } from '../../data/LocalDemoRepository'
import { createWorkspaceStore, type WorkspaceStore } from '../workspace/workspaceStore'

/**
 * 文件与归档的界面契约。
 *
 * 最重要的一条：**原文件名永不改写**。命名不规范的文件保留原名进待关联队列，
 * 关联只写索引里的对应关系——盘上的东西一个字符都不动。
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

const entryOf = (id: string) => store.getState().demo.fileIndex.find((e) => e.id === id)!

beforeEach(() => {
  window.location.hash = ''
})

describe('首次打开就有密度', () => {
  it('盘位、文件表、详情与归档批次同屏可见', async () => {
    const { user } = renderFiles()
    await goto(user)

    expect(screen.getByLabelText('盘位')).toBeInTheDocument()
    expect(screen.getByLabelText('文件索引')).toBeInTheDocument()
    expect(screen.getByLabelText('文件详情')).toBeInTheDocument()
    expect(screen.getByLabelText('归档与备份')).toBeInTheDocument()
  })

  it('边界说明常驻页头，不藏在角落', async () => {
    const { user } = renderFiles()
    await goto(user)
    expect(screen.getByText(/不复制、不移动、不删除、不改名/)).toBeInTheDocument()
    expect(screen.getByText('资产名_阶段名_YYYYMMDD_rNN')).toBeInTheDocument()
  })

  it('待确认与无法解析分成两个指标——要采取的动作不同', async () => {
    const { user } = renderFiles()
    await goto(user)
    // 指标卡里各一个；表格里的状态胶囊也叫「待确认」，所以只断言指标区
    const metrics = document.querySelector('.gp-metrics')!
    expect(within(metrics as HTMLElement).getByText('待确认')).toBeInTheDocument()
    expect(within(metrics as HTMLElement).getByText('无法解析')).toBeInTheDocument()
  })
})

describe('命名解析逐段可见', () => {
  it('规范命名分四段标出来', async () => {
    const { user } = renderFiles()
    await goto(user)

    const table = screen.getByLabelText('文件索引')
    // 文件名被拆成四个分色段，每段单独成元素
    expect(within(table).getAllByText('MECH-01').length).toBeGreaterThan(0)
    expect(within(table).getAllByText('低模').length).toBeGreaterThan(0)
    expect(within(table).getAllByText('r02').length).toBeGreaterThan(0)
  })

  it('缺版本号的文件标出「缺版本」，并说明原因', async () => {
    const { user } = renderFiles()
    await goto(user)

    const table = screen.getByLabelText('文件索引')
    await user.click(within(table).getByText('MECH-02_高模_20260727.max'.split('_')[0], { selector: '.gp-seg.is-asset' }))

    const detail = screen.getByLabelText('文件详情')
    expect(within(detail).getByText(/缺版本号，按 r01 待确认/)).toBeInTheDocument()
  })

  it('完全不规范的文件原样显示，四个字段都写「未识别」', async () => {
    const { user } = renderFiles()
    await goto(user)

    const table = screen.getByLabelText('文件索引')
    await user.click(within(table).getByText('机甲主角_最终版本_改过的_v3_ok.fbx'))

    const detail = screen.getByLabelText('文件详情')
    expect(within(detail).getAllByText('未识别')).toHaveLength(4)
    expect(within(detail).getByText(/原文件名已保留/)).toBeInTheDocument()
  })
})

describe('手工关联不改原名', () => {
  it('关联之后盘上的文件名一个字符都没变', async () => {
    const { user } = renderFiles()
    await goto(user)

    const table = screen.getByLabelText('文件索引')
    await user.click(within(table).getByText('机甲主角_最终版本_改过的_v3_ok.fbx'))
    const before = entryOf('FI-0004').fileName

    const detail = screen.getByLabelText('文件详情')
    await user.selectOptions(within(detail).getByLabelText('关联到阶段'), 'MECH-01/3D_LOW')
    await user.click(within(detail).getByRole('button', { name: '确认关联' }))

    expect(entryOf('FI-0004').fileName).toBe(before)
    expect(entryOf('FI-0004').linkedStageId).toBe('MECH-01/3D_LOW')
    expect(screen.getByLabelText('文件详情')).toHaveTextContent('已关联')
  })

  it('没选阶段时确认键禁用', async () => {
    const { user } = renderFiles()
    await goto(user)
    const table = screen.getByLabelText('文件索引')
    await user.click(within(table).getByText('机甲主角_最终版本_改过的_v3_ok.fbx'))

    const detail = screen.getByLabelText('文件详情')
    expect(within(detail).getByRole('button', { name: /确认关联（未选阶段）/ })).toBeDisabled()
  })

  it('解析得出的文件预选建议阶段，并说明依据', async () => {
    const { user } = renderFiles()
    await goto(user)
    const table = screen.getByLabelText('文件索引')
    await user.click(within(table).getByText('MECH-02', { selector: '.gp-seg.is-asset' }))

    const detail = screen.getByLabelText('文件详情')
    expect(within(detail).getByLabelText('关联到阶段')).toHaveValue('MECH-02/3D_HIGH')
    expect(within(detail).getByText(/与 P-3D-024 的正式排期匹配/)).toBeInTheDocument()
  })

  it('忽略要写原因，且不是删除——能退回', async () => {
    const { user } = renderFiles()
    await goto(user)
    const table = screen.getByLabelText('文件索引')
    await user.click(within(table).getByText('机甲主角_最终版本_改过的_v3_ok.fbx'))

    const detail = screen.getByLabelText('文件详情')
    expect(within(detail).getByRole('button', { name: '标记为无关文件' })).toBeDisabled()

    await user.type(within(detail).getByLabelText('忽略原因'), '临时目录下的过程文件')
    await user.click(within(detail).getByRole('button', { name: '标记为无关文件' }))
    expect(entryOf('FI-0004').status).toBe('ignored')
    expect(entryOf('FI-0004').fileName).toBe('机甲主角_最终版本_改过的_v3_ok.fbx')

    await user.click(screen.getByRole('button', { name: '退回待关联' }))
    expect(entryOf('FI-0004').status).toBe('unresolved')
  })
})

describe('盘位筛选', () => {
  it('点盘位只筛显示，不改任何数据', async () => {
    const { user } = renderFiles()
    await goto(user)
    const before = JSON.stringify(store.getState().demo.fileIndex)

    await user.click(within(screen.getByLabelText('盘位')).getByText('反馈盘'))
    expect(JSON.stringify(store.getState().demo.fileIndex)).toBe(before)
    expect(screen.getByLabelText('文件索引')).toHaveTextContent('反馈盘 · 文件索引')
  })
})

describe('归档批次直接读结项案件', () => {
  it('三个结项案件的路径与状态都在，并能跳到结项中心', async () => {
    const { user } = renderFiles()
    await goto(user)

    const archive = screen.getByLabelText('归档与备份')
    expect(within(archive).getAllByText(/P-3D-011/).length).toBeGreaterThan(0)
    expect(within(archive).getByText(/等待 IT 备份回执/)).toBeInTheDocument()
    expect(within(archive).getAllByRole('button', { name: /去结项中心处理/ }).length).toBe(3)
  })

  it('明说真实剪切备份由 IT 执行', async () => {
    const { user } = renderFiles()
    await goto(user)
    expect(screen.getByText(/真实的剪切、备份和权限处理由 IT 执行/)).toBeInTheDocument()
  })
})
