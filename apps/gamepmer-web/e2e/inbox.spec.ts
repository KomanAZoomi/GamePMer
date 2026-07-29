import { expect, test } from '@playwright/test'

/**
 * 候选收件箱端到端。
 *
 * 守的是这一页存在的理由：**没确认之前，正式数据一个字节都不许变**。
 * 每条用例都对应五分钟脚本里 PM 会亲手走的一步。
 */

test('首次打开有真实密度，四种候选类型都在', async ({ page }) => {
  await page.goto('/#/inbox')

  await expect(page.getByRole('heading', { name: '候选收件箱' })).toBeVisible()
  await expect(page.getByLabel('候选记录')).toBeVisible()
  await expect(page.getByLabel('AI 识别结果')).toBeVisible()
  await expect(page.getByLabel('候选详情')).toBeVisible()

  // 待确认 + 需补全 + 已处理三个页签都非空
  for (const tab of ['待确认', '需补全', '已处理']) {
    await page.getByRole('button', { name: new RegExp(tab) }).click()
    await expect(page.getByLabel('候选记录').getByRole('button').first()).toBeVisible()
  }
})

test('每个字段都有独立置信度，不是一个笼统的百分比', async ({ page }) => {
  await page.goto('/#/inbox')
  const extract = page.getByLabel('AI 识别结果')

  await expect(extract.getByText('关联项目')).toBeVisible()
  await expect(extract.getByRole('button', { name: 'NST_A_3D_B24' })).toBeVisible()
  await expect(extract.getByText('97%')).toBeVisible()
  await expect(extract.getByText('96%')).toBeVisible()
  await expect(extract.getByText('92%').first()).toBeVisible()
  // 每个字段还要能看到它是从原文哪一段推出来的
  await expect(extract.getByText(/Highpoly/).first()).toBeVisible()
})

test('缺必填字段时确认被阻断，并指名道姓说缺哪个', async ({ page }) => {
  await page.goto('/#/inbox')
  await page.getByRole('button', { name: /需补全/ }).click()
  await page.getByLabel('候选记录').getByText('高模散热口位置需要下移').click()

  const detail = page.getByLabel('候选详情')
  await expect(detail.getByText('确认被阻断')).toBeVisible()
  await expect(detail.getByText(/缺少必填字段「关联资产」/)).toBeVisible()
  await expect(detail.getByRole('button', { name: /确认（被阻断）/ })).toBeDisabled()
})

test('OCR 低置信度即使有值也阻断，并说出具体数字', async ({ page }) => {
  await page.goto('/#/inbox')
  await page.getByRole('button', { name: /需补全/ }).click()
  await page.getByLabel('候选记录').getByText(/贴图材质偏灰/).click()

  await expect(page.getByLabel('候选详情').getByText(/置信度仅 42%/)).toBeVisible()
})

/**
 * 原来这条断言的是「报价需求要到切片 5 才有记录可写」。切片 5 早已交付，
 * 那条阻断从「诚实」变成了「过期的谎」——验收时被指出来。
 * 现在挡住它的是真门禁：必填字段置信度不够，得 PM 亲自过目。
 */
test('低置信度照旧阻断，理由不再引用切片进度', async ({ page }) => {
  await page.goto('/#/inbox')
  await page.getByRole('button', { name: /需补全/ }).click()
  await page.getByLabel('候选记录').getByText(/新角色 6 套时装需求/).click()

  // BD 需求阶段项目还不存在，所以这一类只问客户和批次编号
  // 「批次编号」在阻断说明里也会出现，所以按字段标签定位
  const fields = page.getByLabel('AI 识别结果').locator('.gp-field-label')
  await expect(fields.filter({ hasText: '批次编号' })).toHaveCount(1)
  await expect(fields.filter({ hasText: '关联资产' })).toHaveCount(0)
  await expect(fields.filter({ hasText: '制作阶段' })).toHaveCount(0)

  const detail = page.getByLabel('候选详情')
  await expect(detail.getByText(/置信度仅 55%/)).toBeVisible()
  await expect(detail.getByText(/切片/)).toHaveCount(0)
  await expect(detail.getByRole('button', { name: /确认（被阻断）/ })).toBeDisabled()
})

