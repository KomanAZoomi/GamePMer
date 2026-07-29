import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { App } from '../../App'
import { LocalDemoRepository } from '../../data/LocalDemoRepository'
import { createWorkspaceStore, type WorkspaceStore } from '../../features/workspace/workspaceStore'

/**
 * 顶栏搜索。
 *
 * 这一组测试守的是它**真的接上了**——验收时这里是个能打字但什么都不接的空壳。
 * 所以每条断言都落在「打进去之后发生了什么」，而不是「输入框存在」。
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

function renderApp() {
  store = createWorkspaceStore(new LocalDemoRepository(memoryStorage()))
  return { user: userEvent.setup(), ...render(<App store={store} />) }
}

const box = () => screen.getByRole('combobox')
const panel = () => screen.getByRole('listbox', { name: '搜索结果' })

beforeEach(() => {
  window.location.hash = ''
})

describe('全局搜索接上了', () => {
  it('输入框受控——打进去的字留得住', async () => {
    const { user } = renderApp()
    await user.type(box(), 'MECH-01')
    expect(box()).toHaveValue('MECH-01')
  })

  it('打两个字就出结果面板', async () => {
    const { user } = renderApp()
    await user.type(box(), 'MECH')

    const options = within(panel()).getAllByRole('option')
    expect(options.length).toBeGreaterThan(0)
    expect(within(panel()).getAllByText(/MECH-01/).length).toBeGreaterThan(0)
  })

  it('一个字符不检索，并说清为什么', async () => {
    const { user } = renderApp()
    await user.type(box(), 'M')

    expect(within(panel()).queryAllByRole('option')).toHaveLength(0)
    expect(within(panel()).getByText(/再多打一个字/)).toBeInTheDocument()
  })

  it('搜不到时如实说没有，并列出搜索覆盖哪些类型', async () => {
    const { user } = renderApp()
    await user.type(box(), 'zzzz不存在')

    expect(within(panel()).getByText(/没有匹配的记录/)).toBeInTheDocument()
    expect(within(panel()).getByText(/不按人名检索/)).toBeInTheDocument()
  })

  it('每条结果都标了类型和命中的字段', async () => {
    const { user } = renderApp()
    await user.type(box(), 'NST_A_3D_B24')

    const first = within(panel()).getAllByRole('option')[0]
    expect(within(first).getByText('项目')).toBeInTheDocument()
    expect(within(first).getByText(/命中 批次编号/)).toBeInTheDocument()
  })
})

describe('点开结果', () => {
  it('资产：跳到项目总览并选中它所属的项目', async () => {
    const { user } = renderApp()
    await user.type(box(), 'MECH-01')
    await user.click(within(panel()).getAllByRole('option')[0])

    expect(window.location.hash).toBe('#/projects')
    expect(store.getState().selectedProjectCode).toBe('NST_A_3D_B24')
    // 打开之后面板收起、查询清空——不然它会一直挡着刚跳过去的页面
    expect(box()).toHaveValue('')
    expect(screen.queryByRole('listbox', { name: '搜索结果' })).not.toBeInTheDocument()
  })

  it('反馈：跳到反馈中心并选中那一条反馈项', async () => {
    const { user } = renderApp()
    await user.type(box(), '缩小肩甲比例')
    await user.click(within(panel()).getAllByRole('option')[0])

    expect(window.location.hash).toBe('#/feedback')
    expect(store.getState().selectedFeedbackItemId).toBeTruthy()
  })

  it('路径：跳到文件与归档并选中那个批次', async () => {
    const { user } = renderApp()
    const anyPath = store.getState().demo.projectPaths[0]
    await user.type(box(), anyPath.path.slice(-12))

    // 路径片段里常常带着批次编号，项目那条会排更前面——这里要的是路径那条
    const pathHit = within(panel())
      .getAllByRole('option')
      .find((option) => within(option).queryByText('路径'))!
    expect(pathHit).toBeDefined()
    await user.click(pathHit)

    expect(window.location.hash).toBe('#/files')
    expect(store.getState().selectedPathProject).toBe(anyPath.projectCode)
  })
})

describe('键盘可达', () => {
  it('上下键选、回车打开', async () => {
    const { user } = renderApp()
    await user.type(box(), 'MECH')

    const options = within(panel()).getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowDown}')
    expect(within(panel()).getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowUp}')
    expect(within(panel()).getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{Enter}')
    expect(window.location.hash).toBe('#/projects')
  })

  it('Esc 关掉面板但不清空已打的字', async () => {
    const { user } = renderApp()
    await user.type(box(), 'MECH')
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox', { name: '搜索结果' })).not.toBeInTheDocument()
    expect(box()).toHaveValue('MECH')
  })

  it('aria 状态跟着走，读屏能知道当前停在哪一条', async () => {
    const { user } = renderApp()
    expect(box()).toHaveAttribute('aria-expanded', 'false')

    await user.type(box(), 'MECH')
    expect(box()).toHaveAttribute('aria-expanded', 'true')
    expect(box().getAttribute('aria-activedescendant')).toBeTruthy()
  })
})

describe('顶栏其余控件', () => {
  /** 原来这里写着「计划在切片 3 一并交付」，但切片 3 早就交付了 */
  it('「手工录入」真的能去候选收件箱，不再是个禁用按钮', async () => {
    const { user } = renderApp()
    await user.click(screen.getByRole('button', { name: '手工录入' }))
    expect(window.location.hash).toBe('#/inbox')
  })
})
