import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { App } from '../../App'
import { LocalDemoRepository } from '../../data/LocalDemoRepository'
import { KNOWN_LIMITS, dataScale } from '../../domain/settings'
import { createWorkspaceStore, type WorkspaceStore } from '../workspace/workspaceStore'

/**
 * 设置中心的界面契约。
 *
 * 最重要的一条：**填进去的 API Key 不许出现在前端任何地方**。
 * 这条不是靠文案保证的——测试会在整个 state 里搜那串 Key。
 */

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  }
}

const REAL_KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789'

let store: WorkspaceStore
let storage: ReturnType<typeof memoryStorage>

function renderSettings() {
  storage = memoryStorage()
  store = createWorkspaceStore(new LocalDemoRepository(storage))
  const user = userEvent.setup()
  render(<App store={store} />)
  return { user }
}

async function goto(user: ReturnType<typeof userEvent.setup>) {
  const nav = screen.getByLabelText('全局导航')
  await user.click(within(nav).getByRole('button', { name: /设置中心/ }))
}

/** 导航按钮上带「未接入」「待定」之类的徽标，所以按前缀匹配。 */
async function section(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(
    within(screen.getByLabelText('设置分组')).getByRole('button', { name: new RegExp(`^${label}`) }),
  )
}

beforeEach(() => {
  window.location.hash = ''
})

describe('首次打开就有密度', () => {
  it('分组导航、主区与安全边界同屏可见，默认落在 LLM 供应商', async () => {
    const { user } = renderSettings()
    await goto(user)

    expect(screen.getByLabelText('设置分组')).toBeInTheDocument()
    expect(screen.getByLabelText('设置内容')).toBeInTheDocument()
    expect(screen.getByLabelText('安全边界')).toBeInTheDocument()
    expect(screen.getByLabelText('供应商预设')).toBeInTheDocument()
  })

  it('六个供应商预设都列出来，地址与模型预填', async () => {
    const { user } = renderSettings()
    await goto(user)

    const table = screen.getByLabelText('供应商预设')
    expect(within(table).getAllByRole('row')).toHaveLength(7) // 表头 + 六个预设
    expect(within(table).getByText('https://api.anthropic.com/v1')).toBeInTheDocument()
    expect(within(table).getByText('claude-sonnet-5')).toBeInTheDocument()
  })
})

describe('API Key 不落前端', () => {
  it('填进去的 Key 在整个 state 与 localStorage 里都搜不到', async () => {
    const { user } = renderSettings()
    await goto(user)

    await user.click(screen.getByRole('button', { name: '替换 Key' }))
    await user.type(screen.getByLabelText('API Key'), REAL_KEY)
    await user.click(screen.getByRole('button', { name: '提交到服务端密钥库' }))

    expect(JSON.stringify(store.getState())).not.toContain(REAL_KEY)
    expect(storage.getItem('gamepmer.web-demo.v7') ?? '').not.toContain(REAL_KEY)
    // 只留后 4 位
    expect(JSON.stringify(store.getState().demo.auditEvents)).toContain('••••6789')
  })

  it('输入框是密码类型，不会被肩窥或截图带走', async () => {
    const { user } = renderSettings()
    await goto(user)
    await user.click(screen.getByRole('button', { name: '替换 Key' }))

    expect(screen.getByLabelText('API Key')).toHaveAttribute('type', 'password')
  })

  it('Key 太短或带空格时提交被阻断，并说清原因', async () => {
    const { user } = renderSettings()
    await goto(user)

    await user.click(screen.getByRole('button', { name: '替换 Key' }))
    await user.type(screen.getByLabelText('API Key'), 'sk-短')

    expect(screen.getByText(/Key 太短/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '提交到服务端密钥库' })).toBeDisabled()
  })

  it('边界表把 Key 去向逐条写清楚', async () => {
    const { user } = renderSettings()
    await goto(user)

    const side = screen.getByLabelText('安全边界')
    expect(within(side).getByText('内网服务端密钥库')).toBeInTheDocument()
    expect(within(side).getByText('仅后 4 位，用于识别')).toBeInTheDocument()
    expect(within(side).getByText('无（只写不读）')).toBeInTheDocument()
  })
})

