import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { App } from '../../App'
import { LocalDemoRepository } from '../../data/LocalDemoRepository'
import { createWorkspaceStore, type WorkspaceStore } from '../workspace/workspaceStore'

/**
 * 结项中心的界面契约。
 *
 * 守三条：门禁不能跳步、聊天截图不能替代正式邮件、工作台不搬文件。
 * 这三条在界面上说不清，PM 就会以为点了按钮文件就归档了。
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

function renderCloseout() {
  store = createWorkspaceStore(new LocalDemoRepository(memoryStorage()))
  const user = userEvent.setup()
  render(<App store={store} />)
  return { user }
}

async function goto(user: ReturnType<typeof userEvent.setup>) {
  const nav = screen.getByLabelText('全局导航')
  await user.click(within(nav).getByRole('button', { name: /结项中心/ }))
}

const caseOf = (id: string) => store.getState().demo.closeoutCases.find((entry) => entry.id === id)!

beforeEach(() => {
  window.location.hash = ''
})

describe('首次打开就有密度', () => {
  it('项目列表、门禁链、门禁详情与出账资料包同屏可见', async () => {
    const { user } = renderCloseout()
    await goto(user)

    expect(screen.getByLabelText('结项项目')).toBeInTheDocument()
    expect(screen.getByLabelText('结项门禁')).toBeInTheDocument()
    expect(screen.getByLabelText('出账资料包')).toBeInTheDocument()
    expect(screen.getByText('结项门禁链')).toBeInTheDocument()
  })

  it('五道门禁的状态一眼可见，不用点进去才知道做不了', async () => {
    const { user } = renderCloseout()
    await goto(user)

    // 只看门禁链本身，详情区的同名标签不算
    const track = screen.getByLabelText('结项门禁').querySelector('.gp-gate-track')!
    expect(within(track as HTMLElement).getByText('全部资产验收')).toBeInTheDocument()
    expect(within(track as HTMLElement).getByText('IT 剪切备份')).toBeInTheDocument()
    // CO-011 卡在 IT 备份：出账那格显示前置未完成，且当前门槛只有一个
    expect(within(track as HTMLElement).getAllByText('前置未完成')).toHaveLength(1)
    expect(within(track as HTMLElement).getAllByText('当前门槛')).toHaveLength(1)
  })
})

describe('门禁不能跳步', () => {
  it('还有阶段没验收的项目，第一道门禁就说清还差几个', async () => {
    const { user } = renderCloseout()
    await goto(user)
    await user.click(within(screen.getByLabelText('结项项目')).getByText(/NST_A_3D_B24/))

    const main = screen.getByLabelText('结项门禁')
    expect(within(main).getByText(/还差 \d+ 个阶段/)).toBeInTheDocument()
  })

  it('资产验收这一步不给手工打勾的入口', async () => {
    const { user } = renderCloseout()
    await goto(user)
    await user.click(within(screen.getByLabelText('结项门禁')).getByText('全部资产验收'))

    const main = screen.getByLabelText('结项门禁')
    expect(within(main).getAllByText(/不能手工打勾/).length).toBeGreaterThan(0)
    expect(within(main).queryByRole('button', { name: /完成「全部资产验收」/ })).toBeNull()
  })

  it('点被挡住的门禁只会看到原因，不会看到可用的完成按钮', async () => {
    const { user } = renderCloseout()
    await goto(user)
    await user.click(within(screen.getByLabelText('结项门禁')).getByText('通知 BD 出账'))

    const main = screen.getByLabelText('结项门禁')
    expect(within(main).getByText('这一步现在做不了')).toBeInTheDocument()
    expect(within(main).getByText(/「IT 剪切备份」尚未完成/)).toBeInTheDocument()
    expect(within(main).queryByRole('button', { name: /完成（被阻断）/ })).toBeNull()
  })
})

describe('证据类型门禁', () => {
  it('聊天截图作为 IT 备份证据会被拒绝，并说明为什么', async () => {
    const { user } = renderCloseout()
    await goto(user)

    const main = screen.getByLabelText('结项门禁')
    await user.selectOptions(within(main).getByLabelText('证据类型'), 'screenshot')
    await user.type(within(main).getByLabelText('邮件主题或路径'), 'wechat_20260727.png')

    expect(within(main).getByText(/必须有正式邮件回执/)).toBeInTheDocument()
    expect(within(main).getByRole('button', { name: /完成（被阻断）/ })).toBeDisabled()
  })

  it('换成正式邮件就能完成，状态推进到可出账', async () => {
    const { user } = renderCloseout()
    await goto(user)

    const main = screen.getByLabelText('结项门禁')
    await user.type(within(main).getByLabelText('邮件主题或路径'), 'RE: AUR_A_3D_B11 备份完成')
    await user.click(within(main).getByRole('button', { name: /完成「IT 剪切备份」/ }))

    expect(caseOf('CO-011').status).toBe('ReadyToBill')
  })

  it('没填证据时按钮禁用，并提示先填', async () => {
    const { user } = renderCloseout()
    await goto(user)

    const main = screen.getByLabelText('结项门禁')
    const button = within(main).getByRole('button', { name: /完成（被阻断）/ })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', '先填邮件主题或路径')
  })
})

describe('出账资料包', () => {
  it('缺 IT 回执时明说资料不齐', async () => {
    const { user } = renderCloseout()
    await goto(user)

    const billing = screen.getByLabelText('出账资料包')
    expect(within(billing).getByText('资料还不齐，不能通知 BD')).toBeInTheDocument()
    expect(within(billing).getByText(/缺 IT 备份完成回执/)).toBeInTheDocument()
  })

  it('IT 回执登记后资料齐全，并列出首次报价金额', async () => {
    const { user } = renderCloseout()
    await goto(user)

    const main = screen.getByLabelText('结项门禁')
    await user.type(within(main).getByLabelText('邮件主题或路径'), 'RE: 备份完成')
    await user.click(within(main).getByRole('button', { name: /完成「IT 剪切备份」/ }))

    const billing = screen.getByLabelText('出账资料包')
    expect(within(billing).getByText('资料齐全')).toBeInTheDocument()
    expect(within(billing).getByText(/首次报价 Q-018/)).toBeInTheDocument()
    // 明细行与合计都是 ¥20,000（该项目只有一张报价）
    expect(within(billing).getAllByText('¥ 20,000')).toHaveLength(2)
  })
})

describe('通知 BD 与归档', () => {
  it('通知 BD 只生成草稿，界面上没有「已发送」', async () => {
    const { user } = renderCloseout()
    await goto(user)

    const main = screen.getByLabelText('结项门禁')
    await user.type(within(main).getByLabelText('邮件主题或路径'), 'RE: 备份完成')
    await user.click(within(main).getByRole('button', { name: /完成「IT 剪切备份」/ }))

    const next = screen.getByLabelText('结项门禁')
    await user.type(within(next).getByLabelText('邮件主题或路径'), '【可出账】AUR_A_3D_B11')
    await user.click(within(next).getByRole('button', { name: /完成「通知 BD 出账」/ }))

    expect(caseOf('CO-011').status).toBe('BillingNotified')
    const drafts = screen.getByLabelText('通知草稿')
    expect(within(drafts).getAllByText(/待发出/).length).toBeGreaterThan(0)
    expect(within(drafts).getByText(/不发送邮件/)).toBeInTheDocument()
    expect(within(drafts).queryByText('已发送')).toBeNull()
  })

  it('归档是收到出账回执后的独立一步，不随通知自动发生', async () => {
    const { user } = renderCloseout()
    await goto(user)

    const main = screen.getByLabelText('结项门禁')
    await user.type(within(main).getByLabelText('邮件主题或路径'), 'RE: 备份完成')
    await user.click(within(main).getByRole('button', { name: /完成「IT 剪切备份」/ }))
    const next = screen.getByLabelText('结项门禁')
    await user.type(within(next).getByLabelText('邮件主题或路径'), '【可出账】AUR_A_3D_B11')
    await user.click(within(next).getByRole('button', { name: /完成「通知 BD 出账」/ }))

    // 通知之后还没归档
    expect(caseOf('CO-011').status).toBe('BillingNotified')
    await user.click(screen.getByRole('button', { name: '收到出账回执，归档项目' }))
    expect(caseOf('CO-011').status).toBe('Archived')
  })
})

describe('退回门禁', () => {
  it('退回客户确认会连带作废它后面的门禁', async () => {
    const { user } = renderCloseout()
    await goto(user)
    await user.click(within(screen.getByLabelText('结项门禁')).getByText('客户最终确认'))

    const main = screen.getByLabelText('结项门禁')
    expect(within(main).getByText(/退回会连带作废它后面的所有门禁/)).toBeInTheDocument()
    await user.click(within(main).getByRole('button', { name: '退回这一步' }))

    expect(caseOf('CO-011').status).toBe('AwaitingCustomerFinal')
    expect(
      caseOf('CO-011').gates.find((gate) => gate.code === 'client-final')!.completedAt,
    ).toBeUndefined()
  })
})

describe('工作台不搬文件', () => {
  it('路径索引明说只登记不移动', async () => {
    const { user } = renderCloseout()
    await goto(user)

    const main = screen.getByLabelText('结项门禁')
    expect(within(main).getByText(/不复制、不移动、不删除任何真实文件/)).toBeInTheDocument()
    expect(within(main).getByText('\\\\ARCHIVE\\2026\\AUR_A_3D_B11')).toBeInTheDocument()
  })

  it('IT 备份这一步写明真实操作由 IT 完成', async () => {
    const { user } = renderCloseout()
    await goto(user)
    expect(screen.getByText(/工作台不执行剪切备份/)).toBeInTheDocument()
  })
})
