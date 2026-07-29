import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { App } from '../../App'
import { LocalDemoRepository } from '../../data/LocalDemoRepository'
import { createWorkspaceStore, type WorkspaceStore } from '../workspace/workspaceStore'

/**
 * 候选收件箱的界面契约。
 *
 * 这些用例守的不是像素，是**承诺**：没确认之前不许动正式数据、被阻断要说清为什么、
 * 识别不出来不许编。这几条一旦破了，页面看着还挺像，但产品就废了。
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

function renderInbox() {
  store = createWorkspaceStore(new LocalDemoRepository(memoryStorage()))
  const user = userEvent.setup()
  render(<App store={store} />)
  return { user }
}

async function gotoInbox(user: ReturnType<typeof userEvent.setup>) {
  const nav = screen.getByLabelText('全局导航')
  await user.click(within(nav).getByRole('button', { name: /候选收件箱/ }))
}

beforeEach(() => {
  window.location.hash = ''
})

describe('首次打开就有密度', () => {
  it('四个指标、候选列表、识别结果与处理链同屏可见', async () => {
    const { user } = renderInbox()
    await gotoInbox(user)

    expect(screen.getByLabelText('候选记录')).toBeInTheDocument()
    expect(screen.getByLabelText('AI 识别结果')).toBeInTheDocument()
    expect(screen.getByLabelText('候选详情')).toBeInTheDocument()
    expect(screen.getByLabelText('接入来源状态')).toBeInTheDocument()
    expect(screen.getByText('候选处理链')).toBeInTheDocument()
  })

  it('每个字段都带置信度，不是一个笼统的百分比', async () => {
    const { user } = renderInbox()
    await gotoInbox(user)

    const extract = screen.getByLabelText('AI 识别结果')
    expect(within(extract).getByText('关联项目')).toBeInTheDocument()
    expect(within(extract).getByText('97%')).toBeInTheDocument()
    expect(within(extract).getByText('96%')).toBeInTheDocument()
    expect(within(extract).getByText('92%')).toBeInTheDocument()
  })

  it('原始证据与来源哈希一直摆在右侧，确认后仍然能追回去', async () => {
    const { user } = renderInbox()
    await gotoInbox(user)

    const detail = screen.getByLabelText('候选详情')
    expect(within(detail).getByText('原始证据')).toBeInTheDocument()
    expect(within(detail).getByText('review_03.jpg')).toBeInTheDocument()
    expect(within(detail).getByText('来源哈希')).toBeInTheDocument()
  })

  it('AI 的建议明确标注未执行', async () => {
    const { user } = renderInbox()
    await gotoInbox(user)
    expect(screen.getByText(/建议未执行/)).toBeInTheDocument()
  })
})

describe('阻断要说清楚为什么', () => {
  it('缺关联资产的候选：确认按钮禁用，并列出缺哪个字段', async () => {
    const { user } = renderInbox()
    await gotoInbox(user)

    await user.click(screen.getByRole('button', { name: /需补全/ }))
    const list = screen.getByLabelText('候选记录')
    await user.click(within(list).getByText('高模散热口位置需要下移'))

    const detail = screen.getByLabelText('候选详情')
    expect(within(detail).getByText('确认被阻断')).toBeInTheDocument()
    expect(within(detail).getByText(/缺少必填字段「关联资产」/)).toBeInTheDocument()
    expect(within(detail).getByRole('button', { name: /确认（被阻断）/ })).toBeDisabled()
  })

  it('OCR 低置信度的候选：有值也照样阻断，并说出置信度', async () => {
    const { user } = renderInbox()
    await gotoInbox(user)

    await user.click(screen.getByRole('button', { name: /需补全/ }))
    const list = screen.getByLabelText('候选记录')
    await user.click(within(list).getByText(/贴图材质偏灰/))

    const detail = screen.getByLabelText('候选详情')
    expect(within(detail).getByText(/置信度仅 42%/)).toBeInTheDocument()
  })

  /**
   * 原来这条断言的是「报价需求要到切片 5 才有记录可写」。切片 5 早已交付，
   * 阻断理由从「诚实」变成了「过期的谎」——验收时被指出来。
   *
   * 现在挡住它的是真门禁：两个必填字段置信度低于 70%，得 PM 亲自过目。
   */
  it('报价需求只问客户与批次编号，低置信度照旧阻断', async () => {
    const { user } = renderInbox()
    await gotoInbox(user)

    await user.click(screen.getByRole('button', { name: /需补全/ }))
    const list = screen.getByLabelText('候选记录')
    await user.click(within(list).getByText(/新角色 6 套时装需求/))

    // BD 需求阶段项目还不存在，所以这一类根本不问资产和阶段
    const extract = screen.getByLabelText('AI 识别结果')
    expect(within(extract).getByText('批次编号')).toBeInTheDocument()
    expect(within(extract).queryByText('关联资产')).toBeNull()
    expect(within(extract).queryByText('制作阶段')).toBeNull()

    const detail = screen.getByLabelText('候选详情')
    expect(within(detail).getByText(/置信度仅 55%/)).toBeInTheDocument()
    expect(within(detail).queryByText(/切片/)).toBeNull()
    expect(within(detail).getByRole('button', { name: /确认（被阻断）/ })).toBeDisabled()
  })
})