describe('用途分档', () => {
  it('五个用途各一行，便宜档与中档分开', async () => {
    const { user } = renderSettings()
    await goto(user)

    const table = screen.getByLabelText('用途分配')
    expect(within(table).getAllByRole('row')).toHaveLength(6)
    expect(within(table).getAllByText(/claude-haiku-4-5/).length).toBe(2)
    expect(within(table).getAllByText(/claude-sonnet-5/).length).toBe(3)
  })

  it('标出每档的价格，看得出为什么要分档', async () => {
    const { user } = renderSettings()
    await goto(user)

    const table = screen.getByLabelText('用途分配')
    expect(within(table).getAllByText(/每百万 token/).length).toBeGreaterThan(0)
  })
})

describe('连接器如实标注审批门槛', () => {
  it('零审批的已接入，需管理员的没接入且给了替代路径', async () => {
    const { user } = renderSettings()
    await goto(user)
    await section(user, '连接器')

    const list = screen.getByLabelText('连接器状态')
    expect(within(list).getAllByText('零审批')).toHaveLength(4)
    expect(within(list).getAllByText('需企业管理员')).toHaveLength(2)
    expect(within(list).getAllByText(/替代路径：/).length).toBeGreaterThan(0)
  })

  it('公司邮箱区分本人授权与全公司授权', async () => {
    const { user } = renderSettings()
    await goto(user)
    await section(user, '连接器')

    const list = screen.getByLabelText('连接器状态')
    expect(within(list).getByText('本人可授权')).toBeInTheDocument()
    expect(within(list).getByText(/读全公司邮箱需管理员同意/)).toBeInTheDocument()
  })
})

describe('组织与业务规则', () => {
  it('按角色列成员，并点名兼多角的人', async () => {
    const { user } = renderSettings()
    await goto(user)
    await section(user, '成员与角色')

    expect(screen.getByLabelText('成员与角色')).toBeInTheDocument()
    // Leo 在角色表和兼职说明里都出现，这里看的是兼职说明那条
    const merge = document.querySelector('.gp-merge-note') as HTMLElement
    expect(within(merge).getByText(/Leo/)).toBeInTheDocument()
    expect(within(merge).getByText(/只需确认一次/)).toBeInTheDocument()
  })

  it('制作组容量写明是跨项目共享', async () => {
    const { user } = renderSettings()
    await goto(user)
    await section(user, '成员与角色')

    expect(screen.getByText(/跨项目共享资源/)).toBeInTheDocument()
  })

  it('业务规则里的编号规范与解析器是同一份', async () => {
    const { user } = renderSettings()
    await goto(user)
    await section(user, '业务规则')

    expect(screen.getByText('客户代号_项目代号_2D|3D_批次号')).toBeInTheDocument()
    expect(screen.getByText('NST_A_3D_B24')).toBeInTheDocument()
    expect(screen.getByText(/同一份解析规则/)).toBeInTheDocument()
  })

  it('工作日历列出公司休息日', async () => {
    const { user } = renderSettings()
    await goto(user)
    await section(user, '业务规则')

    expect(screen.getByText(/2026-08-05/)).toBeInTheDocument()
  })
})

describe('运维', () => {
  it('如实说明当前是演示环境、没有真实凭证', async () => {
    const { user } = renderSettings()
    await goto(user)
    await section(user, '数据与运维')

    expect(screen.getByText(/不要拿真实客户或公司数据测试/)).toBeInTheDocument()
    expect(screen.getByText(/尚无多用户与访问控制/)).toBeInTheDocument()
  })

  /**
   * 运维页最容易变成一段自我表扬。这条测试盯的是它把没做完的事逐条摆出来，
   * 而且数字取自真实 state——写死的 8 条限制和写死的项目数一样没有意义。
   */
  it('运维页逐条列出已知限制，规模数字取自真实数据', async () => {
    const { user } = renderSettings()
    await goto(user)
    await section(user, '数据与运维')

    const main = screen.getByLabelText('设置内容')
    for (const limit of KNOWN_LIMITS) {
      expect(within(main).getByText(limit.item)).toBeInTheDocument()
    }

    const state = store.getState().demo
    const scale = dataScale(state)
    expect(scale.find((entry) => entry.label === '项目')?.count).toBe(state.projects.length)
    expect(within(main).getByText('审计事件')).toBeInTheDocument()
  })

  it('恢复示例数据在这里也能触发', async () => {
    const { user } = renderSettings()
    await goto(user)
    await section(user, '数据与运维')

    const main = screen.getByLabelText('设置内容')
    await user.click(within(main).getByRole('button', { name: '恢复示例数据' }))
    expect(store.getState().demo.projects.length).toBeGreaterThan(0)
  })
})