test('报价需求核验后确认成案件，并能接着去派给总监', async ({ page }) => {
  await page.goto('/#/inbox')
  await page.getByRole('button', { name: /需补全/ }).click()
  await page.getByLabel('候选记录').getByText(/新角色 6 套时装需求/).click()

  // 批次编号是 BD 口头给的，PM 过目一遍
  const field = page.getByLabel('AI 识别结果').locator('.gp-field', { hasText: '批次编号' })
  await field.getByRole('button').first().click()
  await page.getByRole('button', { name: '保存' }).click()

  const detail = page.getByLabel('候选详情')
  await detail.getByRole('button', { name: /确认并创建报价案件/ }).click()
  // 界面上给 PM 看的是中文名，不是内部类型名
  await expect(detail.getByText(/报价案件 · Q-/)).toBeVisible()
  await expect(detail.getByText(/QuoteCase/)).toHaveCount(0)

  await page.getByRole('button', { name: '去报价与变更派给总监' }).click()
  await expect(page).toHaveURL(/#\/quotation/)
  // 建案件不等于报了价：它停在总监报价中，等着录入
  await expect(page.getByText(/新角色 6 套时装需求/).first()).toBeVisible()
})

test('IT 回执确认后结项门禁解锁通知 BD 出账', async ({ page }) => {
  await page.goto('/#/inbox')
  await page.getByLabel('候选记录').getByText(/已完成剪切备份/).click()
  await page
    .getByLabel('候选详情')
    .getByRole('button', { name: /确认并登记 IT 备份回执/ })
    .click()

  await page.getByRole('button', { name: '去结项中心通知 BD 出账' }).click()
  await expect(page).toHaveURL(/#\/closeout/)
  await expect(page.getByText('AUR_A_3D_B11').first()).toBeVisible()
})

test('PM 补全字段后解除阻断，字段标记为人工填写', async ({ page }) => {
  await page.goto('/#/inbox')
  await page.getByRole('button', { name: /需补全/ }).click()
  await page.getByLabel('候选记录').getByText('高模散热口位置需要下移').click()

  const extract = page.getByLabel('AI 识别结果')
  await extract.getByRole('button', { name: '未识别' }).first().click()
  await page.getByLabel('关联资产').selectOption('MECH-02')
  await page.getByRole('button', { name: '保存' }).click()

  await expect(extract.getByText('PM 填写')).toBeVisible()
  await expect(
    page.getByLabel('候选详情').getByRole('button', { name: /确认并创建反馈批次/ }),
  ).toBeEnabled()
})

test('确认客户反馈候选 → 反馈中心多出一个待分流批次', async ({ page }) => {
  await page.goto('/#/inbox')
  await page.getByLabel('候选记录').getByText('高模肩甲比例需要调整').click()
  await page.getByRole('button', { name: /确认并创建反馈批次/ }).click()

  await expect(page.getByRole('heading', { name: '已生成正式记录' })).toBeVisible()

  // 从候选一路点到正式记录
  await page.getByRole('button', { name: '去反馈中心分流' }).click()
  await expect(page.getByLabel('反馈批次').getByText('F-018', { exact: true })).toBeVisible()
})

test('确认阶段完成候选 → 甘特上阶段推进到已交 PM', async ({ page }) => {
  await page.goto('/#/inbox')
  await page.getByLabel('候选记录').getByText('MECH-02 高模已完成').click()
  await page.getByRole('button', { name: /确认并推进阶段/ }).click()
  await expect(page.getByRole('heading', { name: '已生成正式记录' })).toBeVisible()

  await page.goto('/#/projects')
  const gantt = page.getByLabel('项目排期甘特')
  await expect(gantt.getByText('已交 PM').first()).toBeVisible()
})

test('忽略候选不改正式数据，且能退回待确认', async ({ page }) => {
  await page.goto('/#/feedback')
  const batchesBefore = await page.getByLabel('反馈批次').locator('.gp-batch-head strong').count()

  await page.goto('/#/inbox')
  await page.getByLabel('候选记录').getByText('高模肩甲比例需要调整').click()
  await page.getByRole('button', { name: '忽略候选' }).click()
  await expect(page.getByText('忽略原因')).toBeVisible()

  await page.goto('/#/feedback')
  await expect(page.getByLabel('反馈批次').locator('.gp-batch-head strong')).toHaveCount(batchesBefore)

  await page.goto('/#/inbox')
  await page.getByRole('button', { name: /已处理/ }).click()
  // 「已处理」里还有一条自动判重的 Fwd 同名候选，必须精确匹配
  await page.getByLabel('候选记录').getByText('高模肩甲比例需要调整', { exact: true }).click()
  await page.getByRole('button', { name: '退回待确认' }).click()
  await expect(page.getByLabel('候选详情').getByText('等待 PM 确认', { exact: true })).toBeVisible()
})

test('零审批导入：粘贴文本生成候选并提取字段', async ({ page }) => {
  await page.goto('/#/inbox')
  await page.getByRole('button', { name: /导入候选/ }).click()

  const panel = page.getByLabel('导入候选')
  await panel.getByLabel('原文').fill('【NST_C_3D_B31】PROP-02 贴图需要重做，金属部分再亮一点。')
  await panel.getByRole('button', { name: '识别并生成候选' }).click()

  const extract = page.getByLabel('AI 识别结果')
  await expect(extract.getByRole('button', { name: 'NST_C_3D_B31' })).toBeVisible()
  await expect(extract.getByRole('button', { name: 'PROP-02' })).toBeVisible()
  await expect(extract.getByText(/PROP-02 贴图需要重做/).first()).toBeVisible()
})

test('识别不出项目时留空并阻断，不编造项目号', async ({ page }) => {
  await page.goto('/#/inbox')
  await page.getByRole('button', { name: /导入候选/ }).click()

  const panel = page.getByLabel('导入候选')
  await panel.getByLabel('原文').fill('辛苦了，这版看着不错。')
  await panel.getByRole('button', { name: '识别并生成候选' }).click()

  await expect(page.getByLabel('AI 识别结果').getByText('未识别').first()).toBeVisible()
  await expect(
    page.getByLabel('候选详情').getByRole('button', { name: /确认（被阻断）/ }),
  ).toBeDisabled()
})

test('同一段原文导入两次判为重复，不生成第二条待确认', async ({ page }) => {
  const text = '【NST_C_3D_B31】PROP-03 中模已完成，请查收。'
  await page.goto('/#/inbox')

  const importOnce = async () => {
    await page.getByRole('button', { name: /导入候选/ }).click()
    const panel = page.getByLabel('导入候选')
    await panel.getByLabel('原文').fill(text)
    await panel.getByRole('button', { name: '识别并生成候选' }).click()
  }

  await importOnce()
  const reviewCount = await page.getByRole('button', { name: /^待确认 \d+$/ }).innerText()

  await importOnce()
  // 第二次落在「已处理」，待确认数量不变
  await expect(page.getByLabel('候选详情').getByText('重复', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^待确认 \d+$/ })).toHaveText(reviewCount)
})

test('接入来源状态如实说明哪些渠道需要审批', async ({ page }) => {
  await page.goto('/#/inbox')
  const connectors = page.getByLabel('接入来源状态')

  await expect(connectors.getByText(/自建应用必须企业管理员创建授权/)).toBeVisible()
  await expect(connectors.getByText(/读全公司邮箱需管理员同意/)).toBeVisible()
  await expect(connectors.getByText('可用').first()).toBeVisible()
})

test('恢复示例数据把候选状态一并复位', async ({ page }) => {
  await page.goto('/#/inbox')
  await page.getByLabel('候选记录').getByText('高模肩甲比例需要调整').click()
  await page.getByRole('button', { name: /确认并创建反馈批次/ }).click()
  await expect(page.getByRole('heading', { name: '已生成正式记录' })).toBeVisible()

  await page.getByRole('button', { name: '恢复示例数据' }).click()
  await page.goto('/#/inbox')
  await expect(page.getByLabel('候选详情').getByText('等待 PM 确认', { exact: true })).toBeVisible()
})