describe('PM 核验后解除阻断', () => {
  it('补全关联资产 → 字段标记为 PM 填写 → 确认键解禁', async () => {
    const { user } = renderInbox()
    await gotoInbox(user)

    await user.click(screen.getByRole('button', { name: /需补全/ }))
    const list = screen.getByLabelText('候选记录')
    await user.click(within(list).getByText('高模散热口位置需要下移'))

    const extract = screen.getByLabelText('AI 识别结果')
    await user.click(within(extract).getByRole('button', { name: '未识别' }))
    await user.selectOptions(screen.getByLabelText('关联资产'), 'MECH-02')
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(within(screen.getByLabelText('AI 识别结果')).getByText('PM 填写')).toBeInTheDocument()
    expect(
      within(screen.getByLabelText('候选详情')).getByRole('button', { name: /确认并创建反馈批次/ }),
    ).toBeEnabled()
  })
})

describe('确认生成正式记录', () => {
  it('确认客户反馈 → 反馈中心多出一个批次，候选指回该记录', async () => {
    const { user } = renderInbox()
    await gotoInbox(user)

    const batchesBefore = store.getState().demo.feedbackBatches.length

    const detail = screen.getByLabelText('候选详情')
    await user.click(within(detail).getByRole('button', { name: /确认并创建反馈批次/ }))

    expect(store.getState().demo.feedbackBatches.length).toBe(batchesBefore + 1)
    const confirmed = store.getState().demo.candidates.find((c) => c.id === 'C-20260727-017')!
    expect(confirmed.status).toBe('Confirmed')
    expect(confirmed.confirmedRecordId).toBeTruthy()

    expect(screen.getByText('已生成正式记录')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '去反馈中心分流' })).toBeInTheDocument()
  })

  it('确认前正式数据一个字节都没变', async () => {
    const { user } = renderInbox()
    await gotoInbox(user)

    const before = JSON.stringify(store.getState().demo.projects)
    const list = screen.getByLabelText('候选记录')
    await user.click(within(list).getByText('MECH-02 高模已完成'))

    // 只是点开看看，什么都没确认
    expect(JSON.stringify(store.getState().demo.projects)).toBe(before)
  })

  it('确认阶段完成 → 阶段推进到已交 PM，基准日期不动', async () => {
    const { user } = renderInbox()
    await gotoInbox(user)

    const list = screen.getByLabelText('候选记录')
    await user.click(within(list).getByText('MECH-02 高模已完成'))

    const stageBefore = store
      .getState()
      .demo.projects.flatMap((p) => p.assets)
      .flatMap((a) => a.stages)
      .find((s) => s.id === 'MECH-02/3D_HIGH')!
    const baseline = [stageBefore.baselineStart, stageBefore.baselineFinish]

    await user.click(
      within(screen.getByLabelText('候选详情')).getByRole('button', { name: /确认并推进阶段/ }),
    )

    const stageAfter = store
      .getState()
      .demo.projects.flatMap((p) => p.assets)
      .flatMap((a) => a.stages)
      .find((s) => s.id === 'MECH-02/3D_HIGH')!
    expect(stageAfter.status).toBe('HandedToPm')
    expect([stageAfter.baselineStart, stageAfter.baselineFinish]).toEqual(baseline)
  })
})

describe('忽略与退回', () => {
  it('忽略候选不改正式数据，且能退回待确认', async () => {
    const { user } = renderInbox()
    await gotoInbox(user)

    const before = JSON.stringify(store.getState().demo.feedbackBatches)
    await user.click(
      within(screen.getByLabelText('候选详情')).getByRole('button', { name: '忽略候选' }),
    )

    expect(JSON.stringify(store.getState().demo.feedbackBatches)).toBe(before)
    expect(store.getState().demo.candidates.find((c) => c.id === 'C-20260727-017')!.status).toBe(
      'Ignored',
    )

    await user.click(screen.getByRole('button', { name: '退回待确认' }))
    expect(store.getState().demo.candidates.find((c) => c.id === 'C-20260727-017')!.status).toBe(
      'NeedsReview',
    )
  })
})

describe('零审批导入', () => {
  it('粘贴文本生成候选，并提取出项目与资产', async () => {
    const { user } = renderInbox()
    await gotoInbox(user)

    await user.click(screen.getByRole('button', { name: /导入候选/ }))
    const panel = screen.getByLabelText('导入候选')
    await user.type(
      within(panel).getByLabelText('原文'),
      '【NST_C_3D_B31】PROP-02 贴图需要重做，金属部分再亮一点。',
    )
    await user.click(within(panel).getByRole('button', { name: '识别并生成候选' }))

    const created = store.getState().demo.candidates.at(-1)!
    expect(created.fields.find((f) => f.key === 'projectCode')?.value).toBe('NST_C_3D_B31')
    expect(created.fields.find((f) => f.key === 'assetId')?.value).toBe('PROP-02')
    expect(screen.getByLabelText('AI 识别结果')).toHaveTextContent('PROP-02 贴图需要重做')
  })

  it('提取不出项目时留空并阻断，不编一个项目号', async () => {
    const { user } = renderInbox()
    await gotoInbox(user)

    await user.click(screen.getByRole('button', { name: /导入候选/ }))
    const panel = screen.getByLabelText('导入候选')
    await user.type(within(panel).getByLabelText('原文'), '辛苦了，这版看着不错。')
    await user.click(within(panel).getByRole('button', { name: '识别并生成候选' }))

    const created = store.getState().demo.candidates.at(-1)!
    expect(created.fields.find((f) => f.key === 'projectCode')?.value).toBeUndefined()
    expect(
      within(screen.getByLabelText('候选详情')).getByRole('button', { name: /确认（被阻断）/ }),
    ).toBeDisabled()
  })

  it('导入面板如实说明哪些渠道要审批、哪些不用', async () => {
    const { user } = renderInbox()
    await gotoInbox(user)

    const connectors = screen.getByLabelText('接入来源状态')
    expect(within(connectors).getByText(/自建应用必须企业管理员创建授权/)).toBeInTheDocument()
    expect(within(connectors).getAllByText('可用').length).toBeGreaterThan(0)
  })
})

/**
 * 报价需求与 IT 回执。
 *
 * 这两类原来被一条「在切片 5 / 切片 6 交付」挡着，而两个切片都早已交付。
 * 这组用例守的是它们真的走得通，并且走到底还能接着办下一步。
 */
describe('报价需求与 IT 回执确认后有正式去处', () => {
  it('核验低置信度字段后，报价需求确认成报价案件并能去派单', async () => {
    const { user } = renderInbox()
    await gotoInbox(user)

    await user.click(screen.getByRole('button', { name: /需补全/ }))
    await user.click(within(screen.getByLabelText('候选记录')).getByText(/新角色 6 套时装需求/))

    // 批次编号是 BD 口头给的，PM 过目一遍：点开分数就是进编辑
    const extract = screen.getByLabelText('AI 识别结果')
    const field = within(extract).getByText('批次编号').closest('.gp-field')!
    await user.click(within(field as HTMLElement).getByRole('button'))
    await user.click(screen.getByRole('button', { name: '保存' }))

    const confirm = within(screen.getByLabelText('候选详情')).getByRole('button', {
      name: /确认并创建报价案件/,
    })
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    const created = store.getState().demo.quoteCases.at(-1)!
    expect(created.status).toBe('DirectorQuoting')
    expect(created.title).toBe('新角色 6 套时装需求（B26 批次）')
    // 提议的批次编号，此刻还不是正式项目
    expect(created.projectCode).toBe('NST_A_3D_B26')
    expect(store.getState().demo.projects.some((p) => p.code === 'NST_A_3D_B26')).toBe(false)

    await user.click(screen.getByRole('button', { name: '去报价与变更派给总监' }))
    expect(window.location.hash).toBe('#/quotation')
  })

  it('IT 回执确认后写进结项门禁，并能去通知 BD 出账', async () => {
    const { user } = renderInbox()
    await gotoInbox(user)

    await user.click(within(screen.getByLabelText('候选记录')).getByText(/已完成剪切备份/))
    await user.click(
      within(screen.getByLabelText('候选详情')).getByRole('button', {
        name: /确认并登记 IT 备份回执/,
      }),
    )

    const closeout = store.getState().demo.closeoutCases.find((c) => c.projectCode === 'AUR_A_3D_B11')!
    const gate = closeout.gates.find((entry) => entry.code === 'it-backup')!
    expect(gate.completedAt).toBeTruthy()
    // 证据必须是正式邮件，聊天截图不算——这条规矩不因为证据来自收件箱就松
    expect(gate.evidence.some((entry) => entry.kind === 'email')).toBe(true)

    await user.click(screen.getByRole('button', { name: '去结项中心通知 BD 出账' }))
    expect(window.location.hash).toBe('#/closeout')
  })
})
